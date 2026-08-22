import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { LiveQueryService } from './live-query.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { truncateForAudit } from './audit-format.util';

export class ExplainQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  sql!: string;
}

@ApiTags('live')
@Controller('live/:targetId')
export class LiveController {
  constructor(
    private readonly liveQuery: LiveQueryService,
    private readonly audit: AuditService,
  ) {}

  @Get('connections')
  @ApiOperation({
    summary: 'Get current active sessions with filters (paginated)',
  })
  @ApiParam({ name: 'targetId' })
  @ApiQuery({ name: 'minMs', required: false })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max sessions to return, default 200',
  })
  @ApiQuery({ name: 'offset', required: false })
  async connections(
    @Param('targetId') targetId: string,
    @Query('minMs') minMs?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.liveQuery.getConnections(
      targetId,
      minMs ? parseInt(minMs, 10) : 0,
      limit ? parseInt(limit, 10) : 200,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get('queries/slow')
  @ApiOperation({
    summary: 'Get top slow queries from pg_stat_statements (paginated)',
  })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async slowQueries(
    @Param('targetId') targetId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.liveQuery.getSlowQueries(
      targetId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Post('queries/explain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run EXPLAIN (ANALYZE, BUFFERS) on a SELECT query' })
  async explain(
    @Param('targetId') targetId: string,
    @Body() dto: ExplainQueryDto,
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string },
  ) {
    try {
      const result = await this.liveQuery.explainQuery(targetId, dto.sql);
      await this.audit.record({
        action: 'query.explain',
        userId: user.id,
        userEmail: user.email,
        targetId,
        detail: truncateForAudit(dto.sql),
        ipAddress: req.ip,
      });
      return result;
    } catch (error) {
      await this.audit.record({
        action: 'query.explain',
        userId: user.id,
        userEmail: user.email,
        targetId,
        detail: `REJECTED: ${truncateForAudit(dto.sql)}`,
        ipAddress: req.ip,
      });
      throw error;
    }
  }

  @Delete('queries/:pid/cancel')
  @ApiOperation({ summary: 'Cancel a running query by PID' })
  async cancelQuery(
    @Param('targetId') targetId: string,
    @Param('pid', ParseIntPipe) pid: number,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.liveQuery.cancelQuery(targetId, pid);
    await this.audit.record({
      action: 'query.cancel',
      userId: user.id,
      userEmail: user.email,
      targetId,
      detail: `pid=${pid}`,
    });
    return result;
  }

  @Get('locks')
  @ApiOperation({ summary: 'Get lock statistics grouped by mode' })
  async locks(@Param('targetId') targetId: string) {
    return this.liveQuery.getAllLocks(targetId);
  }

  @Get('locks/chains')
  @ApiOperation({ summary: 'Get blocking chains — who is blocking whom' })
  async lockChains(@Param('targetId') targetId: string) {
    return this.liveQuery.getLockChains(targetId);
  }

  @Get('tables')
  @ApiOperation({
    summary: 'Get table & index statistics with recommendations',
  })
  async tables(@Param('targetId') targetId: string) {
    return this.liveQuery.getTableStats(targetId);
  }

  @Get('vacuum/progress')
  @ApiOperation({
    summary: 'Get active vacuum progress and XID wraparound risk',
  })
  async vacuumProgress(@Param('targetId') targetId: string) {
    return this.liveQuery.getVacuumProgress(targetId);
  }

  @Get('replication')
  @ApiOperation({ summary: 'Get replication status — replicas, slots, lag' })
  async replication(@Param('targetId') targetId: string) {
    return this.liveQuery.getReplication(targetId);
  }

  @Get('system')
  @ApiOperation({ summary: 'Get server info, databases, extensions, roles' })
  async system(@Param('targetId') targetId: string) {
    return this.liveQuery.getSystemInfo(targetId);
  }

  @Get('system/settings')
  @ApiOperation({ summary: 'Search pg_settings' })
  @ApiQuery({ name: 'search', required: false })
  async settings(
    @Param('targetId') targetId: string,
    @Query('search') search?: string,
  ) {
    return this.liveQuery.getSettings(targetId, search);
  }

  @Get('diagnostics')
  @ApiOperation({
    summary: 'Run a full diagnostics check against this target',
    description:
      'Checks connectivity, permissions, PostgreSQL version, and extensions. Returns actionable fix commands for anything broken — the self-heal flow for open-source users with differently-configured Postgres instances.',
  })
  async diagnostics(@Param('targetId') targetId: string) {
    return this.liveQuery.getDiagnostics(targetId);
  }
}
