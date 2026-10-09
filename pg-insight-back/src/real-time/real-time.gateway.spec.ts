jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { RealtimeGateway } from './real-time.gateway';
import { TargetAccessService } from '../auth/target-access.service';

const SECRET = 'test-secret-test-secret-test-secret-123';
const TARGET_ID = '5722600a-0000-4000-8000-000000000000';

const snapshot = {
  total: 10,
  active: 1,
  idle: 9,
  idleInTransaction: 0,
  waiting: 0,
  maxConnections: 100,
  utilizationPct: 10,
  timestamp: new Date(),
};

describe('RealtimeGateway', () => {
  let app: INestApplication;
  let gateway: RealtimeGateway;
  let jwt: JwtService;
  let url: string;
  const clients: Socket[] = [];

  beforeAll(async () => {
    jwt = new JwtService({ secret: SECRET });
    const moduleRef = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: JwtService, useValue: jwt },
        {
          provide: TargetAccessService,
          useValue: {
            canAccess: async (actor: { id: string }, targetId: string) =>
              actor.id === 'user-1' && targetId === TARGET_ID,
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0, '127.0.0.1');

    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}/metrics`;
    gateway = app.get(RealtimeGateway);
  });

  afterEach(() => {
    while (clients.length) clients.pop()!.close();
  });

  afterAll(async () => {
    await app.close();
  });

  function connect(token?: string): Socket {
    const socket = io(url, {
      transports: ['websocket'],
      reconnection: false,
      auth: token === undefined ? {} : { token },
    });
    clients.push(socket);
    return socket;
  }

  function connectError(socket: Socket): Promise<string> {
    return new Promise((resolve, reject) => {
      socket.once('connect_error', (err) => resolve(err.message));
      socket.once('connect', () => reject(new Error('connected')));
    });
  }

  function connected(socket: Socket): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
  }

  async function validToken(): Promise<string> {
    return jwt.signAsync({ sub: 'user-1', email: 'a@b.c', role: 'admin' });
  }

  it('rejects a handshake without a token', async () => {
    await expect(connectError(connect())).resolves.toBe('Unauthorized');
  });

  it('rejects a handshake with a token signed by another secret', async () => {
    const forged = await new JwtService({
      secret: 'another-secret-another-secret-12345',
    }).signAsync({ sub: 'user-1', role: 'admin' });

    await expect(connectError(connect(forged))).resolves.toBe('Unauthorized');
  });

  it('accepts a handshake with a valid token', async () => {
    await expect(
      connected(connect(await validToken())),
    ).resolves.toBeUndefined();
    expect(gateway.getStats().connectedClients).toBe(1);
  });

  it('broadcasts without throwing while a client is connected but not subscribed', async () => {
    const socket = connect(await validToken());
    await connected(socket);
    const received = jest.fn();
    socket.on('connections', received);

    expect(() =>
      gateway.broadcastConnections(TARGET_ID, snapshot),
    ).not.toThrow();

    await new Promise((r) => setTimeout(r, 100));
    expect(received).not.toHaveBeenCalled();
  });

  it('delivers target events to subscribed clients only', async () => {
    const subscriber = connect(await validToken());
    const bystander = connect(await validToken());
    await Promise.all([connected(subscriber), connected(bystander)]);

    await subscriber.emitWithAck('subscribe', { targetId: TARGET_ID });

    const bystanderReceived = jest.fn();
    bystander.on('connections', bystanderReceived);
    const delivered = new Promise<{ total: number }>((resolve) =>
      subscriber.once('connections', resolve),
    );

    gateway.broadcastConnections(TARGET_ID, snapshot);

    await expect(delivered).resolves.toMatchObject({ total: 10 });
    await new Promise((r) => setTimeout(r, 100));
    expect(bystanderReceived).not.toHaveBeenCalled();
  });

  it("refuses to subscribe a client to another tenant's target", async () => {
    const intruder = connect(
      await jwt.signAsync({ sub: 'user-2', email: 'x@y.z', role: 'user' }),
    );
    await connected(intruder);

    const ack = await intruder.emitWithAck('subscribe', {
      targetId: TARGET_ID,
    });
    const received = jest.fn();
    intruder.on('connections', received);

    gateway.broadcastConnections(TARGET_ID, snapshot);

    expect(ack).toEqual({ success: false, targetId: TARGET_ID });
    await new Promise((r) => setTimeout(r, 100));
    expect(received).not.toHaveBeenCalled();
  });
});
