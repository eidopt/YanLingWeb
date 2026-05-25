import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Username, email, or phone' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  identifier!: string;

  @ApiProperty({ description: 'SHA-256(rawPassword) — 64-char lowercase hex' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'password must be a 64-char lowercase hex SHA-256 hash' })
  password!: string;

  @ApiProperty({ description: 'One-time nonce from GET /users/auth/challenge' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'nonce must be a 64-char lowercase hex string' })
  nonce!: string;
}
