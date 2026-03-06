import { IsString, IsNotEmpty, IsOptional, IsNumberString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'hana.example.com' })
  @IsString()
  @IsNotEmpty()
  host: string;

  @ApiProperty({ example: '443' })
  @IsNumberString()
  @IsNotEmpty()
  port: string;

  @ApiProperty({ example: 'SYSTEM' })
  @IsString()
  @IsNotEmpty()
  user: string;

  @ApiProperty({ example: 'password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ example: 'HXE', required: false })
  @IsString()
  @IsOptional()
  database?: string;

  @ApiProperty({ example: true, required: false, description: 'Enable TLS/SSL encryption (default: true). Set to false for servers without SSL.' })
  @IsBoolean()
  @IsOptional()
  encrypt?: boolean;
}
