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
  @ApiOperation({
    summary: 'EXPLAIN (ANALYZE, BUFFERS) a SELECT query on an owned target',
  })
  async explain(
    @Param('targetId') targetId: string,
    @Body() dto: ExplainQueryDto,
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string },
  ) {
    try {
      const result = await this.liveQuery.explainQuery(targetId, dto.sql, true);
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

  @Get('database')
  @ApiOperation({
    summary: 'Get database-level cumulative statistics (pg_stat_database)',
    description:
      'Commit/rollback ratio, cache hit ratio, temp file usage, deadlocks — one row per database on the server.',
  })
  async databaseStats(@Param('targetId') targetId: string) {
    return this.liveQuery.getDatabaseStats(targetId);
  }

  @Get('io')
  @ApiOperation({
    summary:
      'Get I/O statistics (pg_stat_io on PG16+, pg_statio_user_tables fallback otherwise)',
    description:
      'Breaks down disk reads/writes/extends by backend type and context — shows which process is driving I/O pressure.',
  })
  async ioStats(@Param('targetId') targetId: string) {
    return this.liveQuery.getIoStats(targetId);
  }

  @Get('job-progress')
  @ApiOperation({
    summary: 'Get progress of long-running maintenance operations',
    description:
      'CREATE INDEX, CLUSTER/VACUUM FULL, ANALYZE, and COPY progress — complements the dedicated VACUUM progress endpoint. Each check degrades gracefully on older PostgreSQL versions that lack the relevant progress view.',
  })
  async jobProgress(@Param('targetId') targetId: string) {
    return this.liveQuery.getJobProgress(targetId);
  }

  @Get('health-score')
  @ApiOperation({
    summary: 'Get an aggregate 0-100 health score for this target',
    description:
      'Different from /diagnostics: diagnostics checks whether monitoring CAN work (permissions/connectivity); health-score assesses whether the database IS healthy (bloat, XID age, cache hit ratio, replication lag, connection pool usage, backup freshness).',
  })
  async healthScore(@Param('targetId') targetId: string) {
    return this.liveQuery.getHealthScore(targetId);
  }
}
