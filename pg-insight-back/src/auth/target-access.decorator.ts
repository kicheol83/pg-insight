import { SetMetadata } from '@nestjs/common';

export type TargetSource = 'target' | 'alertRule' | 'alertEvent' | 'backup';

export interface TargetAccessRule {
  param: string;
  source: TargetSource;
}

export const TARGET_ACCESS_KEY = 'targetAccess';

export const TargetAccess = (param: string, source: TargetSource = 'target') =>
  SetMetadata(TARGET_ACCESS_KEY, [{ param, source }] as TargetAccessRule[]);
