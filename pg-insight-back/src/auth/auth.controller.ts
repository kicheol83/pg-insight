import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsIn,
} from 'class-validator';
import { Public } from './public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthUser } from './current-user.decorator';
import { AdminGuard } from './admin.guard';
import { AuthService } from './auth.service';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: 'admin' | 'user';
}

export class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsString()
  refreshToken!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('config')
  @ApiOperation({
    summary: 'Public authentication settings for the login page',
  })
  config() {
    return { signupEnabled: this.authService.signupEnabled() };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('signup')
  @ApiOperation({ summary: 'Create a regular user account' })
  async signup(@Body() dto: SignupDto, @Req() req: { ip?: string }) {
    return this.authService.signup(dto.email, dto.password, req.ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({
    summary: 'Log in and receive an access + refresh token pair',
  })
  async login(@Body() dto: LoginDto, @Req() req: { ip?: string }) {
    return this.authService.login(dto.email, dto.password, req.ip);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: 'Exchange a refresh token for a new access + refresh token pair',
  })
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke all refresh tokens for the current user' })
  async logout(@CurrentUser() user: AuthUser) {
    return this.authService.logout(user.id);
  }

  @Public()
  @Post('register-first')
  @ApiOperation({
    summary: 'Create the first admin account',
    description:
      'Only works when the users table is empty — one-time setup endpoint',
  })
  async registerFirst(@Body() dto: RegisterDto) {
    return this.authService.registerFirst(dto.email, dto.password);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('register')
  @ApiOperation({ summary: 'Invite a new user (admin only)' })
  async register(@Body() dto: RegisterDto, @CurrentUser() actor: AuthUser) {
    return this.authService.register(
      dto.email,
      dto.password,
      dto.role ?? 'user',
      actor.id,
    );
  }
}
