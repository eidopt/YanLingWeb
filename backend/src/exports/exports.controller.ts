import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CreateExportDto } from './dto/create-export.dto';
import { ExportsService } from './exports.service';

@ApiTags('exports')
@Controller('exports')
export class ExportsController {
  constructor(private readonly service: ExportsService) {}

  @Post()
  @ApiOperation({ summary: 'Start a new export job' })
  @ApiResponse({ status: 201, description: 'Export started' })
  create(@Body() dto: CreateExportDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all export records' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get export status by ID' })
  @ApiResponse({ status: 404, description: 'Export not found' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an export record' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
