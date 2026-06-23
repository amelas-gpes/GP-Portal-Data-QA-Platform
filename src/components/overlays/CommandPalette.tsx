import {
  ArrowLeftRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Eraser,
  FileUp,
  FlaskConical,
  HelpCircle,
  Layers,
  PanelBottom,
  Rows3,
  Search,
  Sigma,
  SlidersHorizontal,
  User,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Fragment, useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CHART_REGISTRY } from '../../data/chartRegistry';
import type { DashboardFilters, FilterOptions, InvestorOption, ScenarioModel, ScenarioVisualId } from '../../types';
import { listRecentIds, matchFields, noteRecent, recentBoost, toRanges, tokenize } from '../../utils/paletteSearch';
import { SCENARIO_VISUALS } from '../../utils/scenarioClassifier';
import { EmptyState } from '../common';

// CommandPalette — summoned via Ctrl+K. A supplement, never the only path.
// Fuzzy search over five entity kinds (actions, investors, scenarios, charts,
// filters) with sigil/Tab scoping and an argument mode for filter values.

export type CommandPaletteProps = {
  investors: InvestorOption[];
  scenarioModel: ScenarioModel | null;
  filters: DashboardFilters;
  filterOptions: FilterOptions | null;
  currentInvestor: InvestorOption | null;
  side: 'lp' | 'gp';
  simArmed: boolean;
  onSelectInvestor: (investorKey: string) => void;
  onAction: (actionId: string) => void;
  onSelectScenario: (scenarioId: string, visualId: ScenarioVisualId) => void;
  onApplyFilter: (patch: Partial<DashboardFilters>) => void;
  onExpandChart: (chartId: string, side: 'lp' | 'gp') => void;
  onClose: () => void;
};

type PaletteScope = 'all' | 'actions' | 'investors' | 'scenarios' | 'charts' | 'filters';
type PaletteKind = Exclude<PaletteScope, 'all'>;

const SCOPES: Array<{ id: PaletteScope; label: string; sigil: string | null }> = [
  { id: 'all', label: 'All', sigil: null },
  { id: 'actions', label: 'Actions', sigil: '>' },
  { id: 'investors', label: 'Investors', sigil: '@' },
  { id: 'scenarios', label: 'Scenarios', sigil: '#' },
  { id: 'charts', label: 'Charts', sigil: '*' },
  { id: 'filters', label: 'Filters', sigil: ':' },
];

const SIGIL_TO_SCOPE: Record<string, PaletteKind> = {
  '>': 'actions',
  '@': 'investors',
  '#': 'scenarios',
  '*': 'charts',
  ':': 'filters',
};

const KIND_ORDER: PaletteKind[] = ['actions', 'investors', 'scenarios', 'charts', 'filters'];
const KIND_LABEL: Record<PaletteKind, string> = {
  actions: 'Actions',
  investors: 'Investors',
  scenarios: 'Scenarios',
  charts: 'Charts',
  filters: 'Filters',
};
const GLOBAL_CAP: Record<PaletteKind, number> = { actions: 6, investors: 8, scenarios: 6, charts: 5, filters: 5 };
const SCOPED_CAP = 50;
const DIRECT_VALUE_CAP = 24;

type BadgeTone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad';
type Badge = { label: string; tone: BadgeTone };

type CatalogItem = {
  id: string;
  kind: PaletteKind;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  keywords?: string;
  hint?: string;
  badges?: Badge[];
  rank: number;
  forward?: boolean;
  transient?: boolean;
  run: () => void;
};

type PendingCommand = { id: string; title: string; placeholder: string; options: CatalogItem[] };
type DisplayItem = { item: CatalogItem; score: number; titleIndices?: number[]; subtitleIndices?: number[] };
type PaletteGroup = { id: string; label: string; items: DisplayItem[]; total?: number };

const byRank = (a: CatalogItem, b: CatalogItem) => a.rank - b.rank || a.title.localeCompare(b.title);
const byScoreThenRank = (a: DisplayItem, b: DisplayItem) =>
  b.score - a.score || a.item.rank - b.item.rank || a.item.title.localeCompare(b.item.title);

// ── Catalog builders ────────────────────────────────────────────────────────

