import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  HealthIndicatorFunction,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Pool } from 'pg';
import { PrismaService } from '../database/prisma.service';
import { Public } from '../auth/public.decorator';
import { PLATFORM_POOL } from '../database/token';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
    @Inject(PLATFORM_POOL) private readonly timescalePool: Pool,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness/readiness probe — checks both databases' })
  check() {
    const checkPlatformDb: HealthIndicatorFunction = async () => {
      await this.prisma.$queryRaw`SELECT 1`;
      return { platformDb: { status: 'up' } };
    };
    const checkTimescaleDb: HealthIndicatorFunction = async () => {
      await this.timescalePool.query('SELECT 1');
      return { timescaleDb: { status: 'up' } };
    };
    return this.health.check([checkPlatformDb, checkTimescaleDb]);
  }

  @Public()
  @Get('live')
  @ApiOperation({
    summary: 'Liveness probe only — process is running, no DB check',
  })
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
