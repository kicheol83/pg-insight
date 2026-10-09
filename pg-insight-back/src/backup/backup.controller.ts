import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { BackupService } from './backup.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('backups')
@Controller('targets/:targetId/backups')
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly audit: AuditService,
  ) {}

  @UseGuards(AdminGuard)
  @Post()
  @ApiOperation({
    summary: 'Start a new pg_dump backup for this target',
    description:
      'Runs asynchronously — returns immediately with status "running". Poll GET to see completion.',
  })
  @ApiParam({ name: 'targetId' })
  async start(
    @Param('targetId') targetId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.backupService.startBackup(targetId, user.id, user.email);
  }

  @Get()
  @ApiOperation({ summary: 'List backup history for this target' })
  async list(@Param('targetId') targetId: string) {
    return this.backupService.list(targetId);
  }

  @UseGuards(AdminGuard)
  @Get(':backupId/download')
  @ApiOperation({ summary: 'Download a completed backup file' })
  async download(
    @Param('targetId') targetId: string,
    @Param('backupId') backupId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { stream, backup } =
      await this.backupService.getDownloadStream(backupId);
    await this.audit.record({
      action: 'backup.download',
      userId: user.id,
      userEmail: user.email,
      targetId,
      detail: `backupId=${backupId}`,
    });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="backup-${backup.startedAt.toISOString().slice(0, 10)}-${backupId.slice(0, 8)}.dump"`,
    );
    stream.pipe(res);
  }

  @UseGuards(AdminGuard)
  @Delete(':backupId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a backup file and its record' })
  async remove(
    @Param('backupId') backupId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.backupService.remove(backupId, user.id, user.email);
  }
}
