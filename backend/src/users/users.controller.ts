import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { OAuthCallbackDto } from './dto/oauth-callback.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

interface AuthenticatedRequest extends Request {
  user: { sub: string; username: string; };
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('auth/challenge')
  @ApiOperation({
    summary: 'Get a one-time login nonce',
    description:
      'Must be called before every login attempt. ' +
      'The returned nonce is single-use and expires in 5 minutes.',
  })
  @ApiResponse({ status: 200, description: '{ nonce, expiresAt }' })
  getChallenge() {
    return this.service.issueChallenge();
  }

  @Post('register')
  @ApiOperation({ summary: 'Register with username + password' })
  @ApiResponse({ status: 201, description: 'Returns JWT + user profile' })
  @ApiResponse({ status: 409, description: 'Username / email / phone already taken' })
  register(@Body() dto: RegisterDto) {
    return this.service.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with challenge-response',
    description:
      '1. GET /users/auth/challenge → nonce\n' +
      '2. Compute: SHA256(nonce + SHA256(password))\n' +
      '3. POST here with identifier, password (the computed hash), and nonce',
  })
  @ApiResponse({ status: 200, description: 'Returns JWT + user profile' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or expired nonce' })
  login(@Body() dto: LoginDto) {
    return this.service.login(dto);
  }

  @Get('oauth/qrcode')
  @ApiOperation({ summary: 'Get OAuth QR code URL for WeChat or QQ login' })
  @ApiQuery({ name: 'provider', enum: ['wechat', 'qq'] })
  getQrCode(@Query('provider') provider: 'wechat' | 'qq') {
    return this.service.getOAuthQrCodeUrl(provider);
  }

  @Post('oauth/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle OAuth callback from WeChat / QQ' })
  oauthCallback(@Body() dto: OAuthCallbackDto) {
    return this.service.oauthCallback(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@Req() req: AuthenticatedRequest) {
    return this.service.findById(req.user.sub);
  }

  @Get(':id/token-usage')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get AI token usage summary for the current user' })
  getTokenUsage(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.assertSelf(req, id);
    return this.service.getTokenUsageSummary(id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get user profile by ID' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.assertSelf(req, id);
    return this.service.findById(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update user profile' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    this.assertSelf(req, id);
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete user account' })
  remove(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.assertSelf(req, id);
    return this.service.remove(id);
  }

  private assertSelf(req: AuthenticatedRequest, id: string): void {
    if (req.user.sub !== id) {
      throw new ForbiddenException('Cannot access another user account');
    }
  }
}
