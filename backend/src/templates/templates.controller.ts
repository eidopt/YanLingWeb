import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AuthenticatedRequest } from '../auth/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  TemplatesService,
  type UpdateOwnedTemplateInput,
} from './templates.service';

@ApiTags('templates')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'List marketplace templates' })
  findAll(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('functionalCategory') functionalCategory?: string,
  ) {
    return this.service.findMarketplace({ search, category, functionalCategory });
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List templates owned by the current user' })
  findMine(
    @Req() req: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('functionalCategory') functionalCategory?: string,
  ) {
    return this.service.findOwned(req.user.sub, { search, category, functionalCategory });
  }

  @Get('recent')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List recently updated templates owned by current user' })
  recent(@Req() req: AuthenticatedRequest) {
    return this.service.findRecentOwned(req.user.sub);
  }

  @Get('mine/:templateId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get an owned template by templateId' })
  findOwnedOne(
    @Req() req: AuthenticatedRequest,
    @Param('templateId') templateId: string,
  ) {
    return this.service.findOwnedByTemplateId(req.user.sub, templateId);
  }

  @Put('mine/:templateId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update an owned template draft' })
  updateOwned(
    @Req() req: AuthenticatedRequest,
    @Param('templateId') templateId: string,
    @Body() body: UpdateOwnedTemplateInput,
  ) {
    return this.service.updateOwned(req.user.sub, templateId, body);
  }

  @Post(':templateId/duplicate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create an owned copy from a marketplace template' })
  duplicate(
    @Req() req: AuthenticatedRequest,
    @Param('templateId') templateId: string,
  ) {
    return this.service.duplicateForUser(req.user.sub, templateId);
  }

  @Get(':templateId')
  @ApiOperation({ summary: 'Get a marketplace template by templateId' })
  @ApiParam({ name: 'templateId', example: 'commerce-market' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  findOne(@Param('templateId') templateId: string) {
    return this.service.findByTemplateId(templateId);
  }
}
