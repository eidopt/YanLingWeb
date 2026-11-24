import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateTemplateDto {
  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  prompt!: string;

  @ApiPropertyOptional({ enum: ['mini-program', 'mobile-app', 'web'] })
  @IsOptional()
  @IsIn(['mini-program', 'mobile-app', 'web'])
  platform?: 'mini-program' | 'mobile-app' | 'web';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayCategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  forceArchetype?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  forceHeroMode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  materializeImages?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  placeholderImages?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  libraryImages?: boolean;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  document?: Record<string, unknown>;
}
