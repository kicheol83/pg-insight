import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsNumber,
  IsOptional,
  IsArray,
  MaxLength,
} from 'class-validator';
import { AlertEngineService } from './alert-engine.service';

const METRIC_NAMES = [
  'connection_utilization_pct',
  'active_queries',
  'idle_in_transaction',
  'waiting_locks',
  'longest_query_ms',
  'blocked_sessions',
  'deadlocks_delta',
  'cache_hit_ratio',
  'replication_lag_bytes',
  'xid_age',
  'table_bloat_ratio',
  'unused_index_size',
  'wal_size_bytes',
  'slow_query_count',
] as const;

export class CreateAlertRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsIn(METRIC_NAMES)
  metric!: string;

  @IsIn(['gt', 'gte', 'lt', 'lte'])
  operator!: 'gt' | 'gte' | 'lt' | 'lte';

  @IsNumber()
  threshold!: number;

  @IsIn(['info', 'warning', 'critical'])
  severity!: 'info' | 'warning' | 'critical';

  @IsOptional()
  @IsNumber()
  cooldownMs?: number;

  @IsOptional()
  @IsArray()
  notifyChannels?: string[];
}

@ApiTags('alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertEngine: AlertEngineService) {}

  @Get(':targetId/rules')
  @ApiOperation({ summary: 'Get all alert rules for a target' })
  @ApiParam({ name: 'targetId' })
 public async getRules(@Param('targetId') targetId: string) {
    return this.alertEngine.getRules(targetId);
  }

  @UseGuards(AdminGuard)
  @Post(':targetId/rules')
  @ApiOperation({ summary: 'Create a new alert rule' })
  public async createRule(
    @Param('targetId') targetId: string,
    @Body() dto: CreateAlertRuleDto,
  ) {
    return this.alertEngine.createRule({
      targetId,
      name: dto.name,
      metric: dto.metric as never,
      operator: dto.operator as never,
      threshold: dto.threshold,
      severity: dto.severity as never,
      cooldownMs: dto.cooldownMs,
      notifyChannels: dto.notifyChannels,
    });
  }

  @UseGuards(AdminGuard)
  @Delete('rules/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an alert rule' })
  public async deleteRule(@Param('id') id: string) {
    return this.alertEngine.deleteRule(id);
  }

  @Get(':targetId/events')
  @ApiOperation({ summary: 'Get alert event history' })
  @ApiQuery({ name: 'limit', required: false })
  public async getEvents(
    @Param('targetId') targetId: string,
    @Query('limit') limit?: string,
  ) {
    return this.alertEngine.getEvents(
      targetId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get(':targetId/events/active')
  @ApiOperation({ summary: 'Get currently active (unresolved) alert events' })
  public async getActiveEvents(@Param('targetId') targetId: string) {
    return this.alertEngine.getActiveEvents(targetId);
  }

  @UseGuards(AdminGuard)
  @Patch('events/:id/ack')
  @ApiOperation({ summary: 'Acknowledge an alert event' })
  public async acknowledge(@Param('id') id: string) {
    return this.alertEngine.acknowledgeEvent(id);
  }
}
