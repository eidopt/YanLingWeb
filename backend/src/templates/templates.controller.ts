import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { TemplatesService } from './templates.service';

@ApiTags('templates')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'List all templates' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':templateId')
  @ApiOperation({ summary: 'Get a template by templateId' })
  @ApiParam({ name: 'templateId', example: 'commerce-market' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  findOne(@Param('templateId') templateId: string) {
    return this.service.findByTemplateId(templateId);
  }
}
