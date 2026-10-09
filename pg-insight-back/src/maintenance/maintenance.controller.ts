import { Controller, Post, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { MaintenanceService } from './maintenance.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

const IDENT_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class TableTargetDto {
  @IsString()
  @IsNotEmpty()
  @Matches(IDENT_PATTERN, {
    message: 'schema must be a valid PostgreSQL identifier',
  })
  schema!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(IDENT_PATTERN, {
    message: 'table must be a valid PostgreSQL identifier',
  })
  table!: string;
}

export class IndexTargetDto {
  @IsString()
  @IsNotEmpty()
  @Matches(IDENT_PATTERN, {
    message: 'schema must be a valid PostgreSQL identifier',
  })
  schema!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(IDENT_PATTERN, {
    message: 'index must be a valid PostgreSQL identifier',
  })
  index!: string;
}

@ApiTags('maintenance')
@Controller('maintenance/:targetId')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post('vacuum')
  @ApiOperation({
    summary: 'Run VACUUM (ANALYZE) on a table',
    description:
      'Runs asynchronously — watch the Tables page for updated bloat stats, or the Job Progress page for live status.',
  })
  @ApiParam({ name: 'targetId' })
  async vacuum(
    @Param('targetId') targetId: string,
    @Body() dto: TableTargetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.maintenanceService.vacuumTable(
      targetId,
      dto.schema,
      dto.table,
      user.id,
      user.email,
    );
  }

  @Delete('index')
  @ApiOperation({
    summary: 'Drop an unused index (CONCURRENTLY)',
    description:
      'Re-verifies the index is still unused server-side before dropping. Refuses to drop indexes backing a constraint (primary key / unique).',
  })
  async dropIndex(
    @Param('targetId') targetId: string,
    @Body() dto: IndexTargetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.maintenanceService.dropUnusedIndex(
      targetId,
      dto.schema,
      dto.index,
      user.id,
      user.email,
    );
  }
}
