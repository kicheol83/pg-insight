// ══════════════════════════════════════════════════════════════
// src/metrics/metrics.controller.ts
//
// REST API — TimescaleDB'dagi tarixiy metrikalar (collector yozgan)
//   GET /api/v1/metrics/:targetId/dashboard
//   GET /api/v1/metrics/:targetId/connections/trend
//   GET /api/v1/metrics/:targetId/locks/trend
//   GET /api/v1/metrics/:targetId/cache-hit
//   GET /api/v1/metrics/:targetId/table-bloat
//   GET /api/v1/metrics/:targetId/replication
//   GET /api/v1/metrics/:targetId/xid-age
//   GET /api/v1/metrics/:targetId/connections-by-app
//   GET /api/v1/metrics/:targetId/query-volume
// ══════════════════════════════════════════════════════════════

import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MetricsReaderService } from './reader/metrics-reader.service';

@ApiTags('metrics')
@Controller('metrics/:targetId')
export class MetricsController {
  constructor(private readonly reader: MetricsReaderService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard summary — all key metrics at once' })
  @ApiParam({ name: 'targetId' })
  async dashboard(@Param('targetId') targetId: string) {
    return this.reader.getDashboardSummary(targetId);
  }

  @Get('connections/trend')
  @ApiOperation({ summary: 'Get connection count trend over time' })
  @ApiQuery({ name: 'hours', required: false })
  @ApiQuery({
    name: 'bucket',
    required: false,
    description: 'Bucket size in minutes',
  })
  async connectionTrend(
    @Param('targetId') targetId: string,
    @Query('hours') hours?: string,
    @Query('bucket') bucket?: string,
  ) {
    return this.reader.getConnectionTrend(
      targetId,
      hours ? parseInt(hours, 10) : 1,
      bucket ? parseInt(bucket, 10) : 1,
    );
  }

  @Get('locks/trend')
  @ApiOperation({ summary: 'Get lock wait event trend' })
  @ApiQuery({ name: 'hours', required: false })
  async lockTrend(
    @Param('targetId') targetId: string,
    @Query('hours') hours?: string,
  ) {
    return this.reader.getLockTrend(targetId, hours ? parseInt(hours, 10) : 6);
  }

  @Get('cache-hit')
  @ApiOperation({ summary: 'Get buffer cache hit ratio trend' })
  @ApiQuery({ name: 'hours', required: false })
  async cacheHitTrend(
    @Param('targetId') targetId: string,
    @Query('hours') hours?: string,
  ) {
    return this.reader.getCacheHitTrend(
      targetId,
      hours ? parseInt(hours, 10) : 24,
    );
  }

  @Get('table-bloat')
  @ApiOperation({ summary: 'Get tables with highest bloat ratio' })
  async tableBloatTop(@Param('targetId') targetId: string) {
    return this.reader.getTableBloatTop(targetId);
  }

  @Get('replication')
  @ApiOperation({ summary: 'Get replication lag trend' })
  @ApiQuery({ name: 'hours', required: false })
  async replicationTrend(
    @Param('targetId') targetId: string,
    @Query('hours') hours?: string,
  ) {
    return this.reader.getReplicationLagTrend(
      targetId,
      hours ? parseInt(hours, 10) : 6,
    );
  }

  @Get('xid-age')
  @ApiOperation({
    summary: 'Get transaction ID age trend (wraparound tracking)',
  })
  @ApiQuery({ name: 'hours', required: false })
  async xidAgeTrend(
    @Param('targetId') targetId: string,
    @Query('hours') hours?: string,
  ) {
    return this.reader.getXidAgeTrend(
      targetId,
      hours ? parseInt(hours, 10) : 24,
    );
  }

  @Get('connections-by-app')
  @ApiOperation({
    summary: 'Get current connection breakdown by application_name',
  })
  async connectionsByApp(@Param('targetId') targetId: string) {
    return this.reader.getConnectionsByApp(targetId);
  }

  @Get('query-volume')
  @ApiOperation({ summary: 'Get query volume trend over time' })
  @ApiQuery({ name: 'hours', required: false })
  async queryVolume(
    @Param('targetId') targetId: string,
    @Query('hours') hours?: string,
  ) {
    return this.reader.getQueryVolumeTrend(
      targetId,
      hours ? parseInt(hours, 10) : 6,
    );
  }
}
