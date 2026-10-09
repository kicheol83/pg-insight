import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TARGET_ACCESS_KEY, TargetAccessRule } from './target-access.decorator';
import { TargetAccessService, TargetActor } from './target-access.service';

@Injectable()
export class TargetAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: TargetAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      params?: Record<string, string>;
      user?: TargetActor;
    }>();
    const params = request.params ?? {};

    const rules: TargetAccessRule[] = [];
    if (typeof params.targetId === 'string') {
      rules.push({ param: 'targetId', source: 'target' });
    }
    rules.push(
      ...(this.reflector.get<TargetAccessRule[]>(
        TARGET_ACCESS_KEY,
        context.getHandler(),
      ) ?? []),
    );
    if (rules.length === 0) return true;

    const actor = request.user;
    if (!actor) throw new UnauthorizedException();

    for (const rule of rules) {
      const raw = params[rule.param];
      const targetId =
        typeof raw === 'string'
          ? await this.access.resolveTargetId(rule.source, raw)
          : null;
      if (!targetId || !(await this.access.canAccess(actor, targetId))) {
        throw new NotFoundException('Target not found');
      }
    }

    return true;
  }
}
