import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class PublishSiteDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  templateId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{3,63}$/, { message: 'subdomain 只能包含小写字母、数字和短横线' })
  subdomain?: string;
}

export class RollbackSiteDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  revisionId!: string;
}
