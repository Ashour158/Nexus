'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Boxes,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  Maximize2,
  Network,
  Search,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff } from '@/lib/use-bff';
import { SetupHeader } from '@/components/settings/setup-ui';

// ─── Derived schema model ─────────────────────────────────────────────────────

type EntityKind = 'standard' | 'custom';
type RelationKind = 'standard' | 'lookup' | 'multilookup' | 'rollup' | 'subform';

interface SchemaField {
  key: string;
  label: string;
  type: string;
  pk?: boolean;
  lookup?: boolean;
  /** Resolved target entity key when this field references another module. */
  target?: string;
  custom?: boolean;
}
interface SchemaEntity {
  key: string;
  label: string;
  plural: string;
  kind: EntityKind;
  icon?: string;
  fields: SchemaField[];
}
interface SchemaEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: RelationKind;
}
interface DerivedSchema {
  entities: SchemaEntity[];
  edges: SchemaEdge[];
  meta: { customModules: number; customFieldDefs: number; source: 'live' | 'baseline' };
}

// ─── Raw wire shapes (metadata-service) ───────────────────────────────────────

interface RawModule {
  id: string;
  apiName: string;
  label: string;
  pluralLabel?: string;
  icon?: string;
}
interface RawModuleField {
  id: string;
  apiName: string;
  label: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  lookupModule?: string | null;
  config?: Record<string, unknown> | null;
}
interface RawStandardField {
  id: string;
  entityType: string;
  name: string;
  apiKey: string;
  fieldType: string;
  required?: boolean;
  config?: Record<string, unknown> | null;
}

const STANDARD_ENTITY_KEYS = ['lead', 'contact', 'account', 'deal'] as const;

/** Built-in CRM entities + their seeded FK relationships (rendered even when the
 *  metadata service is empty or unreachable, so the diagram is never blank). */
const STANDARD_ENTITIES: SchemaEntity[] = [
  {
    key: 'lead',
    label: 'Lead',
    plural: 'Leads',
    kind: 'standard',
    icon: '🎯',
    fields: [
      { key: 'id', label: 'id', type: 'ID', pk: true },
      { key: 'firstName', label: 'firstName', type: 'TEXT' },
      { key: 'lastName', label: 'lastName', type: 'TEXT' },
      { key: 'email', label: 'email', type: 'EMAIL' },
      { key: 'phone', label: 'phone', type: 'PHONE' },
      { key: 'company', label: 'company', type: 'TEXT' },
      { key: 'status', label: 'status', type: 'PICKLIST' },
      { key: 'source', label: 'source', type: 'PICKLIST' },
      { key: 'score', label: 'score', type: 'NUMBER' },
      { key: 'ownerId', label: 'ownerId', type: 'USER' },
    ],
  },
  {
    key: 'account',
    label: 'Account',
    plural: 'Accounts',
    kind: 'standard',
    icon: '🏢',
    fields: [
      { key: 'id', label: 'id', type: 'ID', pk: true },
      { key: 'name', label: 'name', type: 'TEXT' },
      { key: 'industry', label: 'industry', type: 'PICKLIST' },
      { key: 'website', label: 'website', type: 'URL' },
      { key: 'phone', label: 'phone', type: 'PHONE' },
      { key: 'type', label: 'type', type: 'PICKLIST' },
      { key: 'ownerId', label: 'ownerId', type: 'USER' },
    ],
  },
  {
    key: 'contact',
    label: 'Contact',
    plural: 'Contacts',
    kind: 'standard',
    icon: '👤',
    fields: [
      { key: 'id', label: 'id', type: 'ID', pk: true },
      { key: 'firstName', label: 'firstName', type: 'TEXT' },
      { key: 'lastName', label: 'lastName', type: 'TEXT' },
      { key: 'email', label: 'email', type: 'EMAIL' },
      { key: 'phone', label: 'phone', type: 'PHONE' },
      { key: 'title', label: 'title', type: 'TEXT' },
      { key: 'accountId', label: 'accountId', type: 'LOOKUP', lookup: true, target: 'account' },
      { key: 'ownerId', label: 'ownerId', type: 'USER' },
    ],
  },
  {
    key: 'deal',
    label: 'Deal',
    plural: 'Deals',
    kind: 'standard',
    icon: '💰',
    fields: [
      { key: 'id', label: 'id', type: 'ID', pk: true },
      { key: 'name', label: 'name', type: 'TEXT' },
      { key: 'amount', label: 'amount', type: 'CURRENCY' },
      { key: 'stage', label: 'stage', type: 'PICKLIST' },
      { key: 'closeDate', label: 'closeDate', type: 'DATE' },
      { key: 'accountId', label: 'accountId', type: 'LOOKUP', lookup: true, target: 'account' },
      { key: 'contactId', label: 'contactId', type: 'LOOKUP', lookup: true, target: 'contact' },
      { key: 'ownerId', label: 'ownerId', type: 'USER' },
    ],
  },
];