function buildActionItems(args: {
  side: 'lp' | 'gp';
  simArmed: boolean;
  onAction: (actionId: string) => void;
}): CatalogItem[] {
  const { side, simArmed, onAction } = args;
  const definitions: Array<{ id: string; icon: LucideIcon; title: string; subtitle?: string; hint?: string; keywords?: string; include?: boolean }> = [
    { id: 'next-investor', icon: ChevronRight, title: 'Next investor', hint: 'j', keywords: 'step forward navigate' },
    { id: 'prev-investor', icon: ChevronLeft, title: 'Previous investor', hint: 'k', keywords: 'step back navigate' },
    { id: 'flip-side', icon: ArrowLeftRight, title: side === 'lp' ? 'Switch to GP charts' : 'Switch to LP charts', hint: 'g', keywords: 'flip side lp gp toggle view' },
    { id: 'open-source', icon: FlaskConical, title: 'Change data (what-if)', hint: 's', keywords: 'simulate what if polarity sign flip source values drawer' },
    { id: 'open-logic', icon: Sigma, title: 'Edit logic (formulas)', keywords: 'formula metric draft edit logic recompute calculation' },
    { id: 'toggle-dock', icon: PanelBottom, title: 'Toggle membership panel', hint: 'e', keywords: 'investors list members scenario' },
    { id: 'toggle-rail-mode', icon: Rows3, title: 'Toggle rail: investors / scenarios', hint: 't', keywords: 'group scenario rail' },
    { id: 'cycle-visual', icon: Layers, title: 'Focus next visual', hint: 'v', keywords: 'cash flow commitment ratio total value capital at work' },
    { id: 'clear-sim', icon: Eraser, title: 'Clear what-if', keywords: 'reset source values', include: simArmed },
    { id: 'export', icon: FileUp, title: 'Export scenario membership (CSV)', keywords: 'download save results csv' },
    { id: 'replace', icon: FileUp, title: 'Replace workbook…', keywords: 'import upload new file csv excel open' },
    { id: 'help', icon: HelpCircle, title: 'Keyboard shortcuts & help', hint: '?', keywords: 'docs reference keymap' },
  ];
  return definitions
    .filter((definition) => definition.include !== false)
    .map((definition, index) => ({
      id: `action:${definition.id}`,
      kind: 'actions' as const,
      icon: definition.icon,
      title: definition.title,
      subtitle: definition.subtitle,
      keywords: definition.keywords,
      hint: definition.hint,
      rank: index,
      run: () => onAction(definition.id),
    }));
}

function buildInvestorItems(args: { investors: InvestorOption[]; currentKey: string | null; onSelectInvestor: (investorKey: string) => void }): CatalogItem[] {
  const { investors, currentKey, onSelectInvestor } = args;
  return investors.map((option) => {
    const subtitle = [option.companyName, option.investorType, option.fundCurrencyCode].filter(Boolean).join(' · ');
    return {
      id: `investor:${option.key}`,
      kind: 'investors' as const,
      icon: User,
      title: option.label,
      subtitle: subtitle || undefined,
      keywords: [option.investorPortalDisplayName, option.investorGroupName, option.investorNo, option.investorShortCode, option.companyGroupCode].filter(Boolean).join(' '),
      badges: option.key === currentKey ? [{ label: 'current', tone: 'accent' as const }] : undefined,
      rank: 0,
      run: () => onSelectInvestor(option.key),
    };
  });
}

function buildScenarioItems(args: {
  scenarioModel: ScenarioModel | null;
  activeScenarioId: string;
  onSelectScenario: (scenarioId: string, visualId: ScenarioVisualId) => void;
}): CatalogItem[] {
  const { scenarioModel, activeScenarioId, onSelectScenario } = args;
  if (!scenarioModel) return [];
  const items: CatalogItem[] = [];
  let rank = 0;
  for (const visual of SCENARIO_VISUALS) {
    for (const bucket of scenarioModel.byVisual[visual.id]) {
      const badges: Badge[] = [{ label: `${bucket.count.toLocaleString()} inv`, tone: 'neutral' }];
      if (bucket.id === activeScenarioId) badges.push({ label: 'active', tone: 'accent' });
      items.push({
        id: `scenario:${bucket.id}`,
        kind: 'scenarios' as const,
        icon: Layers,
        title: bucket.label,
        subtitle: visual.title,
        keywords: `${visual.title} ${bucket.signs.join(' ')}`,
        badges,
        rank: rank++,
        run: () => onSelectScenario(bucket.id, bucket.visualId),
      });
    }
  }
  return items;
}

