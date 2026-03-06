import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import * as hana from '@sap/hana-client';
import {
  HanaService,
  CalcViewResult,
  CalcViewColumnsResult,
} from './hana.service';
import { SessionGuard, SessionPool } from '../auth/session.guard';
import { QueryCalcViewDto } from './dto/query-calc-view.dto';
import { QueryRawSqlDto }  from './dto/query-raw-sql.dto';

@ApiTags('HANA')
@Controller('hana')
@UseGuards(SessionGuard)
@ApiHeader({ name: 'x-session-token', required: true })
export class HanaController {
  constructor(private readonly hanaService: HanaService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check HANA database connection health' })
  @ApiResponse({ status: 200, schema: { example: { status: 'ok', connected: true } } })
  async healthCheck(@SessionPool() pool: hana.ConnectionPool) {
    return this.hanaService.healthCheck(pool);
  }

  @Get('calcview/columns')
  @ApiOperation({ summary: 'List all columns of a Calculation View' })
  @ApiQuery({ name: 'view', required: true, example: '"_SYS_BIC"."pkg/VIEW_NAME"' })
  async getCalcViewColumns(
    @SessionPool() pool: hana.ConnectionPool,
    @Query('view') view: string,
  ): Promise<CalcViewColumnsResult> {
    if (!view) throw new BadRequestException('Query parameter "view" is required');
    return this.hanaService.getCalcViewColumns(pool, view);
  }

  @Post('raw')
  @ApiOperation({ summary: 'Execute a raw SQL statement and return rows as CalcViewResult' })
  async queryRaw(
    @SessionPool() pool: hana.ConnectionPool,
    @Body() dto: QueryRawSqlDto,
  ): Promise<CalcViewResult> {
    return this.hanaService.runRawSql(pool, dto.sql);
  }

  @Post('calcview')
  @ApiOperation({ summary: 'Query a Calculation View with selected columns and optional WHERE filters' })
  async queryCalcView(
    @SessionPool() pool: hana.ConnectionPool,
    @Body() dto: QueryCalcViewDto,
  ): Promise<CalcViewResult> {
    return this.hanaService.queryCalcView(
      pool,
      dto.view,
      dto.columns,
      dto.top          ?? 10,
      dto.columnFilters    ?? {},
      dto.allColumns       ?? [],
      dto.columnFilterOps  ?? {},
    );
  }
}
