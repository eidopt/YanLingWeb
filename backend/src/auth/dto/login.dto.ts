import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Username, email, or phone' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  identifier!: string;

  @ApiProperty({
    description:
      'Nonce-bound proof SHA256(nonce + SHA256(rawPassword)). ' +
      'Unsealed accounts may send the static digest with legacyUpgrade=true.',
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'password must be a 64-char lowercase hex SHA-256 hash' })
  password!: string;

  @ApiProperty({ description: 'One-time nonce from GET /users/auth/challenge' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'nonce must be a 64-char lowercase hex string' })
  nonce!: string;

  @ApiProperty({
    required: false,
    description: 'Set when retrying login for an account that has no password seal yet',
  })
  @IsOptional()
  @IsBoolean()
  legacyUpgrade?: boolean;
}