function buildChartItems(args: { side: 'lp' | 'gp'; onExpandChart: (chartId: string, side: 'lp' | 'gp') => void }): CatalogItem[] {
  const { side, onExpandChart } = args;
  return CHART_REGISTRY.map((entry, index) => ({
    id: `chart:${entry.chartId}`,
    kind: 'charts' as const,
    icon: BarChart3,
    title: entry.title,
    subtitle: 'Expand chart',
    keywords: `${entry.chartId} ${entry.visualId} ${entry.side}`,
    badges: [{ label: entry.side.toUpperCase(), tone: 'neutral' as const }],
    rank: entry.side === side ? index : 100 + index,
    run: () => onExpandChart(entry.chartId, entry.side),
  }));
}

const FILTER_FIELD_DEFINITIONS = [
  { key: 'investorType', label: 'Investor type', optionKey: 'investorTypes' },
  { key: 'investorGroupName', label: 'Investor group', optionKey: 'investorGroups' },
  { key: 'companyGroupCode', label: 'Company group code', optionKey: 'companyGroupCodes' },
  { key: 'companyName', label: 'Company', optionKey: 'companyNames' },
  { key: 'fundCurrencyCode', label: 'Currency', optionKey: 'fundCurrencyCodes' },
] as const;

const CLEARED_FILTER_PATCH: Partial<DashboardFilters> = {
  investorType: '',
  investorGroupName: '',
  companyGroupCode: '',
  companyName: '',
  fundCurrencyCode: '',
  scenarioId: '',
};

function buildFilterItems(args: {
  filters: DashboardFilters;
  filterOptions: FilterOptions | null;
  onApplyFilter: (patch: Partial<DashboardFilters>) => void;
  enterPending: (command: PendingCommand) => void;
}): CatalogItem[] {
  const { filters, filterOptions, onApplyFilter, enterPending } = args;
  const items: CatalogItem[] = [];
  let rank = 0;

  for (const definition of FILTER_FIELD_DEFINITIONS) {
    const values = filterOptions?.[definition.optionKey] ?? [];
    if (!values.length) continue;
    const active = filters[definition.key];
    const lowerLabel = definition.label.toLowerCase();
    items.push({
      id: `filters:${definition.key}`,
      kind: 'filters',
      icon: SlidersHorizontal,
      title: `Filter by ${lowerLabel}…`,
      subtitle: active ? `Currently: ${active}` : `${values.length.toLocaleString()} values`,
      keywords: `filter ${definition.key}`,
      badges: active ? [{ label: 'active', tone: 'accent' }] : undefined,
      forward: true,
      rank: rank++,
      run: () =>
        enterPending({
          id: `filters:${definition.key}`,
          title: definition.label,
          placeholder: `Choose ${lowerLabel}…`,
          options: [
            { id: `filters:${definition.key}:__clear`, kind: 'filters', icon: Eraser, title: `All — clear ${lowerLabel} filter`, transient: true, rank: -1, run: () => onApplyFilter({ [definition.key]: '' } as Partial<DashboardFilters>) },
            ...values.map((value, index) => ({
              id: `filters:${definition.key}:${value}`,
              kind: 'filters' as const,
              icon: SlidersHorizontal,
              title: value,
              badges: value === active ? [{ label: 'active', tone: 'accent' as const }] : undefined,
              transient: true,
              rank: index,
              run: () => onApplyFilter({ [definition.key]: value } as Partial<DashboardFilters>),
            })),
          ],
        }),
    });
  }

  const activeCount = [filters.investorType, filters.investorGroupName, filters.companyGroupCode, filters.companyName, filters.fundCurrencyCode, filters.scenarioId].filter(Boolean).length;
  if (activeCount) {
    items.push({
      id: 'filters:clear-all',
      kind: 'filters',
      icon: Eraser,
      title: 'Clear all filters',
      subtitle: `${activeCount} active`,
      keywords: 'reset remove filters scenario',
      rank: rank++,
      run: () => onApplyFilter(CLEARED_FILTER_PATCH),
    });
  }

  for (const definition of [FILTER_FIELD_DEFINITIONS[0], FILTER_FIELD_DEFINITIONS[4]]) {
    const values = filterOptions?.[definition.optionKey] ?? [];
    if (!values.length || values.length > DIRECT_VALUE_CAP) continue;
    for (const value of values) {
      items.push({
        id: `filters:${definition.key}=${value}`,
        kind: 'filters',
        icon: SlidersHorizontal,
        title: `${definition.label}: ${value}`,
        subtitle: 'Apply filter',
        badges: filters[definition.key] === value ? [{ label: 'active', tone: 'accent' }] : undefined,
        rank: 100 + rank++,
        run: () => onApplyFilter({ [definition.key]: value } as Partial<DashboardFilters>),
      });
    }
  }

  return items;
}

