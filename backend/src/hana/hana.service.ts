import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as hana from '@sap/hana-client';
import { withPoolConnection, withRetry } from '../database/pool.utils';

export interface ViewColumn {
  columnName:   string;
  position:     number;
  dataTypeName: string;
  length:       number;
  scale:        number;
  isNullable:   string;
}

export interface CalcViewColumnsResult {
  viewName: string;
  schema:   string;
  columns:  ViewColumn[];
}

export interface CalcViewResult {
  columns:      string[];
  rows:         Record<string, unknown>[];
  total:        number;
  topN:         number;
  viewName:     string;
  appliedWhere: string | null;
}

// Matches: "_SYS_BIC"."some/package/VIEW_NAME"
const SAFE_VIEW_PATTERN   = /^"[^""]+"."[^""]+"$/;
// Safe bare column identifier
const SAFE_COLUMN_PATTERN = /^[A-Za-z0-9_\-./ ]+$/;

@Injectable()
export class HanaService {
  private readonly logger = new Logger(HanaService.name);

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async runQuery<T>(
    pool:   hana.ConnectionPool,
    sql:    string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return withRetry(() =>
      withPoolConnection(pool, (conn) =>
        new Promise<T[]>((resolve, reject) => {
          conn.exec(sql, params, (err, rows) => {
            if (err) {
              this.logger.error(`Query failed: ${sql}`, err);
              reject(err);
            } else {
              resolve(rows as T[]);
            }
          });
        }),
      ),
    );
  }

  private parseViewName(fq: string): { schema: string; viewName: string } {
    const m = fq.match(/^"([^"]+)"\."([^"]+)"$/);
    if (!m) throw new BadRequestException('Malformed view name');
    return { schema: m[1], viewName: m[2] };
  }

  private validateView(view: string): void {
    if (!SAFE_VIEW_PATTERN.test(view)) {
      throw new BadRequestException(
        'Invalid view name. Expected: "_SYS_BIC"."package/VIEW_NAME"',
      );
    }
  }

