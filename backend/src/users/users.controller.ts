import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AuthenticatedRequest } from '../auth/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

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
