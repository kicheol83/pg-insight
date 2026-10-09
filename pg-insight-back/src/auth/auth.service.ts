import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
}

const REFRESH_TOKEN_TTL_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  private get userModel() {
    return (this.prisma as unknown as Record<string, unknown>)['user'] as {
      count: () => Promise<number>;
      findUnique: (args: unknown) => Promise<UserRecord | null>;
      create: (args: unknown) => Promise<UserRecord>;
      update: (args: unknown) => Promise<UserRecord>;
    };
  }

  private get refreshTokenModel() {
    const result = (this.prisma as unknown as Record<string, unknown>)[
      'refreshToken'
    ] as {
      create: (args: unknown) => Promise<unknown>;
      findUnique: (args: unknown) => Promise<{
        id: string;
        userId: string;
        expiresAt: Date;
        revokedAt: Date | null;
      } | null>;
      update: (args: unknown) => Promise<unknown>;
      updateMany: (args: unknown) => Promise<unknown>;
    };
    return result;
  }

  public async login(email: string, password: string, ipAddress?: string) {
    const user = await this.userModel.findUnique({ where: { email } });
    if (!user) {
      await this.audit.record({
        action: 'login_failed',
        userEmail: email,
        ipAddress,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.audit.record({
        action: 'login_failed',
        userEmail: email,
        ipAddress,
        userId: user.id,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.userModel.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.record({
      action: 'login',
      userId: user.id,
      userEmail: user.email,
      ipAddress,
    });

    const result = this.buildTokenResponse(user);
    return result;
  }

  public async refresh(rawRefreshToken: string) {
    const tokenHash = this.hashToken(rawRefreshToken);
    const record = await this.refreshTokenModel.findUnique({
      where: { tokenHash },
    });

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.refreshTokenModel.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });

    const user = await this.userModel.findUnique({
      where: { id: record.userId },
    });
    if (!user) throw new UnauthorizedException('User no longer exists');

    return this.buildTokenResponse(user);
  }

  public async logout(userId: string) {
    await this.refreshTokenModel.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const result = { loggedOut: true };
    return result;
  }

  public async registerFirst(email: string, password: string) {
    const count = await this.userModel.count();
    if (count > 0) {
      throw new ForbiddenException(
        'Setup already completed — use an existing account or ask an admin to invite you',
      );
    }
    const result = await this.createUser(email, password, 'admin');
    await this.audit.record({
      action: 'register_first',
      userId: result.user.id,
      userEmail: email,
    });
    return result;
  }

  public async register(
    email: string,
    password: string,
    role: 'admin' | 'user' = 'user',
    actorUserId?: string,
  ) {
    const existing = await this.userModel.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    const result = await this.createUser(email, password, role);
    await this.audit.record({
      action: 'register',
      userId: actorUserId,
      detail: `invited ${email} as ${role}`,
    });
    return result;
  }

  private async createUser(email: string, password: string, role: string) {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.userModel.create({
      data: { email, passwordHash, role },
    });
    return this.buildTokenResponse(user);
  }

  private async buildTokenResponse(user: UserRecord) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    const rawRefreshToken = randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.refreshTokenModel.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
