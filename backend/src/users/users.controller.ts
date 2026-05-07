import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { LoginDto } from './dto/login.dto';
import { OAuthCallbackDto } from './dto/oauth-callback.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

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

  @Get(':id')
  @ApiOperation({ summary: 'Get user profile by ID' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update user profile' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete user account' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
