import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import {
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('AuthService', () => {
  let service: AuthService;
  let userModel: {
    count: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  let refreshTokenModel: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  let auditRecord: jest.Mock;

  beforeEach(async () => {
    userModel = {
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    refreshTokenModel = {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    };
    auditRecord = jest.fn().mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: { user: userModel, refreshToken: refreshTokenModel },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('fake.jwt.token'),
          },
        },
        {
          provide: AuditService,
          useValue: { record: auditRecord },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    it('returns an access + refresh token pair when credentials are correct', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      userModel.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@example.com',
        passwordHash,
        role: 'admin',
      });
      userModel.update.mockResolvedValue({});

      const result = await service.login(
        'admin@example.com',
        'correct-password',
      );

      expect(result.accessToken).toBe('fake.jwt.token');
      expect(result.refreshToken).toBeDefined();
      expect(typeof result.refreshToken).toBe('string');
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'admin@example.com',
        role: 'admin',
      });
      expect(refreshTokenModel.create).toHaveBeenCalled();
      expect(auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'login', userId: 'user-1' }),
      );
    });

    it('rejects when the user does not exist, and records login_failed', async () => {
      userModel.findUnique.mockResolvedValue(null);
      await expect(
        service.login('nobody@example.com', 'whatever'),
      ).rejects.toThrow(UnauthorizedException);
      expect(auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'login_failed' }),
      );
    });

    it('rejects when the password is wrong', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      userModel.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@example.com',
        passwordHash,
        role: 'admin',
      });
      await expect(
        service.login('admin@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rejects an unknown refresh token', async () => {
      refreshTokenModel.findUnique.mockResolvedValue(null);
      await expect(service.refresh('unknown-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a revoked refresh token', async () => {
      refreshTokenModel.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 100_000),
        revokedAt: new Date(),
      });
      await expect(service.refresh('revoked-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired refresh token', async () => {
      refreshTokenModel.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
      });
      await expect(service.refresh('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rotates the token and issues a new pair on success', async () => {
      refreshTokenModel.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 100_000),
        revokedAt: null,
      });
      userModel.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@example.com',
        passwordHash: 'x',
        role: 'admin',
      });

      const result = await service.refresh('valid-token');

      expect(refreshTokenModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(result.accessToken).toBe('fake.jwt.token');
      expect(refreshTokenModel.create).toHaveBeenCalled(); // yangi token yaratildi
    });
  });

  describe('logout', () => {
    it('revokes all active refresh tokens for the user', async () => {
      await service.logout('user-1');
      expect(refreshTokenModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', revokedAt: null },
        }),
      );
    });
  });

  describe('registerFirst', () => {
    it('creates an admin when no users exist yet', async () => {
      userModel.count.mockResolvedValue(0);
      userModel.create.mockResolvedValue({
        id: 'user-1',
        email: 'admin@example.com',
        passwordHash: 'x',
        role: 'admin',
      });

      const result = await service.registerFirst(
        'admin@example.com',
        'password123',
      );

      expect(result.user.role).toBe('admin');
      expect(userModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'admin@example.com',
            role: 'admin',
          }),
        }),
      );
    });

    it('refuses when a user already exists — prevents hijacking setup', async () => {
      userModel.count.mockResolvedValue(1);
      await expect(
        service.registerFirst('attacker@example.com', 'password123'),
      ).rejects.toThrow(ForbiddenException);
      expect(userModel.create).not.toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('creates a new user with the requested role', async () => {
      userModel.findUnique.mockResolvedValue(null);
      userModel.create.mockResolvedValue({
        id: 'user-2',
        email: 'user@example.com',
        passwordHash: 'x',
        role: 'user',
      });

      const result = await service.register(
        'user@example.com',
        'password123',
        'user',
      );
      expect(result.user.role).toBe('user');
    });

    it('rejects when the email is already taken', async () => {
      userModel.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.register('user@example.com', 'password123', 'user'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