// ── Highlighting ────────────────────────────────────────────────────────────

function Highlighted({ text, indices }: { text: string; indices?: number[] }) {
  if (!indices?.length) return <>{text}</>;
  const ranges = toRanges(indices);
  const segments: Array<{ text: string; hit: boolean }> = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), hit: false });
    segments.push({ text: text.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });
  return (
    <>
      {segments.map((segment, index) =>
        segment.hit ? <mark className="command-palette__hl" key={index}>{segment.text}</mark> : <Fragment key={index}>{segment.text}</Fragment>,
      )}
    </>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function CommandPalette({
  investors,
  scenarioModel,
  filters,
  filterOptions,
  currentInvestor,
  side,
  simArmed,
  onSelectInvestor,
  onAction,
  onSelectScenario,
  onApplyFilter,
  onExpandChart,
  onClose,
}: CommandPaletteProps) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<PaletteScope>('all');
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  const deferredQuery = useDeferredValue(query);
  const tokens = useMemo(() => tokenize(deferredQuery), [deferredQuery]);
  const currentKey = currentInvestor?.key ?? null;

  const enterPending = useCallback((command: PendingCommand) => {
    setPending(command);
    setQuery('');
    setHighlight(0);
  }, []);

  const catalog = useMemo<CatalogItem[]>(
    () => [
      ...buildActionItems({ side, simArmed, onAction }),
      ...buildInvestorItems({ investors, currentKey, onSelectInvestor }),
      ...buildScenarioItems({ scenarioModel, activeScenarioId: filters.scenarioId, onSelectScenario }),
      ...buildChartItems({ side, onExpandChart }),
      ...buildFilterItems({ filters, filterOptions, onApplyFilter, enterPending }),
    ],
    [side, simArmed, onAction, investors, currentKey, onSelectInvestor, scenarioModel, filters, onSelectScenario, onExpandChart, filterOptions, onApplyFilter, enterPending],
  );

  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);

  const groups = useMemo<PaletteGroup[]>(() => {
    const display = (item: CatalogItem): DisplayItem => ({ item, score: 0 });

    if (pending) {
      if (!tokens.length) {
        return [{ id: 'pending', label: pending.title, items: [...pending.options].sort(byRank).map(display) }];
      }
      const scored: DisplayItem[] = [];
      for (const option of pending.options) {
        const match = matchFields(tokens, [
          { id: 'title', text: option.title },
          { id: 'subtitle', text: option.subtitle ?? '', weight: 0.75 },
        ]);
        if (!match) continue;
        scored.push({ item: option, score: match.score, titleIndices: match.indicesByField.title, subtitleIndices: match.indicesByField.subtitle });
      }
      scored.sort(byScoreThenRank);
      return scored.length ? [{ id: 'pending', label: pending.title, items: scored }] : [];
    }

    if (!tokens.length && scope === 'all') {
      const seen = new Set<string>();
      const take = (ids: Array<string | undefined>, cap: number): DisplayItem[] => {
        const collected: DisplayItem[] = [];
        for (const id of ids) {
          if (!id || seen.has(id) || collected.length >= cap) continue;
          const item = catalogById.get(id);
          if (!item) continue;
          seen.add(id);
          collected.push(display(item));
        }
        return collected;
      };
      const sections: PaletteGroup[] = [];
      const recent = take(listRecentIds(12), 5);
      if (recent.length) sections.push({ id: 'recent', label: 'Recent', items: recent });
      const quick = take(
        ['action:open-source', 'action:toggle-rail-mode', 'action:flip-side', 'action:export', 'action:replace', 'action:help'],
        6,
      );
      if (quick.length) sections.push({ id: 'quick', label: 'Quick actions', items: quick });
      return sections;
    }

    if (!tokens.length) {
      const kind = scope as PaletteKind;
      const bucket = catalog.filter((item) => item.kind === kind).sort(byRank);
      return [{ id: kind, label: KIND_LABEL[kind], items: bucket.slice(0, SCOPED_CAP).map(display), total: bucket.length }];
    }

    const kinds: PaletteKind[] = scope === 'all' ? KIND_ORDER : [scope];
    const buckets = new Map<PaletteKind, DisplayItem[]>();
    for (const kind of kinds) buckets.set(kind, []);
    for (const item of catalog) {
      const bucket = buckets.get(item.kind);
      if (!bucket) continue;
      const match = matchFields(tokens, [
        { id: 'title', text: item.title },
        { id: 'subtitle', text: item.subtitle ?? '', weight: 0.7 },
        { id: 'keywords', text: item.keywords ?? '', weight: 0.85 },
      ]);
      if (!match) continue;
      const boost = recentBoost(item.id) + (currentKey && item.id === `investor:${currentKey}` ? 2 : 0);
      bucket.push({ item, score: match.score + boost, titleIndices: match.indicesByField.title, subtitleIndices: match.indicesByField.subtitle });
    }
    const result: PaletteGroup[] = [];
    for (const kind of kinds) {
      const bucket = buckets.get(kind);
      if (!bucket?.length) continue;
      bucket.sort(byScoreThenRank);
      const cap = scope === 'all' ? GLOBAL_CAP[kind] : SCOPED_CAP;
      result.push({ id: kind, label: KIND_LABEL[kind], items: bucket.slice(0, cap), total: bucket.length });
    }
    return result;
  }, [catalog, catalogById, currentKey, pending, scope, tokens]);

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const activeIndex = flat.length ? Math.min(highlight, flat.length - 1) : -1;

  useEffect(() => {
    if (activeIndex < 0) return;
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, flat]);

  const activate = (item: CatalogItem) => {
    if (!item.transient) noteRecent(item.id);
    item.run();
  };

  const changeScope = (next: PaletteScope) => {
    setScope(next);
    setHighlight(0);
  };

  const cycleScope = (direction: 1 | -1) => {
    const index = SCOPES.findIndex((entry) => entry.id === scope);
    const next = SCOPES[(index + direction + SCOPES.length) % SCOPES.length];
    changeScope(next.id);
  };

  const handleChange = (value: string) => {
    setHighlight(0);
    const sigilScope = SIGIL_TO_SCOPE[value.charAt(0)];
    if (!pending && sigilScope && query === '') {
      changeScope(sigilScope);
      setQuery(value.slice(1));
      return;
    }
    setQuery(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = (delta: number) => {
      event.preventDefault();
      if (flat.length) setHighlight(Math.min(flat.length - 1, Math.max(0, activeIndex + delta)));
    };
    if (event.key === 'ArrowDown') move(1);
    else if (event.key === 'ArrowUp') move(-1);
    else if (event.key === 'PageDown') move(8);
    else if (event.key === 'PageUp') move(-8);
    else if (event.key === 'Tab') {
      event.preventDefault();
      if (!pending) cycleScope(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = activeIndex >= 0 ? flat[activeIndex] : undefined;
      if (entry) activate(entry.item);
    } else if (event.key === 'Backspace' && query === '') {
      if (pending) {
        event.preventDefault();
        setPending(null);
        setHighlight(0);
      } else if (scope !== 'all') {
        event.preventDefault();
        changeScope('all');
      }
    } else if (event.key === 'Escape' && pending) {
      event.preventDefault();
      event.stopPropagation();
      setPending(null);
      setHighlight(0);
    }
  };

  const renderOption = (entry: DisplayItem, flatIndex: number) => {
    const { item } = entry;
    const active = flatIndex === activeIndex;
    const Icon = item.icon;
    return (
      <li
        aria-selected={active}
        className="command-palette__option"
        data-active={active ? 'true' : undefined}
        data-kind={item.kind}
        id={optionId(flatIndex)}
        key={item.id}
        onClick={() => activate(item)}
        onMouseEnter={() => setHighlight(flatIndex)}
        role="option"
      >
        <Icon aria-hidden="true" className="command-palette__icon" size={15} />
        <span className="command-palette__body">
          <span className="command-palette__title"><Highlighted indices={entry.titleIndices} text={item.title} /></span>
          {item.subtitle ? <span className="command-palette__subtitle"><Highlighted indices={entry.subtitleIndices} text={item.subtitle} /></span> : null}
        </span>
        <span className="command-palette__trailing">
          {item.badges?.map((badge) => (
            <span className="command-palette__badge" data-tone={badge.tone} key={badge.label}>{badge.label}</span>
          ))}
          {item.hint ? <kbd>{item.hint}</kbd> : null}
          {item.forward ? <ChevronRight aria-hidden="true" className="command-palette__forward" size={14} /> : null}
        </span>
      </li>
    );
  };

  let flatOffset = 0;
  const renderedGroups = groups.map((group) => {
    const start = flatOffset;
    flatOffset += group.items.length;
    return (
      <Fragment key={group.id}>
        <li className="command-palette__group-label" role="presentation">
          <span>{group.label}</span>
          {group.total != null && group.total > group.items.length ? (
            <span className="command-palette__group-count">{group.items.length} of {group.total.toLocaleString()}</span>
          ) : null}
        </li>
        {group.items.map((entry, index) => renderOption(entry, start + index))}
      </Fragment>
    );
  });

  const placeholder = pending
    ? pending.placeholder
    : scope === 'all'
      ? 'Search actions, investors, scenarios, charts, filters…'
      : `Search ${KIND_LABEL[scope as PaletteKind].toLowerCase()}…`;

  return (
    <div className="command-palette ui-modal-backdrop" onClick={onClose} role="presentation">
      <div
        aria-label="Command palette"
        aria-modal="true"
        className="command-palette__panel"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <div className="command-palette__search">
          {pending ? <Zap aria-hidden="true" size={16} /> : <Search aria-hidden="true" size={16} />}
          {pending ? <span className="command-palette__crumb">{pending.title}</span> : null}
          <input
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-label={placeholder}
            autoFocus
            className="command-palette__input"
            onChange={(event) => handleChange(event.target.value)}
            placeholder={placeholder}
            role="combobox"
            type="text"
            value={query}
          />
        </div>

        {!pending ? (
          <div aria-label="Search scope" className="command-palette__scopes" role="group">
            {SCOPES.map((entry) => (
              <button
                className="command-palette__scope"
                data-active={scope === entry.id ? 'true' : undefined}
                key={entry.id}
                onClick={() => changeScope(entry.id)}
                onMouseDown={(event) => event.preventDefault()}
                tabIndex={-1}
                type="button"
              >
                {entry.sigil ? <kbd>{entry.sigil}</kbd> : null}
                {entry.label}
              </button>
            ))}
          </div>
        ) : null}

        {flat.length ? (
          <ul aria-label="Palette results" className="command-palette__results" id={listboxId} ref={listRef} role="listbox">
            {renderedGroups}
          </ul>
        ) : (
          <EmptyState className="command-palette__empty" detail={pending ? 'No values match. Try fewer or shorter words.' : 'Nothing matches. Try fewer words, or Tab to widen the scope.'} title="No matches" />
        )}

        <footer className="command-palette__footer">
          <span className="command-palette__footer-hints">↑↓ navigate · Tab scope · Enter run{pending || scope !== 'all' ? ' · Backspace back' : ''} · Esc close</span>
          <span className="command-palette__footer-count">{flat.length.toLocaleString()} {flat.length === 1 ? 'result' : 'results'}</span>
        </footer>
      </div>
    </div>
  );
}
