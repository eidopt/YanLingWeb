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
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CreateThemeDto } from './dto/create-theme.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { ThemesService } from './themes.service';

@ApiTags('themes')
@Controller('themes')
export class ThemesController {
  constructor(private readonly service: ThemesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new theme' })
  @ApiResponse({ status: 201, description: 'Theme created' })
  create(@Body() dto: CreateThemeDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all themes' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a theme by ID' })
  @ApiResponse({ status: 404, description: 'Theme not found' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a theme' })
  update(@Param('id') id: string, @Body() dto: UpdateThemeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a theme' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
