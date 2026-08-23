import { Module } from '@nestjs/common';
import { SecurityAuditController } from './security-audit.controller';
import { SecurityAuditService } from './security-audit.service';
import { TargetsModule } from '../targets/targets.module';

@Module({
  imports: [TargetsModule],
  controllers: [SecurityAuditController],
  providers: [SecurityAuditService],
})
export class SecurityAuditModule {}
