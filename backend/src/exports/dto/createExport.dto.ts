import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Matches } from 'class-validator';

export class CreateExportDto {
  @ApiProperty({ example: 'my-store' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,64}$/, {
    message: 'projectName 只能包含字母、数字、下划线和短横线',
  })
  projectName: string;

  @ApiProperty({ example: 'commerce-market' })
  @IsString()
  themeId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  layoutJson?: Record<string, unknown>;
}