const STANDARD_EDGES: SchemaEdge[] = [
  { id: 'std-contact-account', from: 'contact', to: 'account', label: 'belongs to', kind: 'standard' },
  { id: 'std-deal-account', from: 'deal', to: 'account', label: 'belongs to', kind: 'standard' },
  { id: 'std-deal-contact', from: 'deal', to: 'contact', label: 'primary contact', kind: 'standard' },
];

function normalizeType(t: string): string {
  return (t || '').toLowerCase();
}

/** Extracts a relationship target apiName + kind from a field's type/config. */
function relationFrom(
  type: string,
  lookupModule: string | null | undefined,
  config: Record<string, unknown> | null | undefined
): { target: string; kind: RelationKind } | null {
  const t = normalizeType(type);
  const cfg = (config ?? {}) as Record<string, unknown>;
  const cfgLookup = typeof cfg.lookupModule === 'string' ? cfg.lookupModule : undefined;
  const junction = typeof cfg.junctionModule === 'string' ? cfg.junctionModule : undefined;
  const rollup = cfg.rollup as { childModule?: string } | undefined;
  const target = (lookupModule || cfgLookup || junction || rollup?.childModule || '').trim();
  if (!target) return null;
  if (t.includes('multi') && t.includes('lookup')) return { target, kind: 'multilookup' };
  if (t.includes('lookup')) return { target, kind: 'lookup' };
  if (t.includes('rollup')) return { target, kind: 'rollup' };
  if (t.includes('subform')) return { target, kind: 'subform' };
  return { target, kind: 'lookup' };
}

