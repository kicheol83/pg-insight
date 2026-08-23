import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { SecurityAuditService } from './security-audit.service';

@ApiTags('security')
@Controller('security/:targetId')
export class SecurityAuditController {
  constructor(private readonly securityAudit: SecurityAuditService) {}

  @Get('audit')
  @ApiOperation({
    summary: 'Run a read-only security audit on this target',
    description:
      'Checks superuser count, dangerous role privileges, public schema grants, SSL, password encryption, and pg_hba.conf weak auth rules. Purely informational — never modifies anything.',
  })
  @ApiParam({ name: 'targetId' })
  async audit(@Param('targetId') targetId: string) {
    return this.securityAudit.runAudit(targetId);
  }
}
