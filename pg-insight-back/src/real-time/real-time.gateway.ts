import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Namespace, Socket } from 'socket.io';
import type { AlertTriggerResult } from '../alerts/alert-engine.service';

@WebSocketGateway({
  namespace: '/metrics',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
  },
  pingTimeout: 30000,
  pingInterval: 5000,
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Namespace;

  private readonly clientSubscriptions = new Map<string, Set<string>>();

  constructor(private readonly jwtService: JwtService) {}

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      const token: unknown = socket.handshake.auth?.token;
      if (typeof token !== 'string' || token.length === 0) {
        next(new Error('Unauthorized'));
        return;
      }
      this.jwtService
        .verifyAsync<{ sub: string; role: string }>(token)
        .then((payload) => {
          socket.data.user = { id: payload.sub, role: payload.role };
          next();
        })
        .catch(() => next(new Error('Unauthorized')));
    });
    this.logger.log('🔌 WebSocket Gateway initialized at /metrics');
  }

  handleConnection(client: Socket): void {
    this.clientSubscriptions.set(client.id, new Set());

    this.logger.debug(
      `Client connected: ${client.id} | Total: ${this.server.sockets.size}`,
    );

    client.emit('connected', {
      clientId: client.id,
      timestamp: new Date(),
      message: 'Connected to PG Insight real-time stream',
    });
  }

  handleDisconnect(client: Socket): void {
    this.clientSubscriptions.delete(client.id);

    this.logger.debug(
      `Client disconnected: ${client.id} | Total: ${this.server.sockets.size}`,
    );
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetId: string },
  ): { success: boolean; targetId: string } {
    const { targetId } = data;

    if (!targetId) return { success: false, targetId: '' };

    const roomName = `target:${targetId}`;
    void client.join(roomName);

    const subs = this.clientSubscriptions.get(client.id) ?? new Set();
    subs.add(targetId);
    this.clientSubscriptions.set(client.id, subs);

    this.logger.debug(
      `Client ${client.id.slice(0, 8)} subscribed to target ${targetId.slice(0, 8)}`,
    );

    return { success: true, targetId };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetId: string },
  ): { success: boolean } {
    const roomName = `target:${data.targetId}`;
    void client.leave(roomName);

    const subs = this.clientSubscriptions.get(client.id);
    subs?.delete(data.targetId);

    return { success: true };
  }

  @SubscribeMessage('ping')
  handlePing(): { event: string; data: { ts: string } } {
    return { event: 'pong', data: { ts: new Date().toISOString() } };
  }

  broadcastConnections(
    targetId: string,
    data: {
      total: number;
      active: number;
      idle: number;
      idleInTransaction: number;
      waiting: number;
      maxConnections: number;
      utilizationPct: number;
      timestamp: Date;
    },
  ): void {
    this.toTarget(targetId, 'connections', data);
  }

  broadcastLockAlert(
    targetId: string,
    data: {
      hasBlockers: boolean;
      hasDeadlockRisk: boolean;
      totalWaiting: number;
      blockingChains: unknown[];
      timestamp: Date;
    },
  ): void {
    this.toTarget(targetId, 'lock:alert', {
      ...data,
      severity: data.hasDeadlockRisk ? 'critical' : 'warning',
    });
  }

  broadcastSlowQueries(
    targetId: string,
    data: {
      count: number;
      topSlow: unknown[];
      timestamp: Date;
    },
  ): void {
    this.toTarget(targetId, 'queries:slow', data);
  }

  broadcastTableAlert(
    targetId: string,
    data: {
      type: string;
      tables: unknown[];
      timestamp: Date;
    },
  ): void {
    this.toTarget(targetId, 'table:alert', data);
  }

  broadcastVacuumAlert(
    targetId: string,
    data: {
      type: string;
      maxXidAge: number;
      tables: unknown[];
      timestamp: Date;
    },
  ): void {
    this.toTarget(targetId, 'vacuum:alert', {
      ...data,
      severity: data.maxXidAge > 1_000_000_000 ? 'critical' : 'warning',
    });
  }

  broadcastReplicationAlert(
    targetId: string,
    data: {
      maxLagBytes: number;
      replicas: unknown[];
      timestamp: Date;
    },
  ): void {
    this.toTarget(targetId, 'replication:alert', {
      ...data,
      lagMb: Math.round(data.maxLagBytes / 1024 / 1024),
    });
  }

  broadcastAlertEvaluation(
    targetId: string,
    triggered: AlertTriggerResult[],
  ): void {
    this.toTarget(targetId, 'alert:fired', {
      targetId,
      count: triggered.length,
      alerts: triggered,
      timestamp: new Date(),
    });
  }

  broadcastTargetStatus(
    targetId: string,
    status: 'active' | 'error' | 'connecting',
    message?: string,
  ): void {
    this.toTarget(targetId, 'target:status', {
      targetId,
      status,
      message,
      timestamp: new Date(),
    });

    this.server.emit('target:status', {
      targetId,
      status,
      timestamp: new Date(),
    });
  }

  private toTarget(targetId: string, event: string, data: unknown): void {
    const roomName = `target:${targetId}`;

    if (!this.server.adapter.rooms.get(roomName)?.size) return;

    this.server.to(roomName).emit(event, data);
  }

  getStats() {
    return {
      connectedClients: this.server.sockets.size,
      subscriptions: Array.from(this.clientSubscriptions.entries()).map(
        ([clientId, targets]) => ({
          clientId: clientId.slice(0, 8),
          targets: Array.from(targets),
        }),
      ),
    };
  }
}
