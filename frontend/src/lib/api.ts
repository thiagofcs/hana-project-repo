import { API_BASE } from './config';

// Match the server-side timeout — 10 minutes
const QUERY_TIMEOUT_MS = 10 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const stored = localStorage.getItem('hana_session');
  if (!stored) return {};
  try {
    const session = JSON.parse(stored);
    return session?.token ? { 'x-session-token': session.token } : {};
  } catch {
    return {};
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * fetch() wrapper that cancels the request after `timeoutMs`.
 */
async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  timeoutMs = QUERY_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `Query timed out after ${timeoutMs / 1000}s. Try reducing the number of rows or adding WHERE filters.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<{ status: string; connected: boolean }> {
  return handleResponse(
    await fetch(`${API_BASE}/hana/health`, { headers: getAuthHeaders() }),
  );
}

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
  viewName:     string;
  columns:      string[];
  rows:         Record<string, unknown>[];
  total:        number;
  topN:         number;
  appliedWhere: string | null;
}

export async function fetchCalcViewColumns(viewName: string): Promise<CalcViewColumnsResult> {
  const params = new URLSearchParams({ view: viewName });
  return handleResponse(
    await fetchWithTimeout(
      `${API_BASE}/hana/calcview/columns?${params}`,
      { headers: getAuthHeaders() },
    ),
  );
}

export async function fetchRawSql(sql: string): Promise<CalcViewResult> {
  return handleResponse(
    await fetchWithTimeout(
      `${API_BASE}/hana/raw`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body:    JSON.stringify({ sql }),
      },
    ),
  );
}

export async function fetchCalcView(
  viewName:        string,
  selectedColumns: string[],
  topN:            number,
  columnFilters:   Record<string, string>,
  allColumns:      ViewColumn[],
  columnFilterOps: Record<string, string> = {},
): Promise<CalcViewResult> {
  return handleResponse(
    await fetchWithTimeout(
      `${API_BASE}/hana/calcview`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body:    JSON.stringify({
          view:          viewName,
          columns:       selectedColumns,
          top:           topN,
          columnFilters,
          columnFilterOps,
          allColumns,
        }),
      },
    ),
  );
}
