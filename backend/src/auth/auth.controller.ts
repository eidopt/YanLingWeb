import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { OAuthCallbackDto } from './dto/oauth-callback.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('users')
@Controller('users')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('auth/challenge')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Get a one-time login nonce',
    description:
      'Must be called before every login attempt. ' +
      'The returned nonce is single-use and expires in 5 minutes.',
  })
  @ApiResponse({ status: 200, description: '{ nonce, expiresAt }' })
  getChallenge() {
    return this.authService.issueChallenge();
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Register with username + password' })
  @ApiResponse({ status: 201, description: 'Returns JWT + user profile' })
  @ApiResponse({ status: 409, description: 'Username / email / phone already taken' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Login with challenge-response',
    description:
      '1. GET /users/auth/challenge → nonce\n' +
      '2. Compute: SHA256(rawPassword)\n' +
      '3. POST here with identifier, password (SHA256 of raw password), and nonce.\n' +
      'Nonce is used for anti-replay only; it does NOT participate in password hashing.',
  })
  @ApiResponse({ status: 200, description: 'Returns JWT + user profile' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or expired nonce' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('oauth/qrcode')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Get OAuth QR code URL for WeChat or QQ login' })
  @ApiQuery({ name: 'provider', enum: ['wechat', 'qq'] })
  getQrCode(@Query('provider') provider: 'wechat' | 'qq') {
    return this.authService.getOAuthQrCodeUrl(provider);
  }

  @Post('oauth/callback')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Handle OAuth callback from WeChat / QQ' })
  oauthCallback(@Body() dto: OAuthCallbackDto) {
    return this.authService.oauthCallback(dto);
  }
}