/** Build the entity/edge graph from live metadata, seeded with the CRM baseline. */
function deriveSchema(
  modules: RawModule[],
  moduleFields: Record<string, RawModuleField[]>,
  standardFields: Record<string, RawStandardField[]>
): DerivedSchema {
  // Deep-clone the baseline so per-render custom fields don't accumulate.
  const entities: SchemaEntity[] = STANDARD_ENTITIES.map((e) => ({
    ...e,
    fields: e.fields.map((f) => ({ ...f })),
  }));
  const edges: SchemaEdge[] = STANDARD_EDGES.map((e) => ({ ...e }));

  // Resolver: match a target apiName against known entity keys / labels.
  const resolve = (raw: string): string | null => {
    const t = raw.trim().toLowerCase();
    for (const e of entities) {
      if (
        e.key.toLowerCase() === t ||
        e.label.toLowerCase() === t ||
        e.plural.toLowerCase() === t
      )
        return e.key;
    }
    return null;
  };

  let customFieldDefs = 0;

  // Custom modules → their own entities.
  for (const m of modules) {
    const key = m.apiName;
    const fields: SchemaField[] = [{ key: 'id', label: 'id', type: 'ID', pk: true }];
    for (const f of moduleFields[m.id] ?? []) {
      const rel = relationFrom(f.type, f.lookupModule, f.config);
      fields.push({
        key: f.apiName,
        label: f.apiName,
        type: f.type,
        lookup: Boolean(rel),
        custom: true,
      });
    }
    entities.push({
      key,
      label: m.label,
      plural: m.pluralLabel ?? `${m.label}s`,
      kind: 'custom',
      icon: m.icon,
      fields,
    });
  }

  // Second pass — resolve edges now that every custom module is a known entity.
  for (const m of modules) {
    for (const f of moduleFields[m.id] ?? []) {
      const rel = relationFrom(f.type, f.lookupModule, f.config);
      if (!rel) continue;
      const to = resolve(rel.target);
      const field = entities.find((e) => e.key === m.apiName)?.fields.find((x) => x.key === f.apiName);
      if (field && to) field.target = to;
      if (!to) continue;
      edges.push({
        id: `m-${m.id}-${f.id}`,
        from: m.apiName,
        to,
        label: f.label || rel.kind,
        kind: rel.kind,
      });
    }
  }

  // Standard-entity custom fields → append to the built-in entity + edges.
  for (const entityType of STANDARD_ENTITY_KEYS) {
    const owner = entities.find((e) => e.key === entityType);
    if (!owner) continue;
    for (const f of standardFields[entityType] ?? []) {
      customFieldDefs += 1;
      const rel = relationFrom(f.fieldType, null, f.config);
      const to = rel ? resolve(rel.target) : null;
      owner.fields.push({
        key: f.apiKey,
        label: f.apiKey,
        type: f.fieldType,
        lookup: Boolean(rel),
        target: to ?? undefined,
        custom: true,
      });
      if (rel && to) {
        edges.push({
          id: `s-${f.id}`,
          from: entityType,
          to,
          label: f.name || rel.kind,
          kind: rel.kind,
        });
      }
    }
  }

  // Dedup edges by from|to|label.
  const seen = new Set<string>();
  const dedup = edges.filter((e) => {
    const k = `${e.from}|${e.to}|${e.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    entities,
    edges: dedup,
    meta: {
      customModules: modules.length,
      customFieldDefs,
      source: modules.length > 0 || customFieldDefs > 0 ? 'live' : 'baseline',
    },
  };
}

// ─── Layout geometry ──────────────────────────────────────────────────────────

const BOX_W = 224;
const HEADER_H = 36;
const ROW_H = 20;
const BOX_PAD_B = 10;
const COL_GAP = 84;
const ROW_GAP = 36;
const PAD = 40;
const COLLAPSED_MAX = 5;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: SchemaField[];
  hidden: number;
}

function boxHeight(fieldCount: number, hasMore: boolean): number {
  return HEADER_H + fieldCount * ROW_H + (hasMore ? ROW_H : 0) + BOX_PAD_B;
}

function layout(
  entities: SchemaEntity[],
  expanded: Set<string>
): { rects: Map<string, Rect>; width: number; height: number } {
  const n = Math.max(1, entities.length);
  const columns = Math.min(4, Math.max(1, Math.round(Math.sqrt(n))));
  const colHeights = new Array(columns).fill(PAD);
  const rects = new Map<string, Rect>();

  for (const e of entities) {
    const isOpen = expanded.has(e.key);
    const visible = isOpen ? e.fields : e.fields.slice(0, COLLAPSED_MAX);
    const hidden = isOpen ? 0 : Math.max(0, e.fields.length - COLLAPSED_MAX);
    const h = boxHeight(visible.length, hidden > 0);
    // Shortest-column masonry placement — deterministic given entity order.
    let col = 0;
    for (let c = 1; c < columns; c += 1) if (colHeights[c] < colHeights[col]) col = c;
    const x = PAD + col * (BOX_W + COL_GAP);
    const y = colHeights[col];
    rects.set(e.key, { x, y, w: BOX_W, h, visible, hidden });
    colHeights[col] = y + h + ROW_GAP;
  }

  const width = PAD * 2 + columns * BOX_W + (columns - 1) * COL_GAP;
  const height = Math.max(...colHeights) - ROW_GAP + PAD;
  return { rects, width, height };
}

interface EdgeGeom {
  edge: SchemaEdge;
  path: string;
  lx: number;
  ly: number;
}

function cubicAt(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function edgeGeometry(edges: SchemaEdge[], rects: Map<string, Rect>): EdgeGeom[] {
  const out: EdgeGeom[] = [];
  for (const edge of edges) {
    const a = rects.get(edge.from);
    const b = rects.get(edge.to);
    if (!a || !b) continue;
    const acx = a.x + a.w / 2;
    const bcx = b.x + b.w / 2;
    const ay = a.y + a.h / 2;
    const by = b.y + b.h / 2;
    let sx: number;
    let tx: number;
    let c1x: number;
    let c2x: number;
    if (Math.abs(bcx - acx) < 24) {
      // Same column — loop out to the right.
      sx = a.x + a.w;
      tx = b.x + b.w;
      const bow = 56;
      c1x = sx + bow;
      c2x = tx + bow;
    } else if (bcx > acx) {
      sx = a.x + a.w;
      tx = b.x;
      const co = Math.min(140, Math.max(40, (tx - sx) * 0.4));
      c1x = sx + co;
      c2x = tx - co;
    } else {
      sx = a.x;
      tx = b.x + b.w;
      const co = Math.min(140, Math.max(40, (sx - tx) * 0.4));
      c1x = sx - co;
      c2x = tx + co;
    }
    const path = `M ${sx} ${ay} C ${c1x} ${ay}, ${c2x} ${by}, ${tx} ${by}`;
    const lx = cubicAt(0.5, sx, c1x, c2x, tx);
    const ly = cubicAt(0.5, ay, ay, by, by);
    out.push({ edge, path, lx, ly });
  }
  return out;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SchemaBuilderPage() {
  const { get } = useBff();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [raw, setRaw] = useState<{
    modules: RawModule[];
    moduleFields: Record<string, RawModuleField[]>;
    standardFields: Record<string, RawStandardField[]>;
  }>({ modules: [], moduleFields: {}, standardFields: {} });

  const load = useCallback(async () => {
    setState('loading');
    const modRes = await get<RawModule[]>('/bff/metadata/custom-modules');
    const modules = Array.isArray(modRes.data) ? modRes.data : [];
    const [fieldResults, stdResults] = await Promise.all([
      Promise.all(modules.map((m) => get<RawModuleField[]>(`/bff/metadata/custom-modules/${m.id}/fields`))),
      Promise.all(
        STANDARD_ENTITY_KEYS.map((e) => get<RawStandardField[]>(`/bff/metadata/custom-fields?entityType=${e}`))
      ),
    ]);

    const networkDown =
      modRes.status === 0 &&
      fieldResults.every((r) => r.status === 0) &&
      stdResults.every((r) => r.status === 0);
    if (networkDown) {
      setState('error');
      return;
    }

    const moduleFields: Record<string, RawModuleField[]> = {};
    modules.forEach((m, i) => {
      moduleFields[m.id] = Array.isArray(fieldResults[i].data) ? fieldResults[i].data! : [];
    });
    const standardFields: Record<string, RawStandardField[]> = {};
    STANDARD_ENTITY_KEYS.forEach((e, i) => {
      standardFields[e] = Array.isArray(stdResults[i].data) ? stdResults[i].data! : [];
    });

    setRaw({ modules, moduleFields, standardFields });
    setState('ready');
  }, [get]);

  useEffect(() => {
    void load();
  }, [load]);

  const schema = useMemo(
    () => deriveSchema(raw.modules, raw.moduleFields, raw.standardFields),
    [raw]
  );

  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (e: SchemaEntity) =>
      !q ||
      e.label.toLowerCase().includes(q) ||
      e.plural.toLowerCase().includes(q) ||
      e.key.toLowerCase().includes(q) ||
      e.fields.some((f) => f.label.toLowerCase().includes(q)),
    [q]
  );

  const matchedKeys = useMemo(
    () => new Set(schema.entities.filter(matches).map((e) => e.key)),
    [schema.entities, matches]
  );

  const { rects, width, height } = useMemo(
    () => layout(schema.entities, expanded),
    [schema.entities, expanded]
  );
  const edgeGeoms = useMemo(() => edgeGeometry(schema.edges, rects), [schema.edges, rects]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const focusEntity = (key: string) => {
    setSelected(key);
    setExpanded((prev) => new Set(prev).add(key));
    const r = rects.get(key);
    const el = scrollRef.current;
    if (r && el) {
      el.scrollTo({
        left: Math.max(0, r.x * zoom - 40),
        top: Math.max(0, r.y * zoom - 40),
        behavior: 'smooth',
      });
    }
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(schema, null, 2));
      notify.success('Schema copied as JSON');
    } catch {
      notify.error('Could not copy to clipboard');
    }
  };

  // Highlighted entities: the two ends of the hovered edge, or the incident
  // edges of the selected entity.
  const hoveredPair = useMemo(() => {
    const e = schema.edges.find((x) => x.id === hoveredEdge);
    return e ? new Set([e.from, e.to]) : new Set<string>();
  }, [hoveredEdge, schema.edges]);

  // Drag-to-pan on the SVG background.
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const onBgPointerDown = (ev: ReactPointerEvent<SVGRectElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    panRef.current = { x: ev.clientX, y: ev.clientY, sl: el.scrollLeft, st: el.scrollTop };
    const move = (m: PointerEvent) => {
      const p = panRef.current;
      if (!p || !scrollRef.current) return;
      scrollRef.current.scrollLeft = p.sl - (m.clientX - p.x);
      scrollRef.current.scrollTop = p.st - (m.clientY - p.y);
    };
    const up = () => {
      panRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <SetupHeader
        icon={Network}
        title="Schema / ER Builder"
        description="A live entity-relationship view of your tenant data model — standard CRM modules plus every low-code custom module and field, with lookup relationships drawn as edges."
        onRefresh={() => void load()}
      >
        <button
          type="button"
          onClick={copyJson}
          className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Copy className="h-4 w-4" aria-hidden /> Copy JSON
        </button>
      </SetupHeader>

      {state === 'error' ? (
        <div className="rounded-xl border border-outline-variant bg-surface p-12 text-center">
          <TriangleAlert className="mx-auto mb-3 h-10 w-10 text-outline" aria-hidden />
          <p className="text-sm font-medium text-on-surface-variant">Couldn&apos;t reach the metadata service</p>
          <p className="mt-1 text-xs text-on-surface-variant">It may be starting up. Try refreshing in a moment.</p>
        </div>
      ) : state === 'loading' ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface p-16 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Building schema diagram…
        </div>
      ) : (
        <>
          {schema.meta.source === 'baseline' ? (
            <div className="rounded-lg border border-outline-variant bg-surface-container-low px-4 py-2.5 text-xs text-on-surface-variant">
              No custom modules or fields found yet — showing the standard CRM data model. Create custom modules and
              lookup fields to see them appear here.
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
            {/* Sidebar */}
            <aside className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter entities…"
                  aria-label="Filter entities"
                  className="w-full rounded-lg border border-outline-variant bg-surface py-2 pl-9 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
              <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
                <ul className="max-h-[60vh] divide-y divide-outline-variant overflow-y-auto">
                  {schema.entities.filter(matches).map((e) => {
                    const lookups = e.fields.filter((f) => f.lookup).length;
                    return (
                      <li key={e.key}>
                        <button
                          type="button"
                          onClick={() => focusEntity(e.key)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                            selected === e.key ? 'bg-primary-container/40' : ''
                          }`}
                        >
                          <span aria-hidden>{e.icon ?? (e.kind === 'custom' ? '🧩' : '📦')}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-on-surface">{e.plural}</span>
                            <span className="block truncate text-xs text-on-surface-variant">
                              {e.fields.length} fields{lookups ? ` · ${lookups} lookup` : ''}
                            </span>
                          </span>
                          {e.kind === 'custom' ? (
                            <span className="rounded-full bg-tertiary-container px-1.5 py-0.5 text-[10px] font-medium text-on-tertiary-container">
                              custom
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                  {schema.entities.filter(matches).length === 0 ? (
                    <li className="px-3 py-6 text-center text-xs text-on-surface-variant">No entities match “{query}”.</li>
                  ) : null}
                </ul>
              </div>
              <p className="px-1 text-xs text-on-surface-variant">
                {schema.entities.length} entities · {schema.edges.length} relationships
              </p>
            </aside>

            {/* Canvas */}
            <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface">
              <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-outline-variant bg-surface/90 p-1 shadow-sm backdrop-blur">
                <IconBtn label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}>
                  <ZoomOut className="h-4 w-4" aria-hidden />
                </IconBtn>
                <span className="w-10 text-center text-xs tabular-nums text-on-surface-variant">
                  {Math.round(zoom * 100)}%
                </span>
                <IconBtn label="Zoom in" onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}>
                  <ZoomIn className="h-4 w-4" aria-hidden />
                </IconBtn>
                <IconBtn label="Reset zoom" onClick={() => setZoom(1)}>
                  <Maximize2 className="h-4 w-4" aria-hidden />
                </IconBtn>
              </div>

              <div ref={scrollRef} className="h-[68vh] overflow-auto" style={{ cursor: 'grab' }}>
                <svg
                  width={width * zoom}
                  height={height * zoom}
                  viewBox={`0 0 ${width} ${height}`}
                  role="img"
                  aria-label="Entity-relationship diagram of the data model"
                  style={{ display: 'block' }}
                >
                  <defs>
                    <marker
                      id="er-one"
                      viewBox="0 0 12 12"
                      refX="10"
                      refY="6"
                      markerWidth="9"
                      markerHeight="9"
                      orient="auto"
                    >
                      <path d="M2,2 L10,6 L2,10" fill="none" stroke="rgb(var(--md-primary))" strokeWidth={1.5} />
                    </marker>
                    <marker
                      id="er-crow"
                      viewBox="0 0 14 14"
                      refX="1"
                      refY="7"
                      markerWidth="13"
                      markerHeight="13"
                      orient="auto-start-reverse"
                    >
                      <path
                        d="M13,1 L1,7 L13,13 M2,7 L13,7"
                        fill="none"
                        stroke="rgb(var(--md-outline))"
                        strokeWidth={1.3}
                      />
                    </marker>
                  </defs>

                  {/* Pan surface */}
                  <rect
                    x={0}
                    y={0}
                    width={width}
                    height={height}
                    fill="transparent"
                    onPointerDown={onBgPointerDown}
                  />

                  {/* Edges */}
                  {edgeGeoms.map(({ edge, path }) => {
                    const active = hoveredEdge === edge.id;
                    const dimmed = q ? !(matchedKeys.has(edge.from) && matchedKeys.has(edge.to)) : false;
                    return (
                      <path
                        key={edge.id}
                        d={path}
                        fill="none"
                        stroke={active ? 'rgb(var(--md-primary))' : 'rgb(var(--md-outline))'}
                        strokeWidth={active ? 2.4 : 1.5}
                        markerStart="url(#er-crow)"
                        markerEnd="url(#er-one)"
                        opacity={dimmed ? 0.12 : active ? 1 : 0.7}
                      />
                    );
                  })}

                  {/* Edge labels (hover target to highlight the two entities) */}
                  {edgeGeoms.map(({ edge, lx, ly }) => {
                    const dimmed = q ? !(matchedKeys.has(edge.from) && matchedKeys.has(edge.to)) : false;
                    const w = Math.min(150, 20 + edge.label.length * 6.2);
                    return (
                      <g
                        key={`l-${edge.id}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Relationship ${edge.from} to ${edge.to}: ${edge.label}`}
                        onMouseEnter={() => setHoveredEdge(edge.id)}
                        onMouseLeave={() => setHoveredEdge((h) => (h === edge.id ? null : h))}
                        onFocus={() => setHoveredEdge(edge.id)}
                        onBlur={() => setHoveredEdge((h) => (h === edge.id ? null : h))}
                        opacity={dimmed ? 0.15 : 1}
                        style={{ cursor: 'pointer' }}
                      >
                        <rect
                          x={lx - w / 2}
                          y={ly - 10}
                          width={w}
                          height={20}
                          rx={10}
                          fill="rgb(var(--md-surface-container-high))"
                          stroke="rgb(var(--md-outline-variant))"
                        />
                        <text
                          x={lx}
                          y={ly + 4}
                          textAnchor="middle"
                          fontSize={10.5}
                          fontWeight={600}
                          fill="rgb(var(--md-on-surface))"
                        >
                          {truncate(edge.label, 18)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Entities */}
                  {schema.entities.map((e) => {
                    const r = rects.get(e.key);
                    if (!r) return null;
                    const isCustom = e.kind === 'custom';
                    const highlighted = hoveredPair.has(e.key) || selected === e.key;
                    const dimmed = q ? !matchedKeys.has(e.key) : false;
                    const headerFill = isCustom
                      ? 'rgb(var(--md-tertiary-container))'
                      : 'rgb(var(--md-primary-container))';
                    const headerText = isCustom
                      ? 'rgb(var(--md-on-tertiary-container))'
                      : 'rgb(var(--md-on-primary-container))';
                    return (
                      <g
                        key={e.key}
                        role="button"
                        tabIndex={0}
                        aria-label={`${e.plural} entity, ${e.fields.length} fields. ${
                          expanded.has(e.key) ? 'Expanded' : 'Collapsed'
                        }. Activate to toggle.`}
                        aria-expanded={expanded.has(e.key)}
                        onClick={() => {
                          setSelected(e.key);
                          toggleExpand(e.key);
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            setSelected(e.key);
                            toggleExpand(e.key);
                          }
                        }}
                        opacity={dimmed ? 0.28 : 1}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Body */}
                        <rect
                          x={r.x}
                          y={r.y}
                          width={r.w}
                          height={r.h}
                          rx={12}
                          fill="rgb(var(--md-surface-container-low))"
                          stroke={highlighted ? 'rgb(var(--md-primary))' : 'rgb(var(--md-outline-variant))'}
                          strokeWidth={highlighted ? 2 : 1}
                        />
                        {/* Header */}
                        <path
                          d={`M ${r.x} ${r.y + 12} Q ${r.x} ${r.y} ${r.x + 12} ${r.y} L ${r.x + r.w - 12} ${r.y} Q ${
                            r.x + r.w
                          } ${r.y} ${r.x + r.w} ${r.y + 12} L ${r.x + r.w} ${r.y + HEADER_H} L ${r.x} ${
                            r.y + HEADER_H
                          } Z`}
                          fill={headerFill}
                        />
                        <text
                          x={r.x + 12}
                          y={r.y + 23}
                          fontSize={13}
                          fontWeight={700}
                          fill={headerText}
                        >
                          {`${e.icon ? `${e.icon} ` : ''}${truncate(e.plural, 22)}`}
                        </text>
                        <text
                          x={r.x + r.w - 10}
                          y={r.y + 23}
                          textAnchor="end"
                          fontSize={10}
                          fill={headerText}
                          opacity={0.75}
                        >
                          {e.fields.length}
                        </text>

                        {/* Fields */}
                        {r.visible.map((f, i) => {
                          const fy = r.y + HEADER_H + i * ROW_H;
                          return (
                            <g key={f.key}>
                              {i % 2 === 1 ? (
                                <rect
                                  x={r.x + 1}
                                  y={fy}
                                  width={r.w - 2}
                                  height={ROW_H}
                                  fill="rgb(var(--md-surface-container))"
                                  opacity={0.5}
                                />
                              ) : null}
                              <text
                                x={r.x + 12}
                                y={fy + 14}
                                fontSize={11}
                                fontWeight={f.pk ? 700 : 400}
                                fill="rgb(var(--md-on-surface))"
                              >
                                {f.pk ? '🔑 ' : f.lookup ? '↗ ' : ''}
                                {truncate(f.label, 18)}
                                {f.custom ? ' *' : ''}
                              </text>
                              <text
                                x={r.x + r.w - 10}
                                y={fy + 14}
                                textAnchor="end"
                                fontSize={9.5}
                                fill={
                                  f.lookup
                                    ? 'rgb(var(--md-primary))'
                                    : 'rgb(var(--md-on-surface-variant))'
                                }
                                fontFamily="ui-monospace, monospace"
                              >
                                {truncate(f.type, 12)}
                              </text>
                            </g>
                          );
                        })}
                        {r.hidden > 0 ? (
                          <text
                            x={r.x + 12}
                            y={r.y + HEADER_H + r.visible.length * ROW_H + 14}
                            fontSize={10}
                            fontStyle="italic"
                            fill="rgb(var(--md-on-surface-variant))"
                          >
                            + {r.hidden} more — click to expand
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-outline-variant px-4 py-2 text-xs text-on-surface-variant">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded bg-primary-container" /> Standard module
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded bg-tertiary-container" /> Custom module
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" aria-hidden /> Primary key
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" aria-hidden /> Lookup / relationship
                </span>
                <span className="ml-auto">Drag canvas to pan · click an entity to expand · * = custom field</span>
              </div>
            </div>
          </div>

          {/* Accessible relationship table mirror */}
          {schema.edges.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
              <div className="flex items-center gap-2 border-b border-outline-variant bg-surface-container-low px-5 py-3">
                <Boxes className="h-4 w-4 text-primary" aria-hidden />
                <h2 className="text-sm font-semibold text-on-surface">Relationships</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant text-xs uppercase text-on-surface-variant">
                      <th className="px-5 py-2.5 text-start font-medium">From</th>
                      <th className="px-5 py-2.5 text-start font-medium">To</th>
                      <th className="px-5 py-2.5 text-start font-medium">Relationship</th>
                      <th className="px-5 py-2.5 text-start font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schema.edges.map((e, i) => {
                      const from = schema.entities.find((x) => x.key === e.from);
                      const to = schema.entities.find((x) => x.key === e.to);
                      return (
                        <tr
                          key={e.id}
                          className={`border-b border-outline-variant ${i % 2 ? 'bg-surface-container-low/50' : ''} hover:bg-primary-container/20`}
                          onMouseEnter={() => setHoveredEdge(e.id)}
                          onMouseLeave={() => setHoveredEdge((h) => (h === e.id ? null : h))}
                        >
                          <td className="px-5 py-2.5 font-medium text-on-surface">{from?.plural ?? e.from}</td>
                          <td className="px-5 py-2.5 text-on-surface">{to?.plural ?? e.to}</td>
                          <td className="px-5 py-2.5 text-on-surface-variant">{e.label}</td>
                          <td className="px-5 py-2.5">
                            <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs text-on-surface-variant">
                              {e.kind}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </button>
  );
}
