import { Database, Eye, KeyRound, RefreshCw, Search, ShieldAlert, Table2, Terminal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyPanel, Pager } from '@/components/common';
import { PageHeader, Panel } from '@/components/page';
import { NativeSelect } from '@/components/select';
import { CountPill, InfoNote } from '@/components/summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { formatNumber, useApp } from '@/lib/store';
import type { RawColumn, RawPage, RawValue } from '@/lib/types';
import { cn } from '@/lib/utils';

type CellTarget = { rowid: string; index: number };
type EditType = 'integer' | 'real' | 'text' | 'null';

export function RawScreen() {
  const rawTables = useApp((state) => state.rawTables);
  const rawPage = useApp((state) => state.rawPage);
  const save = useApp((state) => state.save);
  const pending = useApp((state) => state.pending);
  const compactRows = useApp((state) => state.settings.compactRows);
  const loadRawPage = useApp((state) => state.loadRawPage);
  const [tableQuery, setTableQuery] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [cell, setCell] = useState<CellTarget | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const tables = useMemo(() => {
    const needle = tableQuery.trim().toLowerCase();
    return needle ? rawTables.filter((table) => table.name.toLowerCase().includes(needle)) : rawTables;
  }, [rawTables, tableQuery]);

  const busy = pending !== null || refreshing;

  if (!save) return null;

  async function openTable(table: string): Promise<void> {
    setRefreshing(true);
    setSearchDraft('');
    setCell(null);
    try {
      await loadRawPage(table, 0, '');
    } finally {
      setRefreshing(false);
    }
  }

  async function applySearch(): Promise<void> {
    if (!rawPage) return;
    setRefreshing(true);
    try {
      await loadRawPage(rawPage.table, 0, searchDraft);
    } finally {
      setRefreshing(false);
    }
  }

  async function refresh(): Promise<void> {
    if (!rawPage) return;
    setRefreshing(true);
    try {
      await loadRawPage(rawPage.table, rawPage.offset, rawPage.search ?? '');
    } finally {
      setRefreshing(false);
    }
  }

  const pages = rawPage ? Math.max(1, Math.ceil(rawPage.total / rawPage.limit)) : 1;
  const page = rawPage ? Math.floor(rawPage.offset / rawPage.limit) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Account ${save.accountId} · Slot ${save.slot}`}
        title="Raw database"
        description="The escape hatch: browse every table in the decrypted save and edit one cell at a time. Values are validated before they are written."
        actions={
          rawPage ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
              {refreshing ? <Spinner /> : <RefreshCw />}
              Refresh
            </Button>
          ) : undefined
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
        <Panel title="Tables" actions={<Badge variant="outline">{rawTables.length}</Badge>} contentClassName="p-0">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={tableQuery}
                onChange={(event) => setTableQuery(event.target.value)}
                placeholder="Filter tables"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
          <div className="scroll-thin max-h-[32rem] overflow-y-auto p-1.5">
            {tables.map((table) => {
              const active = rawPage?.table === table.name;
              return (
                <button
                  key={table.name}
                  type="button"
                  onClick={() => void openTable(table.name)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                    active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                >
                  <Table2 className={cn('size-3.5 shrink-0', active ? 'text-brand' : 'text-muted-foreground/70')} />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{table.name}</span>
                  <span className="numeric shrink-0 text-[10px] text-muted-foreground">{formatNumber(table.rows)}</span>
                </button>
              );
            })}
            {tables.length === 0 && <p className="p-6 text-center text-xs text-muted-foreground">No table matches.</p>}
          </div>
        </Panel>

        {rawPage ? (
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card/60 p-2 shadow-xs">
              <div className="flex min-w-0 items-center gap-2 px-1">
                <Database className="size-4 text-brand" />
                <span className="truncate font-mono text-xs font-medium">{rawPage.table}</span>
                <CountPill>{formatNumber(rawPage.total)} rows</CountPill>
                <CountPill>{rawPage.columns.length} cols</CountPill>
              </div>
              <form
                className="flex min-w-52 flex-1 items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  void applySearch();
                }}
              >
                <div className="relative min-w-40 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.target.value)}
                    placeholder="Search every column"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Button type="submit" size="sm" variant="outline" disabled={busy}>
                  Find
                </Button>
                {rawPage.search && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    title="Clear the search"
                    onClick={() => {
                      setSearchDraft('');
                      void loadRawPage(rawPage.table, 0, '');
                    }}
                  >
                    <X />
                    <span className="sr-only">Clear search</span>
                  </Button>
                )}
              </form>
              <Button variant="outline" size="sm" onClick={() => setSchemaOpen(true)}>
                <Eye />
                Schema
              </Button>
              <div className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-[11px]">
                <Switch checked={advanced} onCheckedChange={setAdvanced} aria-label="Advanced editing" />
                <span className={cn('font-medium', advanced ? 'text-amber-300' : 'text-muted-foreground')}>
                  Advanced editing
                </span>
              </div>
            </div>

            {rawPage.readOnly && (
              <InfoNote tone="warning">
                <span className="inline-flex items-center gap-1 font-medium text-amber-200">
                  <ShieldAlert className="size-3" />
                  Seed table.
                </span>{' '}
                {rawPage.table} describes what a new save starts with. It is shown for reference and cannot be edited.
              </InfoNote>
            )}
            {advanced && !rawPage.readOnly && (
              <InfoNote tone="warning">
                <span className="inline-flex items-center gap-1 font-medium text-amber-200">
                  <ShieldAlert className="size-3" />
                  Advanced editing is on.
                </span>{' '}
                Key and link columns can now be changed. Editing an id moves the row or leaves the rows that point at it
                orphaned, and the game may refuse the save.
              </InfoNote>
            )}

            <Panel contentClassName="p-0" className="overflow-hidden">
              <div className="scroll-thin max-h-[62vh] overflow-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr>
                      <th className="border-b bg-card px-3 py-2 font-mono text-[10px] font-medium text-muted-foreground">
                        rowid
                      </th>
                      {rawPage.columns.map((column) => (
                        <th
                          key={column.name}
                          title={column.name}
                          className="border-b bg-card px-3 py-2 whitespace-nowrap"
                        >
                          <span className="flex items-center gap-1 font-mono text-[10px] font-medium">
                            {column.primaryKey && <KeyRound className="size-2.5 text-brand" />}
                            {column.name}
                          </span>
                          <span className="block text-[9px] font-normal text-muted-foreground/60">
                            {column.kind || 'ANY'}
                            {column.notNull ? ' · not null' : ''}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawPage.rows.map((row) => (
                      <tr key={row.rowid} className="group hover:bg-accent/30">
                        <td className="border-b px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                          {row.rowid}
                        </td>
                        {row.cells.map((value, index) => {
                          const column = rawPage.columns[index];
                          const locked =
                            !column ||
                            rawPage.readOnly ||
                            column.name === 'USER_DBID' ||
                            value.type === 'blob' ||
                            (column.readOnly && !advanced);
                          return (
                            <td key={column?.name ?? index} className="max-w-64 border-b p-0">
                              <button
                                type="button"
                                disabled={!column}
                                onClick={() => column && setCell({ rowid: row.rowid, index })}
                                className={cn(
                                  'block w-full max-w-64 truncate px-3 text-left font-mono text-[11px]',
                                  compactRows ? 'py-1' : 'py-1.5',
                                  locked ? 'cursor-default text-muted-foreground' : 'hover:bg-brand/10',
                                )}
                                title={`${column?.name ?? 'value'}: ${cellTitle(value)}`}
                              >
                                <CellText value={value} />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t px-3 py-2">
                <Pager
                  page={page}
                  pages={pages}
                  total={rawPage.total}
                  onPage={(next) => void loadRawPage(rawPage.table, next * rawPage.limit, rawPage.search ?? '')}
                />
              </div>
            </Panel>

            <div className="grid gap-2 md:grid-cols-2">
              <InfoNote>
                Click any cell to edit it. Integer values are carried as strings so 64-bit ids survive the round trip.
                Blob cells are shown as base64 and are read-only.
              </InfoNote>
              <InfoNote tone="warning">
                <span className="inline-flex items-center gap-1 font-medium text-amber-200">
                  <ShieldAlert className="size-3" />
                  Raw edits bypass the typed validation.
                </span>{' '}
                Keys and link columns are locked until you turn on advanced editing. Keep a backup before changing
                anything that another row points at.
              </InfoNote>
            </div>
          </div>
        ) : (
          <EmptyPanel
            icon={<Terminal />}
            title="Choose a table"
            description="Pick a table on the left to browse its rows. The editor loads 100 rows per page."
          />
        )}
      </div>

      {rawPage && (
        <CellDialog
          page={rawPage}
          target={cell}
          open={cell !== null}
          busy={busy}
          advanced={advanced}
          onOpenChange={(open) => !open && setCell(null)}
          onSave={(column, value) => {
            if (!cell) return;
            void rawUpdateCell(rawPage.table, cell.rowid, column, value, advanced);
            setCell(null);
          }}
        />
      )}

      {rawPage && <SchemaDialog page={rawPage} open={schemaOpen} onOpenChange={setSchemaOpen} />}
    </div>
  );

  async function rawUpdateCell(
    table: string,
    rowid: string,
    column: string,
    value: RawValue,
    advancedEditing: boolean,
  ): Promise<void> {
    await useApp.getState().rawUpdate(table, rowid, column, value, advancedEditing);
  }
}

function CellText({ value }: { value: RawValue }) {
  switch (value.type) {
    case 'null':
      return <span className="text-muted-foreground/50 italic">NULL</span>;
    case 'blob':
      return <span className="text-violet-300/80">blob · {base64Bytes(value.value)} B</span>;
    case 'text':
      return value.value === '' ? (
        <span className="text-muted-foreground/50 italic">empty</span>
      ) : (
        <span>{value.value}</span>
      );
    case 'real':
      return <span className="text-sky-300/90">{value.value}</span>;
    default:
      return <span className="numeric">{value.value}</span>;
  }
}

function cellTitle(value: RawValue): string {
  if (value.type === 'blob') return `Blob, ${base64Bytes(value.value)} bytes (read-only)`;
  if (value.type === 'null') return 'NULL';
  return String(value.value);
}

function rawText(value: RawValue): string {
  if (value.type === 'null') return 'NULL';
  return String(value.value);
}

function base64Bytes(text: string): number {
  return Math.floor((text.length * 3) / 4);
}

function CellDialog({
  page,
  target,
  open,
  busy,
  advanced,
  onOpenChange,
  onSave,
}: {
  page: RawPage;
  target: CellTarget | null;
  open: boolean;
  busy: boolean;
  advanced: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (column: string, value: RawValue) => void;
}) {
  const column = target ? page.columns[target.index] : undefined;
  const value = target ? page.rows.find((row) => row.rowid === target.rowid)?.cells[target.index] : undefined;
  const signature = target ? `${target.rowid}:${target.index}` : '';
  const [draft, setDraft] = useState('');
  const [type, setType] = useState<EditType>('text');
  const [wasOpen, setWasOpen] = useState(false);
  const [wasSignature, setWasSignature] = useState('');

  const allowed = allowedTypes(column);

  if (open && (!wasOpen || wasSignature !== signature)) {
    setWasOpen(true);
    setWasSignature(signature);
    if (value) {
      const preferred = initialType(value, column);
      setType(allowed.includes(preferred) ? preferred : (allowed[0] ?? 'text'));
      setDraft(displayDraft(value));
    }
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const keyLocked = Boolean(column?.readOnly) && !advanced;
  const locked = !column || page.readOnly || column.name === 'USER_DBID' || value?.type === 'blob' || keyLocked;
  const valid =
    type === 'null' || (type === 'integer' ? validInteger(draft) : type === 'real' ? validReal(draft) : true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-sm">
            <Database className="size-4 text-brand" />
            {page.table}.{column?.name ?? '?'}
          </DialogTitle>
          <DialogDescription>
            Row {target?.rowid ?? '?'} · {column?.kind || 'ANY'}
            {column?.primaryKey ? ' · primary key' : ''}
            {column?.notNull ? ' · not null' : ''}
          </DialogDescription>
        </DialogHeader>

        {locked ? (
          <div className="space-y-3">
            <InfoNote tone="warning">
              {page.readOnly
                ? 'Seed tables describe a new save and are never edited.'
                : column?.name === 'USER_DBID'
                  ? 'USER_DBID identifies the account and is protected from edits.'
                  : keyLocked
                    ? 'This is a key or link column. Turn on advanced editing to change it.'
                    : 'Blob columns are shown for inspection but cannot be written by the editor.'}
            </InfoNote>
            <pre className="scroll-thin max-h-48 overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-[11px] whitespace-pre-wrap break-all">
              {value ? rawText(value) : 'NULL'}
            </pre>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="raw-type">Type</Label>
                <NativeSelect
                  id="raw-type"
                  value={type}
                  onChange={(event) => setType(event.target.value as EditType)}
                  className="w-full"
                >
                  {allowed.map((option) => (
                    <option key={option} value={option}>
                      {option === 'null' ? 'NULL' : option.charAt(0).toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="raw-value">Value</Label>
                {type === 'null' ? (
                  <div className="flex h-8 items-center rounded-md border border-dashed px-2 text-xs text-muted-foreground">
                    SQL NULL
                  </div>
                ) : type === 'text' ? (
                  <textarea
                    id="raw-value"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30"
                  />
                ) : (
                  <Input
                    id="raw-value"
                    value={draft}
                    inputMode={type === 'integer' ? 'numeric' : 'decimal'}
                    className="numeric font-mono text-xs"
                    onChange={(event) => setDraft(event.target.value)}
                  />
                )}
              </div>
            </div>
            {!valid && (
              <p className="text-xs text-destructive">
                {type === 'integer' ? 'Enter a signed 64-bit integer.' : 'Enter a finite decimal number.'}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Only the storage classes this column can hold are offered. The value is checked again in Rust before it is
              written.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!locked && (
            <Button
              disabled={busy || !valid || !column}
              onClick={() => column && onSave(column.name, buildValue(type, draft))}
            >
              {busy ? <Spinner /> : <Terminal />}
              Write cell
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SchemaDialog({
  page,
  open,
  onOpenChange,
}: {
  page: RawPage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{page.table}</DialogTitle>
          <DialogDescription>{page.columns.length} columns in this table.</DialogDescription>
        </DialogHeader>
        <div className="scroll-thin max-h-96 overflow-y-auto rounded-lg border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th className="border-b px-3 py-2 text-[10px] tracking-wide text-muted-foreground uppercase">Column</th>
                <th className="border-b px-3 py-2 text-[10px] tracking-wide text-muted-foreground uppercase">Type</th>
                <th className="border-b px-3 py-2 text-[10px] tracking-wide text-muted-foreground uppercase">Flags</th>
              </tr>
            </thead>
            <tbody>
              {page.columns.map((column) => (
                <SchemaRow key={column.name} column={column} />
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SchemaRow({ column }: { column: RawColumn }) {
  return (
    <tr>
      <td className="border-b px-3 py-1.5 font-mono text-[11px]">{column.name}</td>
      <td className="border-b px-3 py-1.5 font-mono text-[10px] text-muted-foreground">{column.kind || 'ANY'}</td>
      <td className="border-b px-3 py-1.5">
        <div className="flex gap-1">
          {column.primaryKey && (
            <Badge variant="outline" className="text-[9px]">
              PK
            </Badge>
          )}
          {column.notNull && (
            <Badge variant="outline" className="text-[9px]">
              NOT NULL
            </Badge>
          )}
          {column.name === 'USER_DBID' && (
            <Badge variant="outline" className="text-[9px]">
              protected
            </Badge>
          )}
          {column.readOnly && !column.primaryKey && column.name !== 'USER_DBID' && (
            <Badge variant="outline" className="text-[9px]">
              link
            </Badge>
          )}
        </div>
      </td>
    </tr>
  );
}

function initialType(value: RawValue, column: RawColumn | undefined): EditType {
  if (value.type === 'null') {
    const kind = column?.kind.toUpperCase() ?? '';
    if (kind.includes('INT')) return 'integer';
    if (kind.includes('REAL') || kind.includes('FLOA') || kind.includes('DOUB')) return 'real';
    return 'text';
  }
  if (value.type === 'integer') return 'integer';
  if (value.type === 'real') return 'real';
  return 'text';
}

/** The storage classes the backend will accept for this column. */
function allowedTypes(column: RawColumn | undefined): EditType[] {
  const kind = (column?.kind ?? '').toUpperCase();
  let types: EditType[];
  if (!kind || kind.includes('BLOB')) {
    types = ['integer', 'real', 'text'];
  } else if (kind.includes('INT')) {
    types = ['integer'];
  } else if (kind.includes('CHAR') || kind.includes('CLOB') || kind.includes('TEXT')) {
    types = ['text'];
  } else if (kind.includes('REAL') || kind.includes('FLOA') || kind.includes('DOUB')) {
    types = ['real', 'integer'];
  } else {
    types = ['real', 'integer'];
  }
  if (column && !column.notNull) types.push('null');
  return types;
}

function displayDraft(value: RawValue): string {
  switch (value.type) {
    case 'null':
      return '';
    case 'text':
      return value.value;
    case 'integer':
      return value.value;
    case 'real':
      return String(value.value);
    default:
      return '';
  }
}

function buildValue(type: EditType, draft: string): RawValue {
  if (type === 'null') return { type: 'null' };
  if (type === 'integer') return { type: 'integer', value: draft.trim() };
  if (type === 'real') return { type: 'real', value: Number(draft) };
  return { type: 'text', value: draft };
}

function validInteger(text: string): boolean {
  const trimmed = text.trim();
  if (!/^-?\d+$/.test(trimmed)) return false;
  try {
    const value = BigInt(trimmed);
    return value >= -9223372036854775808n && value <= 9223372036854775807n;
  } catch {
    return false;
  }
}

function validReal(text: string): boolean {
  return text.trim() !== '' && Number.isFinite(Number(text));
}
