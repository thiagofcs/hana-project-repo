import { IsString, IsArray, IsNotEmpty, IsOptional, IsInt, Min, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ViewColumn } from '../hana.service';

export class QueryCalcViewDto {
  @ApiProperty({ example: '"_SYS_BIC"."pkg/VIEW_NAME"' })
  @IsString()
  @IsNotEmpty()
  view: string;

  @ApiProperty({ example: ['COL_A', 'COL_B'] })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  columns: string[];

  @ApiProperty({ example: 100, default: 10, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  top?: number;

  @ApiProperty({ required: false, example: { COL_A: 'ABC', COL_B: '1,2,3' } })
  @IsOptional()
  @IsObject()
  columnFilters?: Record<string, string>;

  @ApiProperty({ required: false, example: { COL_A: '=', COL_B: 'IN' } })
  @IsOptional()
  @IsObject()
  columnFilterOps?: Record<string, string>;

  @ApiProperty({ required: false, type: 'array' })
  @IsOptional()
  @IsArray()
  allColumns?: ViewColumn[];
}
