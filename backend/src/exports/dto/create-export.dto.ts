import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateExportDto {
  @ApiProperty({ example: 'my-store' })
  @IsString()
  projectName: string;

  @ApiProperty({ example: 'commerce-market' })
  @IsString()
  themeId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  layoutJson?: Record<string, unknown>;
}
