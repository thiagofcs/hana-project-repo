'use client';

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  fetchCalcViewColumns,
  fetchCalcView,
  ViewColumn,
  CalcViewColumnsResult,
  CalcViewResult,
} from '@/lib/api';
// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const TYPE_COLORS: Record<string, string> = {
  NVARCHAR: 'bg-purple-50 text-purple-700', VARCHAR:  'bg-purple-50 text-purple-700',
  INTEGER:  'bg-blue-50 text-blue-700',     BIGINT:   'bg-blue-50 text-blue-700',
  SMALLINT: 'bg-blue-50 text-blue-700',     DECIMAL:  'bg-green-50 text-green-700',
  DOUBLE:   'bg-green-50 text-green-700',   REAL:     'bg-green-50 text-green-700',
  DATE:     'bg-orange-50 text-orange-700', TIME:     'bg-orange-50 text-orange-700',
  TIMESTAMP:'bg-orange-50 text-orange-700', BOOLEAN:  'bg-yellow-50 text-yellow-700',
};
const typeColor = (t: string) => TYPE_COLORS[t.toUpperCase()] ?? 'bg-gray-100 text-gray-600';

// ── Types ────────────────────────────────────────────────────────────────────

type SortDir  = 'asc' | 'desc';
interface SortEntry { col: string; dir: SortDir }
type Step = 'idle' | 'loadingColumns' | 'selectColumns' | 'querying' | 'results';

interface CtxMenu { x: number; y: number }

