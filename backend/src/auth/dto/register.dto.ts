import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ description: 'Username (3-32 chars, alphanumeric + underscore)' })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'username must be alphanumeric or underscore' })
  username!: string;

  @ApiProperty({ description: 'SHA-256(rawPassword) — 64-char lowercase hex' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'password must be a 64-char lowercase hex SHA-256 hash' })
  password!: string;

  @ApiPropertyOptional({ description: 'Optional email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Optional phone number' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?\d{7,15}$/, { message: 'phone must be a valid international phone number' })
  phone?: string;
}
