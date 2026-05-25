import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'john_doe', description: 'Username, email, or phone' })
  @IsString()
  identifier: string;

  @ApiProperty({
    description:
      'SHA-256(rawPassword) — the client-hashed password. ' +
      'Nonce is used for anti-replay only and does NOT participate in password hashing.',
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @Length(64, 64, { message: 'password must be a SHA-256 hex digest (64 chars)' })
  password: string;

  @ApiProperty({ description: 'Single-use nonce from GET /users/auth/challenge' })
  @IsString()
  nonce: string;
}
