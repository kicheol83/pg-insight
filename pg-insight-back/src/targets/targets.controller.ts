import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TargetsService } from './targets.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AuditService } from '../audit/audit.service';

export class CreateTargetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  host!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  port?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(63)
  database!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(63)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsIn(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'])
  sslMode?:
    'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';

  @IsOptional()
  @IsString()
  sslCert?: string;
}

export class TestConnectionDto {
  @IsString()
  @IsNotEmpty()
  host!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  port?: number;

  @IsString()
  @IsNotEmpty()
  database!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsIn(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'])
  sslMode?: string;
}

export class UpdateTargetDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsIn(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'])
  sslMode?: string;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(60000)
  @Type(() => Number)
  collectionIntervalMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(60000)
  @Type(() => Number)
  slowQueryThresholdMs?: number;
}

@ApiTags('targets')
@Controller('targets')
export class TargetsController {
  constructor(
    private readonly targetsService: TargetsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all monitored PostgreSQL targets',
  })
  @ApiResponse({ status: 200, description: 'List of targets with status' })
  async findAll(@CurrentUser() user: AuthUser) {
    return this.targetsService.findAll(user.id, user.role);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Get single target status' })
  @ApiParam({ name: 'id', description: 'Target UUID' })
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.targetsService.findOne(id, user.id, user.role);
  }

  // POST /targets/test — connection test (SAQLASHDAN OLDIN)
  // :id bo'lmasin deb /test birinchi keladi
  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Test PostgreSQL connection without saving',
  })
  @ApiBody({ type: TestConnectionDto })
  async testConnection(@Body() dto: TestConnectionDto) {
    return this.targetsService.testConnection(dto);
  }

  // POST /targets — create
  @Post()
  @ApiOperation({
    summary: 'Add a new PostgreSQL target',
  })
  @ApiBody({ type: CreateTargetDto })
  @ApiResponse({
    status: 201,
  })
  @ApiResponse({
    status: 400,
  })
  @ApiResponse({ status: 409 })
  async create(@Body() dto: CreateTargetDto, @CurrentUser() user: AuthUser) {
    const target = await this.targetsService.create(dto, user.id);
    await this.audit.record({
      action: 'target.create',
      userId: user.id,
      userEmail: user.email,
      targetId: target.id,
      detail: `${dto.host}:${dto.port ?? 5432}/${dto.database}`,
    });
    return target;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update target configuration' })
  @ApiParam({ name: 'id', description: 'Target UUID' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTargetDto,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.targetsService.update(id, dto);
    await this.audit.record({
      action: 'target.update',
      userId: user.id,
      userEmail: user.email,
      targetId: id,
    });
    return result;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove target and stop monitoring',
    description: 'Stops collection, closes pool, soft-deletes target',
  })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const result = await this.targetsService.remove(id);
    await this.audit.record({
      action: 'target.delete',
      userId: user.id,
      userEmail: user.email,
      targetId: id,
    });
    return result;
  }

  @Post(':id/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger immediate data collection',
    description: 'Runs all collectors now without waiting for next interval',
  })
  async refresh(@Param('id') id: string) {
    return this.targetsService.triggerRefresh(id);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pause collection for this target',
    description: 'Stops scheduled collection but keeps the pool open',
  })
  async pause(@Param('id') id: string) {
    return this.targetsService.pause(id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resume collection for this target',
  })
  async resume(@Param('id') id: string) {
    return this.targetsService.resume(id);
  }
}
