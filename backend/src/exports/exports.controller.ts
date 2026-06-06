import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwtAuth.guard';
import { CreateExportDto } from './dto/createExport.dto';
import { ExportsService } from './exports.service';

interface AuthenticatedRequest extends Request {
  user: { sub: string; username: string };
}

@ApiTags('exports')
@ApiSecurity('bearer')
@UseGuards(JwtAuthGuard)
@Controller('exports')
export class ExportsController {
  constructor(private readonly service: ExportsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 300000 } })
  @ApiOperation({ summary: 'Start a new export job' })
  @ApiResponse({ status: 201, description: 'Export started' })
  create(@Body() dto: CreateExportDto, @Req() req: AuthenticatedRequest) {
    return this.service.create(req.user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all export records' })
  findAll(@Req() req: AuthenticatedRequest) {
    return this.service.findAll(req.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get export status by ID' })
  @ApiResponse({ status: 404, description: 'Export not found' })
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.findOne(req.user.sub, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an export record' })
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.remove(req.user.sub, id);
  }
}
