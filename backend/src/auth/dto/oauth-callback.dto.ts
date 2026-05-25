import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';

export class OAuthCallbackDto {
  @ApiProperty({ enum: ['wechat', 'qq'], description: 'OAuth provider' })
  @IsIn(['wechat', 'qq'])
  provider!: 'wechat' | 'qq';

  @ApiProperty({ description: 'Authorization code from OAuth redirect' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ description: 'OAuth state parameter for CSRF protection' })
  @IsString()
  @MinLength(1)
  state!: string;
}
