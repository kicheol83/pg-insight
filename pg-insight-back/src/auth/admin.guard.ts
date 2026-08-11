import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: string } | undefined;
    if (user?.role !== 'admin') {
      throw new ForbiddenException('This action requires admin privileges');
    }
    return true;
  }
}
