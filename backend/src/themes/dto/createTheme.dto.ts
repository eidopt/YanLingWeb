import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateThemeDto {
  @ApiProperty({ example: 'My Commerce Theme' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Clean and modern' })
  @IsOptional()
  @IsString()
  tagline?: string;

  @ApiPropertyOptional({ example: 'A theme for e-commerce stores' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '#3b82f6' })
  @IsOptional()
  @IsString()
  accent?: string;

  @ApiPropertyOptional({ example: 'commerce' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: ['minimal', 'modern'] })
  @IsOptional()
  @IsArray()
  traits?: string[];

  @ApiPropertyOptional({ example: { '--primary': '#3b82f6' } })
  @IsOptional()
  @IsObject()
  cssVars?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  componentTemplates?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  layoutDocument?: Record<string, unknown>;
}
