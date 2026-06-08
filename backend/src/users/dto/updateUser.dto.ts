import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'new_username' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ example: 'new@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '13900139000' })
  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: 'Invalid Chinese phone number' })
  phone?: string;

  @ApiPropertyOptional({
    description: 'New password as SHA-256 hex digest — requires currentPassword',
    minLength: 64,
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @Length(64, 64, { message: 'password must be a SHA-256 hex digest (64 chars)' })
  password?: string;

  @ApiPropertyOptional({
    description: 'Current password as SHA-256 hex digest — required when changing password',
    minLength: 64,
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @Length(64, 64, { message: 'currentPassword must be a SHA-256 hex digest (64 chars)' })
  currentPassword?: string;
}