  private buildWhereClause(
    filters:    Record<string, string>,
    filterOps:  Record<string, string>,
    columns:    ViewColumn[],
  ): { clause: string; params: unknown[] } {
    const ALLOWED_OPS = new Set(['=', '!=', '>', '>=', '<', '<=', 'IN']);
    const colTypeMap  = new Map(columns.map(c => [c.columnName, c.dataTypeName]));
    const conditions: string[] = [];
    const params: unknown[] = [];

    for (const [colName, rawValue] of Object.entries(filters)) {
      const trimmed = rawValue.trim();
      if (!trimmed) continue;

      if (!SAFE_COLUMN_PATTERN.test(colName)) {
        throw new BadRequestException(`Invalid column name in filter: ${colName}`);
      }

      const op = filterOps[colName] ?? '=';
      if (!ALLOWED_OPS.has(op)) {
        throw new BadRequestException(`Invalid operator "${op}" for column ${colName}`);
      }

      const dataType  = colTypeMap.get(colName) ?? 'NVARCHAR';
      const isNumeric = /^(INTEGER|BIGINT|SMALLINT|DECIMAL|DOUBLE|REAL|FLOAT|TINYINT)$/i.test(dataType);

      const castValue = (v: string): unknown => {
        if (isNumeric) {
          const n = Number(v);
          if (isNaN(n)) throw new BadRequestException(`Filter value "${v}" is not a valid number for column ${colName}`);
          return n;
        }
        return v;
      };

      if (op === 'IN') {
        const values = trimmed.split(',').map(v => v.trim()).filter(v => v.length > 0);
        if (values.length === 0) continue;
        const placeholders = values.map(() => '?').join(', ');
        conditions.push(`"${colName}" IN (${placeholders})`);
        values.forEach(v => params.push(castValue(v)));
      } else {
        conditions.push(`"${colName}" ${op} ?`);
        params.push(castValue(trimmed));
      }
    }

    return {
      clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  // ── Public methods ─────────────────────────────────────────────────────────

  async healthCheck(pool: hana.ConnectionPool): Promise<{ status: string; connected: boolean }> {
    try {
      await withRetry(() =>
        withPoolConnection(pool, (conn) =>
          new Promise<void>((resolve, reject) => {
            conn.exec("SELECT 'ping' FROM DUMMY", (err) => {
              if (err) reject(err);
              else     resolve();
            });
          }),
        ),
      );
      return { status: 'ok', connected: true };
    } catch {
      return { status: 'error', connected: false };
    }
  }

  async getCalcViewColumns(pool: hana.ConnectionPool, viewName: string): Promise<CalcViewColumnsResult> {
    this.validateView(viewName);
    const { schema, viewName: bareView } = this.parseViewName(viewName);

    const sql = `
      SELECT
        VC.COLUMN_NAME,
        VC.POSITION,
        VC.DATA_TYPE_NAME,
        VC.LENGTH,
        VC.SCALE,
        VC.IS_NULLABLE
      FROM SYS.VIEW_COLUMNS VC
      JOIN SYS.VIEWS V
           ON V.SCHEMA_NAME = VC.SCHEMA_NAME
          AND V.VIEW_NAME   = VC.VIEW_NAME
      WHERE V.VIEW_TYPE    = 'CALC'
        AND VC.SCHEMA_NAME = ?
        AND VC.VIEW_NAME   = ?
      ORDER BY VC.POSITION
    `;

    this.logger.log(`Fetching columns for ${viewName}`);
    const rows = await this.runQuery<Record<string, unknown>>(pool, sql, [schema, bareView]);

    if (rows.length === 0) {
      throw new BadRequestException(
        `No columns found for calc view ${viewName}. Verify the view name and that it is of type CALC.`,
      );
    }

    return {
      viewName,
      schema,
      columns: rows.map(r => ({
        columnName:   String(r['COLUMN_NAME']),
        position:     Number(r['POSITION']),
        dataTypeName: String(r['DATA_TYPE_NAME']),
        length:       Number(r['LENGTH']),
        scale:        Number(r['SCALE']),
        isNullable:   String(r['IS_NULLABLE']),
      })),
    };
  }

  async runRawSql(
    pool: hana.ConnectionPool,
    sql:  string,
  ): Promise<CalcViewResult> {
    const trimmed = sql.trim();
    if (!trimmed) throw new BadRequestException('SQL statement is required');

    this.logger.log(`Executing raw SQL: ${trimmed.slice(0, 200)}${trimmed.length > 200 ? '…' : ''}`);
    const rows    = await this.runQuery<Record<string, unknown>>(pool, trimmed, []);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      viewName:     '(custom SQL)',
      columns,
      rows,
      total:        rows.length,
      topN:         rows.length,
      appliedWhere: null,
    };
  }

  async queryCalcView(
    pool:            hana.ConnectionPool,
    viewName:        string,
    selectedColumns: string[],
    topN:            number = 10,
    columnFilters:   Record<string, string> = {},
    allColumns:      ViewColumn[] = [],
    columnFilterOps: Record<string, string> = {},
  ): Promise<CalcViewResult> {
    this.validateView(viewName);

    if (!selectedColumns || selectedColumns.length === 0) {
      throw new BadRequestException('At least one column must be selected.');
    }

    const invalid = selectedColumns.filter(c => !SAFE_COLUMN_PATTERN.test(c));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid column name(s): ${invalid.join(', ')}`);
    }

    const safeTopN   = Math.max(1, Math.floor(topN));
    const columnList = selectedColumns.map(c => `"${c}"`).join(', ');
    const { clause, params } = this.buildWhereClause(columnFilters, columnFilterOps, allColumns);

    const sql = `SELECT TOP ${safeTopN} ${columnList} FROM ${viewName} ${clause}`.trim();
    this.logger.log(`Executing: ${sql}`);

    const rows    = await this.runQuery<Record<string, unknown>>(pool, sql, params);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : selectedColumns;

    return {
      viewName,
      columns,
      rows,
      total: rows.length,
      topN:  safeTopN,
      appliedWhere: clause || null,
    };
  }
}
