import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class OAuthCallbackDto {
  @ApiProperty({ enum: ['wechat', 'qq'] })
  @IsIn(['wechat', 'qq'])
  provider: 'wechat' | 'qq';

  @ApiProperty({ description: 'Authorization code from OAuth provider' })
  @IsString()
  code: string;

  @ApiProperty({ description: 'State token for CSRF protection' })
  @IsString()
  state: string;
}
