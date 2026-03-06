import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QueryRawSqlDto {
  @ApiProperty({ example: 'SELECT TOP 100 * FROM "_SYS_BIC"."pkg/VIEW_NAME"' })
  @IsString()
  @IsNotEmpty()
  sql: string;
}