interface SavedQuery {
  id:              string;
  name:            string;
  viewName:        string;
  selectedColumns: string[];
  topN:            string;
  preFilters:      Record<string, string>;
  preFilterOps:    Record<string, string>;
  savedAt:         number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseFilterValues(raw: string): string[] {
  return raw.split(',').map(v => v.trim()).filter(Boolean);
}

/** True if the string represents a plain number (not a zero-padded code, not a date/timestamp). */
function isKpiString(v: string): boolean {
  if (!v || v === 'NULL') return false;
  const n = Number(v);
  if (!isFinite(n)) return false;
  if (/^0\d/.test(v)) return false;                       // zero-padded code like "007" or "0050001600"
  if (/^\d{4}-\d{2}-\d{2}(T|\s|$)/.test(v)) return false; // date, datetime, or timestamp
  return true;
}

// ── Saved queries helpers ─────────────────────────────────────────────────────

const LS_QUERIES_KEY = 'hana_saved_queries';

function readSavedQueries(): SavedQuery[] {
  try { return JSON.parse(localStorage.getItem(LS_QUERIES_KEY) ?? '[]'); } catch { return []; }
}
function writeSavedQueries(queries: SavedQuery[]): void {
  localStorage.setItem(LS_QUERIES_KEY, JSON.stringify(queries));
}
function defaultQueryName(viewName: string): string {
  const match = viewName.match(/\/([^/"]+)"\s*$/);
  return match ? match[1] : viewName.slice(0, 50);
}
function relativeTime(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${typeColor(type)}`}>
      {type}
    </span>
  );
}

function Pagination({ currentPage, totalPages, onPageChange, totalRows, filteredRows, pageSize, isFiltered }: {
  currentPage: number; totalPages: number; onPageChange: (p: number) => void;
  totalRows: number; filteredRows: number; pageSize: number; isFiltered: boolean;
}) {
  if (totalPages <= 1 && !isFiltered) return null;
  const first = totalPages === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const last  = Math.min(currentPage * pageSize, filteredRows);
  const pages: (number | '...')[] = [];
  if (totalPages > 0) {
    const set = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1].filter(p => p >= 1 && p <= totalPages));
    Array.from(set).sort((a, b) => a - b).forEach((p, i, arr) => {
      if (i > 0 && p - arr[i - 1] > 1) pages.push('...');
      pages.push(p);
    });
  }
  return (
    <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between flex-wrap gap-2">
      <span className="text-xs text-gray-500">
        {filteredRows === 0 ? 'No matching rows' : (
          <>Showing <b className="text-gray-700 dark:text-gray-300">{first}–{last}</b> of <b className="text-gray-700 dark:text-gray-300">{filteredRows}</b>
            {isFiltered && <span className="text-gray-400"> (filtered from {totalRows})</span>} rows</>
        )}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}
            className="px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-white dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">← Prev</button>
          {pages.map((p, i) => p === '...'
            ? <span key={`e${i}`} className="px-2 text-gray-400 text-xs">…</span>
            : <button key={p} onClick={() => onPageChange(p as number)}
                className={`w-8 h-7 text-xs rounded-lg border transition-colors ${p === currentPage ? 'bg-blue-600 text-white border-blue-600 font-medium' : 'text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800'}`}>{p}</button>
          )}
          <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}
            className="px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-white dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next →</button>
        </div>
      )}
    </div>
  );
}

function HighlightedCell({ value, search }: { value: string; search: string }) {
  if (!search) return <>{value}</>;
  const lower       = value.toLowerCase();
  const lowerSearch = search.toLowerCase();
  const parts: React.ReactNode[] = [];
  let last = 0;
  let idx  = lower.indexOf(lowerSearch);
  while (idx !== -1) {
    if (idx > last) parts.push(value.slice(last, idx));
    parts.push(
      <mark key={idx} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">
        {value.slice(idx, idx + search.length)}
      </mark>,
    );
    last = idx + search.length;
    idx  = lower.indexOf(lowerSearch, last);
  }
  if (last < value.length) parts.push(value.slice(last));
  if (parts.length === 0) return <>{value}</>;
  return <>{parts}</>;
}

function SortIcon({ dir }: { dir: SortDir | null }) {
  if (!dir) return (
    <span className="inline-flex flex-col gap-px opacity-25 group-hover:opacity-50 transition-opacity">
      <span className="text-[8px] leading-none">▲</span><span className="text-[8px] leading-none">▼</span>
    </span>
  );
  return <span className="text-[10px] leading-none text-blue-600">{dir === 'asc' ? '▲' : '▼'}</span>;
}

// ── Column Selector ──────────────────────────────────────────────────────────

function ColumnSelector({ meta, selected, preFilters, preFilterOps, onToggle, onSelectAll, onDeselectAll, onFilterChange, onFilterOpChange }: {
  meta: CalcViewColumnsResult; selected: Set<string>; preFilters: Record<string, string>; preFilterOps: Record<string, string>;
  onToggle: (col: string) => void; onSelectAll: () => void; onDeselectAll: () => void;
  onFilterChange: (col: string, value: string) => void; onFilterOpChange: (col: string, op: string) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = meta.columns
    .filter(c =>
      c.columnName.toLowerCase().includes(search.toLowerCase()) ||
      c.dataTypeName.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const aSelected = selected.has(a.columnName);
      const bSelected = selected.has(b.columnName);
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      return a.columnName.localeCompare(b.columnName);
    });
  const activeFilterCount = Object.values(preFilters).filter(v => v.trim()).length;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm">Select Columns & Pre-filters</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {selected.size} of {meta.columns.length} selected
            {activeFilterCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">
                {activeFilterCount} WHERE filter{activeFilterCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onSelectAll} className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">Select All</button>
          <button onClick={onDeselectAll} className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Deselect All</button>
        </div>
      </div>
      <div className="px-4 py-3 border-b border-gray-100">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search columns by name or type…"
          className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-300 dark:placeholder:text-gray-600" />
      </div>
      <div className="grid grid-cols-[auto_1fr_auto_minmax(200px,280px)] gap-x-4 px-5 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide w-5" />
        <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Column</span>
        <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Type</span>
        <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">WHERE Filter</span>
      </div>
      <div className="divide-y divide-gray-50 dark:divide-gray-800 max-h-96 overflow-y-auto">
        {filtered.length === 0
          ? <p className="px-5 py-6 text-center text-gray-400 dark:text-gray-600 text-sm">No columns match.</p>
          : filtered.map(col => {
              const isChecked  = selected.has(col.columnName);
              const filterVal  = preFilters[col.columnName] ?? '';
              const filterOp   = preFilterOps[col.columnName] ?? '=';
              const parsedVals = parseFilterValues(filterVal);
              const hasFilter  = parsedVals.length > 0;
              return (
                <div key={col.columnName}
                  className={`grid grid-cols-[auto_1fr_auto_minmax(200px,280px)] gap-x-4 items-center px-5 py-2.5 transition-colors ${isChecked ? 'bg-blue-50/30 dark:bg-blue-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'} ${hasFilter ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}`}>
                  <input type="checkbox" checked={isChecked} onChange={() => onToggle(col.columnName)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                  <div className="min-w-0">
                    <span className={`text-sm font-mono font-medium ${isChecked ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-500'}`}>{col.columnName}</span>
                    {col.isNullable === 'TRUE' && <span className="ml-1.5 text-[10px] text-gray-300 dark:text-gray-600">nullable</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <TypeBadge type={col.dataTypeName} />
                    {col.length > 0 && <span className="text-[10px] text-gray-300 dark:text-gray-600">({col.length}{col.scale > 0 ? `,${col.scale}` : ''})</span>}
                  </div>
                  <div className="flex gap-1.5 items-start">
                    <select value={filterOp} onChange={e => onFilterOpChange(col.columnName, e.target.value)}
                      className={`text-xs font-mono border rounded-md px-1.5 py-1.5 shrink-0 w-14 focus:outline-none focus:ring-1 transition-colors cursor-pointer ${hasFilter ? 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700 focus:ring-amber-400' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 focus:ring-blue-400'}`}>
                      {['=', '!=', '>', '>=', '<', '<=', 'IN'].map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                    <div className="relative flex-1 min-w-0">
                      <input type="text" value={filterVal} onChange={e => onFilterChange(col.columnName, e.target.value)}
                        placeholder={filterOp === 'IN'
                          ? (col.dataTypeName.match(/INT|DECIMAL|DOUBLE|REAL/i) ? '1,2,3' : 'A,B,C')
                          : (col.dataTypeName.match(/INT|DECIMAL|DOUBLE|REAL/i) ? '100' : 'ABC')}
                        className={`w-full text-xs font-mono border rounded-md px-2.5 py-1.5 pr-6 focus:outline-none focus:ring-1 transition-colors placeholder:text-gray-300 ${hasFilter ? 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-700 focus:ring-amber-400' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-blue-400 focus:border-blue-400'}`} />
                      {filterOp === 'IN' && parsedVals.length > 1 && (
                        <div className="absolute -bottom-5 left-0 flex gap-1 flex-wrap">
                          {parsedVals.map((v, i) => <span key={i} className="inline-block px-1 py-px bg-amber-100 text-amber-700 text-[9px] rounded font-mono leading-none">{v}</span>)}
                        </div>
                      )}
                      {hasFilter && (
                        <button onClick={() => onFilterChange(col.columnName, '')}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs" tabIndex={-1}>✕</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
        }
      </div>
    </div>
  );
}

// ── Compare Modal ─────────────────────────────────────────────────────────────

function CompareModal({
  rowA, rowB, columns, onClose,
}: {
  rowA: Record<string, unknown>;
  rowB: Record<string, unknown>;
  columns: string[];
  onClose: () => void;
}) {
  // Escape key closes the modal
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Classify each differing column
  const { dimensional, kpi } = useMemo(() => {
    const dim: { col: string; valA: string; valB: string }[] = [];
    const kpi: { col: string; valA: string; valB: string; delta: number }[] = [];

    for (const col of columns) {
      const sa = rowA[col] == null ? 'NULL' : String(rowA[col]);
      const sb = rowB[col] == null ? 'NULL' : String(rowB[col]);
      if (sa === sb) continue; // identical — skip entirely

      if (isKpiString(sa) && isKpiString(sb)) {
        kpi.push({ col, valA: sa, valB: sb, delta: Number(sb) - Number(sa) });
      } else {
        dim.push({ col, valA: sa, valB: sb });
      }
    }
    return { dimensional: dim, kpi };
  }, [rowA, rowB, columns]);

  const totalDiffs = dimensional.length + kpi.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* Backdrop — click to close */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-4xl max-h-[85vh] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white text-lg leading-tight">Row Comparison</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {totalDiffs === 0
                ? 'All column values are identical — the rows match completely.'
                : <>
                    <span className="text-red-500 dark:text-red-400 font-semibold">{dimensional.length} dimensional</span>
                    {dimensional.length !== 1 ? ' differences' : ' difference'}
                    {kpi.length > 0 && <> · <span className="text-amber-500 dark:text-amber-400 font-semibold">{kpi.length} KPI</span> {kpi.length !== 1 ? 'values differ' : 'value differs'} (numeric — informational only)</>}
                  </>
              }
            </p>
          </div>
          <button onClick={onClose}
            className="ml-4 shrink-0 p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 p-6 space-y-8">

          {totalDiffs === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-gray-700 dark:text-gray-300 font-semibold text-base">Rows are identical</p>
              <p className="text-gray-400 dark:text-gray-600 text-sm mt-1">Every column value matches exactly.</p>
            </div>
          ) : (
            <>
              {/* ── Dimensional differences ── */}
              {dimensional.length > 0 && (
                <section>
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">Dimensional Differences</h3>
                    <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 text-xs font-bold rounded-full">{dimensional.length}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-600">Text / categorical values that differ — these are the real mismatches</span>
                  </div>

                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {/* Legend row */}
                    <div className="grid grid-cols-[2fr_1fr_1fr] bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <div className="px-4 py-2.5 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Column</div>
                      <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                        <span className="text-blue-600 dark:text-blue-400">Row A</span>
                      </div>
                      <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />
                        <span className="text-violet-600 dark:text-violet-400">Row B</span>
                      </div>
                    </div>
                    {dimensional.map(({ col, valA, valB }, i) => (
                      <div key={col} className={`grid grid-cols-[2fr_1fr_1fr] ${i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'} hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0`}>
                        <div className="px-4 py-3.5 font-mono text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center">{col}</div>
                        <div className="px-4 py-3.5 flex items-center">
                          <span className="font-mono text-xs px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 rounded-lg border border-blue-100 dark:border-blue-900 max-w-full truncate" title={valA}>
                            {valA}
                          </span>
                        </div>
                        <div className="px-4 py-3.5 flex items-center">
                          <span className="font-mono text-xs px-2.5 py-1.5 bg-violet-50 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300 rounded-lg border border-violet-100 dark:border-violet-900 max-w-full truncate" title={valB}>
                            {valB}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── KPI differences (informational) ── */}
              {kpi.length > 0 && (
                <section>
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">KPI / Numeric Values</h3>
                    <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-bold rounded-full">{kpi.length}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-600">Numeric columns — expected to differ, shown for reference</span>
                  </div>

                  <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 overflow-hidden">
                    <div className="grid grid-cols-[2fr_1fr_1fr_1fr] bg-amber-50/70 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-900/50">
                      <div className="px-4 py-2.5 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Column</div>
                      <div className="px-4 py-2.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Row A
                      </div>
                      <div className="px-4 py-2.5 text-[11px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />Row B
                      </div>
                      <div className="px-4 py-2.5 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Delta (B − A)</div>
                    </div>
                    {kpi.map(({ col, valA, valB, delta }, i) => (
                      <div key={col} className={`grid grid-cols-[2fr_1fr_1fr_1fr] ${i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-amber-50/30 dark:bg-amber-900/10'} border-b border-amber-100 dark:border-amber-900/30 last:border-b-0`}>
                        <div className="px-4 py-3 font-mono text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center">{col}</div>
                        <div className="px-4 py-3 font-mono text-xs text-blue-700 dark:text-blue-300 flex items-center">{valA}</div>
                        <div className="px-4 py-3 font-mono text-xs text-violet-700 dark:text-violet-300 flex items-center">{valB}</div>
                        <div className="px-4 py-3 font-mono text-xs flex items-center">
                          <span className={`font-bold ${delta > 0 ? 'text-green-600 dark:text-green-400' : delta < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'}`}>
                            {delta > 0 ? '+' : ''}{delta.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-500 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Numeric columns are shown for reference only — they are not treated as dimension mismatches.
                  </p>
                </section>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-400 dark:text-gray-600">
            Comparing <span className="font-semibold text-blue-600 dark:text-blue-400">Row A</span> vs <span className="font-semibold text-violet-600 dark:text-violet-400">Row B</span> across {columns.length} columns
          </p>
          <button onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Context Menu ──────────────────────────────────────────────────────────────

function ContextMenu({
  x, y, selectionCount, onCompare, onClear, onClose,
}: {
  x: number; y: number; selectionCount: number;
  onCompare: () => void; onClear: () => void; onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position so menu never goes off screen
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    if (!menuRef.current) return;
    const { width, height } = menuRef.current.getBoundingClientRect();
    const nx = x + width  > window.innerWidth  ? x - width  : x;
    const ny = y + height > window.innerHeight ? y - height : y;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  // Close on outside click or Escape
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // Use setTimeout so this listener doesn't fire on the same right-click that opened the menu
    const tid = setTimeout(() => {
      window.addEventListener('mousedown', handler);
      window.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(tid);
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const canCompare = selectionCount === 2;

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 9999 }}
      className="min-w-[220px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl py-1.5 overflow-hidden"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Status header */}
      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700/60 mb-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {selectionCount === 0 && 'No rows selected'}
          {selectionCount === 1 && '1 of 2 rows selected'}
          {selectionCount === 2 && '2 rows selected ✓'}
        </p>
      </div>

      {/* Compare action */}
      <button
        onClick={() => { if (canCompare) { onClose(); onCompare(); } }}
        disabled={!canCompare}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors
          ${canCompare
            ? 'text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer'
            : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'}`}
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        <span>
          <span className="font-medium block leading-tight">Compare rows A &amp; B</span>
          <span className="text-[11px] leading-tight opacity-70">
            {canCompare ? 'Show differences between selected rows' : 'Select exactly 2 rows first'}
          </span>
        </span>
      </button>

      {/* Clear selection */}
      <button
        onClick={() => { onClose(); onClear(); }}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-left"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <span className="font-medium">Clear selection</span>
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function CalcViewExplorer() {
  const [viewName,    setViewName]    = useState('');
  const [topN,        setTopN]        = useState<string>('100');
  const inputRef = useRef<HTMLInputElement>(null);

  const [step,        setStep]        = useState<Step>('idle');
  const [columnError, setColumnError] = useState<string | null>(null);
  const [queryError,  setQueryError]  = useState<string | null>(null);

  const [columnsMeta, setColumnsMeta] = useState<CalcViewColumnsResult | null>(null);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [preFilters,    setPreFilters]    = useState<Record<string, string>>({});
  const [preFilterOps,  setPreFilterOps]  = useState<Record<string, string>>({});

  const [savedQueries,  setSavedQueries]  = useState<SavedQuery[]>([]);
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName,      setSaveName]      = useState('');

  const [result,      setResult]      = useState<CalcViewResult | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [sqlExpanded, setSqlExpanded] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [colFilters,  setColFilters]  = useState<Record<string, string>>({});
  const [sortOrder,   setSortOrder]   = useState<SortEntry[]>([]);

  // ── Row selection & compare ───────────────────────────────────────────────
  // selectedRows stores indices into sortedRows (not page-local indices)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [ctxMenu,      setCtxMenu]      = useState<CtxMenu | null>(null);
  const [compareRows,  setCompareRows]  = useState<{ rowA: Record<string, unknown>; rowB: Record<string, unknown> } | null>(null);

  // ── Load saved queries on mount ───────────────────────────────────────────
  useEffect(() => { setSavedQueries(readSavedQueries()); }, []);

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  const dragCol     = useRef<string | null>(null);
  const dragOverCol = useRef<string | null>(null);
  const [dragActive, setDragActive] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const handleDragStart = useCallback((col: string, e: React.DragEvent) => {
    dragCol.current = col;
    setDragActive(col);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', col);
  }, []);
  const handleDragOver = useCallback((col: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (col !== dragOverCol.current) { dragOverCol.current = col; setDropTarget(col); }
  }, []);
  const handleDragLeave  = useCallback(() => setDropTarget(null), []);
  const handleDrop       = useCallback((targetCol: string) => {
    const src = dragCol.current;
    if (!src || src === targetCol) return;
    setColumnOrder(prev => {
      const next = [...prev];
      const fi = next.indexOf(src); const ti = next.indexOf(targetCol);
      next.splice(fi, 1); next.splice(ti, 0, src);
      return next;
    });
    setDropTarget(null);
  }, []);
  const handleDragEnd = useCallback(() => {
    dragCol.current = null; dragOverCol.current = null;
    setDragActive(null); setDropTarget(null);
  }, []);
  const handleResetColumnOrder = useCallback(() => {
    if (result) setColumnOrder([...result.columns]);
  }, [result]);

  // ── Sort / filter / page ──────────────────────────────────────────────────

  const getSortEntry    = (col: string) => sortOrder.find(s => s.col === col) ?? null;
  const getSortPriority = (col: string) => { const i = sortOrder.findIndex(s => s.col === col); return i === -1 ? null : i + 1; };

  const filteredRows = useMemo(() => {
    if (!result) return [];
    const active = Object.entries(colFilters).filter(([, v]) => v.trim());
    if (!active.length) return result.rows;
    return result.rows.filter(row =>
      active.every(([col, term]) => {
        const cell = row[col];
        return cell != null && String(cell).toLowerCase().includes(term.toLowerCase());
      }),
    );
  }, [result, colFilters]);

  const sortedRows = useMemo(() => {
    if (!sortOrder.length) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      for (const { col, dir } of sortOrder) {
        const av = a[col]; const bv = b[col];
        if (av == null) return 1; if (bv == null) return -1;
        const an = Number(av); const bn = Number(bv);
        const cmp = (!isNaN(an) && !isNaN(bn)) ? an - bn : String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
        if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }, [filteredRows, sortOrder]);

  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE);
  const isFiltered = result !== null && filteredRows.length !== result.rows.length;

  const handleExportCsv = useCallback(() => {
    if (!result || sortedRows.length === 0) return;

    const escape = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const lines = [
      columnOrder.map(escape).join(','),
      ...sortedRows.map(row => columnOrder.map(col => escape(row[col])).join(',')),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const viewShort = result.viewName.split('/').pop()?.replace(/"/g, '') ?? 'export';
    a.href     = url;
    a.download = `${viewShort}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, sortedRows, columnOrder]);

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, currentPage]);

  const isColumnOrderChanged = useMemo(() => {
    if (!result) return false;
    return JSON.stringify(columnOrder) !== JSON.stringify(result.columns);
  }, [columnOrder, result]);

  // ── Row selection handlers ────────────────────────────────────────────────

  const handleRowClick = useCallback((sortedIdx: number, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(sortedIdx)) {
        next.delete(sortedIdx);
      } else {
        if (next.size >= 2) next.clear();
        next.add(sortedIdx);
      }
      return next;
    });
  }, []);

  const handleRowContextMenu = useCallback((sortedIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    // Auto-add the right-clicked row to the selection if not already in it
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (!next.has(sortedIdx)) {
        if (next.size >= 2) next.clear();
        next.add(sortedIdx);
      }
      return next;
    });
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleOpenCompare = useCallback(() => {
    const indices = Array.from(selectedRows).sort((a, b) => a - b);
    if (indices.length !== 2) return;
    const [ia, ib] = indices;
    setCompareRows({ rowA: sortedRows[ia], rowB: sortedRows[ib] });
  }, [selectedRows, sortedRows]);

  const clearSelection = useCallback(() => setSelectedRows(new Set()), []);

  // ── SQL preview ───────────────────────────────────────────────────────────

  const sqlPreview = useMemo(() => {
    const view  = viewName.trim();
    const limit = parseInt(topN, 10) || 100;
    if (!view) return '';
    let colPart = '*';
    if (columnsMeta && selected.size > 0) {
      colPart = columnsMeta.columns.filter(c => selected.has(c.columnName)).map(c => `"${c.columnName}"`).join(', ');
    }
    const whereParts: string[] = [];
    for (const [col, raw] of Object.entries(preFilters)) {
      const vals = raw.split(',').map(v => v.trim()).filter(Boolean);
      if (!vals.length) continue;
      whereParts.push(vals.length === 1 ? `"${col}" = '${vals[0]}'` : `"${col}" IN (${vals.map(v => `'${v}'`).join(', ')})`);
    }
    const where = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';
    return `SELECT TOP ${limit} ${colPart} FROM ${view}${where}`;
  }, [viewName, topN, columnsMeta, selected, preFilters]);

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  const handleLoadColumns = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = viewName.trim();
    if (!trimmed) return;
    setStep('loadingColumns'); setColumnError(null); setColumnsMeta(null);
    setResult(null); setSelected(new Set()); setPreFilters({}); setPreFilterOps({});
    setSortOrder([]); setColFilters({}); setColumnOrder([]);
    try {
      const meta = await fetchCalcViewColumns(trimmed);
      setColumnsMeta(meta);
      setSelected(new Set(meta.columns.map(c => c.columnName)));
      setStep('selectColumns');
    } catch (err) {
      setColumnError(err instanceof Error ? err.message : 'Failed to load columns');
      setStep('idle');
    }
  };

  const handleRunQuery = async () => {
    if (!columnsMeta || selected.size === 0) return;
    setStep('querying'); setQueryError(null); setResult(null);
    setCurrentPage(1); setSortOrder([]); setColFilters({}); setColumnOrder([]);
    clearSelection();
    const orderedColumns = columnsMeta.columns.map(c => c.columnName).filter(n => selected.has(n));
    const activeFilters    = Object.fromEntries(Object.entries(preFilters).filter(([, v]) => v.trim()));
    const activeFilterOps  = Object.fromEntries(Object.entries(preFilterOps).filter(([col]) => preFilters[col]?.trim()));
    try {
      const data = await fetchCalcView(viewName.trim(), orderedColumns, parseInt(topN, 10) || 100, activeFilters, columnsMeta.columns, activeFilterOps);
      setResult(data);
      setColumnOrder([...data.columns]);
      setStep('results');
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Query failed');
      setStep('selectColumns');
    }
  };

  const handleToggleColumn    = useCallback((col: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(col) ? n.delete(col) : n.add(col); return n; });
  }, []);
  const handleSelectAll       = useCallback(() => { if (columnsMeta) setSelected(new Set(columnsMeta.columns.map(c => c.columnName))); }, [columnsMeta]);
  const handleDeselectAll     = useCallback(() => setSelected(new Set()), []);
  const handlePreFilterChange   = useCallback((col: string, val: string) => setPreFilters(prev => ({ ...prev, [col]: val })), []);
  const handlePreFilterOpChange = useCallback((col: string, op: string)  => setPreFilterOps(prev => ({ ...prev, [col]: op })), []);

  const handleSaveQuery = useCallback(() => {
    if (!saveName.trim() || !columnsMeta) return;
    const orderedCols = columnsMeta.columns.map(c => c.columnName).filter(n => selected.has(n));
    const entry: SavedQuery = {
      id:              Date.now().toString(),
      name:            saveName.trim(),
      viewName,
      selectedColumns: orderedCols,
      topN,
      preFilters,
      preFilterOps,
      savedAt:         Date.now(),
    };
    const updated = [entry, ...savedQueries];
    setSavedQueries(updated);
    writeSavedQueries(updated);
    setSaveModalOpen(false);
    setSaveName('');
  }, [saveName, columnsMeta, selected, viewName, topN, preFilters, preFilterOps, savedQueries]);

  const handleDeleteQuery = useCallback((id: string) => {
    const updated = savedQueries.filter(q => q.id !== id);
    setSavedQueries(updated);
    writeSavedQueries(updated);
  }, [savedQueries]);

  const handleLoadQuery = useCallback(async (q: SavedQuery) => {
    setPanelOpen(false);
    setViewName(q.viewName);
    setTopN(q.topN);
    setPreFilters(q.preFilters);
    setPreFilterOps(q.preFilterOps);
    setStep('loadingColumns'); setColumnError(null); setColumnsMeta(null);
    setResult(null); setSelected(new Set());
    setSortOrder([]); setColFilters({}); setColumnOrder([]);
    clearSelection();
    try {
      const meta = await fetchCalcViewColumns(q.viewName.trim());
      setColumnsMeta(meta);
      const validCols = new Set(meta.columns.map(c => c.columnName));
      setSelected(new Set(q.selectedColumns.filter(c => validCols.has(c))));
      setStep('selectColumns');
    } catch (err) {
      setColumnError(err instanceof Error ? err.message : 'Failed to load columns');
      setStep('idle');
    }
  }, [clearSelection]);

  const handleColumnHeaderClick = useCallback((col: string) => {
    if (dragCol.current) return;
    setSortOrder(prev => {
      const ex = prev.find(s => s.col === col);
      if (!ex)              return [...prev, { col, dir: 'asc' }];
      if (ex.dir === 'asc') return prev.map(s => s.col === col ? { col, dir: 'desc' } : s);
      return prev.filter(s => s.col !== col);
    });
    setCurrentPage(1);
  }, []);

  const handleColFilter = useCallback((col: string, value: string) => {
    setColFilters(prev => ({ ...prev, [col]: value }));
    setCurrentPage(1);
    clearSelection();
  }, [clearSelection]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    document.getElementById('results-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleReset = () => {
    setStep('idle'); setColumnsMeta(null); setSelected(new Set()); setPreFilters({}); setPreFilterOps({});
    setResult(null); setColFilters({}); setSortOrder([]); setCurrentPage(1);
    setColumnError(null); setQueryError(null); setColumnOrder([]);
    clearSelection();
    inputRef.current?.focus();
  };

  const handleBackToColumns = () => {
    setStep('selectColumns'); setResult(null);
    setColFilters({}); setSortOrder([]); setCurrentPage(1); setColumnOrder([]);
    clearSelection();
  };

  const activeFilterCount    = Object.values(colFilters).filter(v => v.trim()).length;
  const activePreFilterCount = Object.values(preFilters).filter(v => v.trim()).length;
  const isLoading            = step === 'loadingColumns' || step === 'querying';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-200">

      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">Back</Link>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Calculation View Explorer</span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            {(['1. View', '2. Columns', '3. Results'] as const).map((label, i) => {
              const si = step === 'idle' || step === 'loadingColumns' ? 0 : step === 'selectColumns' || step === 'querying' ? 1 : 2;
              return (
                <span key={label} className={`px-2.5 py-1 rounded-full font-medium transition-colors ${si === i ? 'bg-blue-600 text-white' : si > i ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                  {si > i ? '✓ ' : ''}{label}
                </span>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="w-full px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Calculation View Explorer</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Load columns, apply pre-filters, select columns, then run.</p>
        </div>

        {/* ── Saved Queries Panel ── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setPanelOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Saved Queries</span>
              {savedQueries.length > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 text-xs font-medium rounded-full">
                  {savedQueries.length}
                </span>
              )}
            </div>
            <span className={`text-gray-400 text-xs transition-transform duration-200 ${panelOpen ? 'rotate-180' : 'rotate-0'}`}>▾</span>
          </button>

          {panelOpen && (
            <div className="border-t border-gray-100 dark:border-gray-800">
              {savedQueries.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-gray-400 dark:text-gray-600">
                  No saved queries yet. Run a query and click <span className="font-medium">⊕ Save Query</span>.
                </p>
              ) : (
                <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                  {savedQueries.map(q => (
                    <li key={q.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{q.name}</p>
                        <p className="text-xs font-mono text-gray-400 dark:text-gray-500 truncate mt-0.5">{q.viewName}</p>
                        <p className="text-[11px] text-gray-300 dark:text-gray-600 mt-0.5">
                          {q.selectedColumns.length} col{q.selectedColumns.length !== 1 ? 's' : ''} · top {q.topN} · {relativeTime(q.savedAt)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleLoadQuery(q)}
                        className="shrink-0 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors"
                      >Load</button>
                      <button
                        onClick={() => handleDeleteQuery(q.id)}
                        className="shrink-0 px-2 py-1.5 text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        title="Delete"
                      >✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Step 1 */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-6">
          <form onSubmit={handleLoadColumns} className="space-y-4">
            <div className="flex gap-3 items-end">
              <label className="flex-1 block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Calculation View Name</span>
                <input ref={inputRef} type="text" value={viewName}
                  onChange={e => { setViewName(e.target.value); if (step !== 'idle') handleReset(); }}
                  placeholder='"_SYS_BIC"."package/VIEW_NAME"'
                  className="w-full font-mono text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-gray-600"
                  spellCheck={false} autoComplete="off" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Rows to Return</span>
                <input type="number" min="1" value={topN} onChange={e => setTopN(e.target.value)}
                  className="w-32 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </label>
              <button type="submit" disabled={isLoading || !viewName.trim()}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap">
                {step === 'loadingColumns' ? 'Loading…' : 'Load Columns'}
              </button>
              {step !== 'idle' && (
                <button type="button" onClick={handleReset}
                  className="px-4 py-2.5 text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Reset</button>
              )}
            </div>
            {sqlPreview && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <button type="button" onClick={() => setSqlExpanded(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group">
                  <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium">Generated SQL</span>
                  <span className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors">
                    {sqlExpanded ? 'Minimize' : 'Expand'}
                    <span className={`transition-transform duration-200 ${sqlExpanded ? 'rotate-180' : 'rotate-0'}`}>▾</span>
                  </span>
                </button>
                {sqlExpanded && (
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                    <code className="text-sm text-blue-600 dark:text-blue-400 break-all whitespace-pre-wrap">{sqlPreview}</code>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        {columnError && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-red-500 mt-0.5">✕</span>
            <div><p className="text-red-800 dark:text-red-300 font-medium text-sm">Failed to load columns</p><p className="text-red-600 dark:text-red-400 text-sm mt-0.5">{columnError}</p></div>
          </div>
        )}

        {isLoading && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-8 flex items-center gap-4">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {step === 'loadingColumns' ? 'Fetching column metadata from SYS.VIEW_COLUMNS…' : 'Running query on HANA…'}
            </p>
          </div>
        )}

        {/* Step 2 */}
        {(step === 'selectColumns' || step === 'querying') && columnsMeta && (
          <div className="space-y-4">
            <ColumnSelector meta={columnsMeta} selected={selected} preFilters={preFilters} preFilterOps={preFilterOps}
              onToggle={handleToggleColumn} onSelectAll={handleSelectAll} onDeselectAll={handleDeselectAll}
              onFilterChange={handlePreFilterChange} onFilterOpChange={handlePreFilterOpChange} />
            {queryError && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-start gap-3">
                <span className="text-red-500 mt-0.5">✕</span>
                <div><p className="text-red-800 dark:text-red-300 font-medium text-sm">Query failed</p><p className="text-red-600 dark:text-red-400 text-sm mt-0.5">{queryError}</p></div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={handleRunQuery} disabled={selected.size === 0 || step === 'querying'}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {step === 'querying' ? 'Running…' : `Run Query (${selected.size} col${selected.size !== 1 ? 's' : ''}${activePreFilterCount > 0 ? `, ${activePreFilterCount} WHERE filter${activePreFilterCount !== 1 ? 's' : ''}` : ''})`}
              </button>
              {selected.size === 0 && <p className="text-xs text-red-500 dark:text-red-400">Select at least one column.</p>}
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {step === 'results' && result && (
          <div id="results-table" className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">

            {/* Header bar */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 flex-wrap gap-3">
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-200 text-sm">Results</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5 truncate max-w-xl">{result.viewName}</p>
                {result.appliedWhere && (
                  <p className="text-xs text-amber-600 font-mono mt-0.5 truncate max-w-2xl">{result.appliedWhere}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={handleBackToColumns}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">← Edit Columns</button>
                <button onClick={() => { setSaveName(defaultQueryName(viewName)); setSaveModalOpen(true); }}
                  className="px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors">⊕ Save Query</button>
                <button onClick={handleExportCsv}
                  className="px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-50 dark:hover:bg-green-950 transition-colors">↓ Export CSV</button>
                <span className="text-xs text-gray-500 dark:text-gray-400">{columnOrder.length} columns</span>
                <span className="inline-flex items-center px-2.5 py-1 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 text-xs font-medium rounded-full">
                  {result.total} row{result.total !== 1 ? 's' : ''} fetched
                </span>

                {/* Row selection status */}
                {selectedRows.size > 0 && (
                  <>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${
                      selectedRows.size === 2
                        ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                        : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                    }`}>
                      <span className="w-2 h-2 rounded-full bg-current opacity-70 inline-block" />
                      {selectedRows.size === 2 ? 'Right-click any row to compare' : '1 row selected — click one more'}
                    </span>
                    <button onClick={clearSelection}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-medium rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                      ✕ clear
                    </button>
                  </>
                )}

                {isFiltered && (
                  <span className="inline-flex items-center px-2.5 py-1 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-400 text-xs font-medium rounded-full">
                    {filteredRows.length} match{filteredRows.length !== 1 ? 'es' : ''}
                  </span>
                )}
                {totalPages > 1 && (
                  <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-full">
                    Page {currentPage} of {totalPages}
                  </span>
                )}
                {isColumnOrderChanged && (
                  <button onClick={handleResetColumnOrder}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-xs font-medium rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors">
                    ↺ Reset column order
                  </button>
                )}
                {sortOrder.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {sortOrder.map((s, i) => (
                      <span key={s.col} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 text-xs font-medium rounded-full">
                        <span className="text-blue-400">{i + 1}</span>{s.col}<span>{s.dir === 'asc' ? '▲' : '▼'}</span>
                      </span>
                    ))}
                    <button onClick={() => { setSortOrder([]); setCurrentPage(1); }}
                      className="px-2 py-1 bg-blue-50 dark:bg-blue-950 text-blue-500 text-xs font-medium rounded-full hover:bg-blue-100 transition-colors">✕ sort</button>
                  </div>
                )}
                {activeFilterCount > 0 && (
                  <button onClick={() => { setColFilters({}); setCurrentPage(1); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-xs font-medium rounded-full hover:bg-red-100 transition-colors">
                    ✕ {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
                  </button>
                )}
              </div>
            </div>

            {result.rows.length === 0 ? (
              <div className="p-12 text-center text-gray-400 dark:text-gray-600 text-sm">No rows returned.</div>
            ) : (
              <>
                {/* Selection hint when nothing selected yet */}
                {selectedRows.size === 0 && (
                  <div className="px-5 py-2.5 bg-blue-50/50 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900/30 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-xs text-blue-500 dark:text-blue-400">Click any row to select it, then select a second row and right-click to compare.</p>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wide w-10 bg-gray-50 dark:bg-gray-800 select-none">#</th>
                        {columnOrder.map(col => {
                          const entry      = getSortEntry(col);
                          const priority   = getSortPriority(col);
                          const isActive   = !!entry;
                          const isDragging = dragActive === col;
                          const isDropZone = dropTarget === col && dragActive !== col;
                          return (
                            <th key={col} draggable
                              onDragStart={e => handleDragStart(col, e)}
                              onDragOver={e => handleDragOver(col, e)}
                              onDragLeave={handleDragLeave}
                              onDrop={() => handleDrop(col)}
                              onDragEnd={handleDragEnd}
                              onClick={() => handleColumnHeaderClick(col)}
                              className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap select-none group transition-all cursor-grab active:cursor-grabbing
                                ${isActive   ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400' : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}
                                ${isDragging ? 'opacity-40' : ''}
                                ${isDropZone ? 'border-l-2 border-blue-500' : ''}
                                ${!isDragging && !isDropZone && !isActive ? 'hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300' : ''}
                              `}
                              title="Drag to reorder · Click to sort"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-300 dark:text-gray-600 group-hover:text-gray-400 text-xs leading-none cursor-grab" aria-hidden>⠿</span>
                                <span>{col}</span>
                                {priority !== null && sortOrder.length > 1 && (
                                  <span className="inline-flex items-center justify-center w-4 h-4 bg-blue-600 text-white text-[9px] font-bold rounded-full">{priority}</span>
                                )}
                                <SortIcon dir={entry?.dir ?? null} />
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                        <td className="px-3 py-2" />
                        {columnOrder.map(col => (
                          <td key={col} className="px-2 py-2">
                            <div className="relative">
                              <input type="text" value={colFilters[col] ?? ''} onChange={e => handleColFilter(col, e.target.value)}
                                placeholder="Filter…"
                                className={`w-full text-xs border rounded-md px-2.5 py-1.5 pr-6 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors placeholder:text-gray-300 dark:placeholder:text-gray-600 font-mono min-w-[80px]
                                  ${colFilters[col]?.trim() ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/60 text-gray-700 dark:text-gray-200'}`} />
                              {colFilters[col]?.trim() && (
                                <button onClick={() => handleColFilter(col, '')}
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs" tabIndex={-1}>✕</button>
                              )}
                            </div>
                          </td>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {pagedRows.length === 0 ? (
                        <tr><td colSpan={columnOrder.length + 1} className="px-4 py-10 text-center text-gray-400 dark:text-gray-600 text-sm">No rows match the current filters.</td></tr>
                      ) : (
                        pagedRows.map((row, rowIdx) => {
                          // sortedIdx is the row's position in the full sortedRows array — stable across pages
                          const sortedIdx  = (currentPage - 1) * PAGE_SIZE + rowIdx;
                          const isSelected = selectedRows.has(sortedIdx);
                          const selSlot    = Array.from(selectedRows).sort((a, b) => a - b).indexOf(sortedIdx); // 0=A,1=B,-1=none

                          return (
                            <tr key={rowIdx}
                              onClick={e => handleRowClick(sortedIdx, e)}
                              onContextMenu={e => handleRowContextMenu(sortedIdx, e)}
                              className={`border-b border-gray-50 dark:border-gray-800 transition-colors cursor-pointer
                                ${isSelected
                                  ? selSlot === 0
                                    ? 'bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-950/70'
                                    : 'bg-violet-50 dark:bg-violet-950/50 hover:bg-violet-100 dark:hover:bg-violet-950/70'
                                  : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/40'}
                              `}
                            >
                              <td className="px-4 py-3 text-xs font-mono w-10 shrink-0 select-none">
                                {isSelected ? (
                                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white ${selSlot === 0 ? 'bg-blue-500' : 'bg-violet-500'}`}>
                                    {selSlot === 0 ? 'A' : 'B'}
                                  </span>
                                ) : (
                                  <span className="text-gray-300 dark:text-gray-700">{sortedIdx + 1}</span>
                                )}
                              </td>
                              {columnOrder.map(col => {
                                const val     = row[col];
                                const display = val == null ? null : String(val);
                                const active  = !!getSortEntry(col);
                                return (
                                  <td key={col}
                                    className={`px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300 max-w-xs whitespace-nowrap overflow-hidden text-ellipsis ${active ? 'bg-blue-50/40 dark:bg-blue-950/30' : ''}`}
                                    title={display ?? ''}>
                                    {display === null
                                      ? <span className="text-gray-300 dark:text-gray-600 italic">NULL</span>
                                      : <HighlightedCell value={display} search={colFilters[col]?.trim() ?? ''} />
                                    }
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange}
                  totalRows={result.total} filteredRows={sortedRows.length} pageSize={PAGE_SIZE} isFiltered={isFiltered} />
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Context menu ── */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          selectionCount={selectedRows.size}
          onCompare={handleOpenCompare}
          onClear={clearSelection}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* ── Save Query modal ── */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSaveModalOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">Save Query</h3>
            <label className="block mb-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Name</span>
              <input
                type="text"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveQuery(); if (e.key === 'Escape') setSaveModalOpen(false); }}
                autoFocus
                className="w-full text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSaveModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
              <button onClick={handleSaveQuery} disabled={!saveName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Compare modal ── */}
      {compareRows && (
        <CompareModal
          rowA={compareRows.rowA}
          rowB={compareRows.rowB}
          columns={columnOrder}
          onClose={() => setCompareRows(null)}
        />
      )}

    </div>
  );
}
