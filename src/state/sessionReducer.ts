import type { DashboardFilters, GroupingMode, InvestorVisualMode, ScenarioVisualId } from '../types';

// The single session reducer. App.tsx owns data (summary, bundles, what-if
// simulation); this reducer owns selection, navigation, the active section, the
// focused visual, and every summoned surface. Overlay presence is explicit
// state — the keyboard guard reads overlayStack, never the DOM.

export type ChartSide = 'lp' | 'gp';

/** Top-level experiences: an investor profile, the scenario directory, or the scenario gallery. */
export type AppSection = 'investors' | 'scenarios' | 'gallery';

export type SurfaceId =
  | 'drawer'
  | 'palette'
  | 'help'
  | 'filterPopover'
  | 'importModal'
  | 'expandedChart';

export type SessionUIState = {
  selection: { investorKeys: string[]; viewMode: InvestorVisualMode; side: ChartSide };
  filters: DashboardFilters;
  investorQuery: string;
  /** Investor profile vs scenario directory. */
  section: AppSection;
  /** Scenarios directory: which visual's scenarios are shown. */
  focusVisual: ScenarioVisualId;
  surfaces: {
    /** What-if (source-value) drawer. */
    drawer: { open: boolean };
    palette: boolean;
    help: boolean;
    filterPopover: string | null;
    importModal: boolean;
    expandedChartId: string | null;
  };
  overlayStack: SurfaceId[];
};

export const defaultDashboardFilters: DashboardFilters = {
  investorType: '',
  investorGroupName: '',
  companyGroupCode: '',
  companyName: '',
  fundCurrencyCode: '',
  endDate: '',
  cumulative: true,
  groupingMode: 'investorFundPairing' as GroupingMode,
  scenarioId: '',
};

export function createInitialSessionState(): SessionUIState {
  return {
    selection: { investorKeys: [], viewMode: 'combined', side: 'lp' },
    filters: { ...defaultDashboardFilters },
    investorQuery: '',
    section: 'investors',
    focusVisual: 'cashFlow',
    surfaces: {
      drawer: { open: false },
      palette: false,
      help: false,
      filterPopover: null,
      importModal: false,
      expandedChartId: null,
    },
    overlayStack: [],
  };
}

export type SessionAction =
  | { type: 'select-investors'; keys: string[] }
  | { type: 'set-view-mode'; viewMode: InvestorVisualMode }
  | { type: 'set-side'; side: ChartSide }
  | { type: 'set-filters'; filters: DashboardFilters }
  | { type: 'set-query'; query: string }
  | { type: 'set-scenario-filter'; scenarioId: string }
  | { type: 'set-focus-visual'; visualId: ScenarioVisualId }
  | { type: 'toggle-section' }
  | { type: 'set-section'; section: AppSection }
  | { type: 'open-drawer' }
  | { type: 'toggle-palette' }
  | { type: 'toggle-help' }
  | { type: 'open-filter-popover'; filterId: string }
  | { type: 'open-import' }
  | { type: 'set-expanded-chart'; chartId: string | null }
  | { type: 'close-surface'; surface: SurfaceId }
  | { type: 'close-top' }
  | { type: 'import-completed'; defaultInvestorKey: string | null; side: ChartSide; endDate: string };

function pushStack(stack: SurfaceId[], surface: SurfaceId): SurfaceId[] {
  return [...stack.filter((item) => item !== surface), surface];
}

function popSurface(stack: SurfaceId[], surface: SurfaceId): SurfaceId[] {
  return stack.filter((item) => item !== surface);
}

// Returning to the investor profile drops the active scenario so the focused
// investor is never hidden; entering the directory keeps it.
function applySection(state: SessionUIState, section: AppSection): SessionUIState {
  if (section === 'investors') {
    return { ...state, section: 'investors', filters: { ...state.filters, scenarioId: '' } };
  }
  // 'scenarios' or 'gallery' — both keep the directory's active scenario.
  return { ...state, section };
}

function closeSurface(state: SessionUIState, surface: SurfaceId): SessionUIState {
  const surfaces = { ...state.surfaces };
  switch (surface) {
    case 'drawer': surfaces.drawer = { ...surfaces.drawer, open: false }; break;
    case 'palette': surfaces.palette = false; break;
    case 'help': surfaces.help = false; break;
    case 'filterPopover': surfaces.filterPopover = null; break;
    case 'importModal': surfaces.importModal = false; break;
    case 'expandedChart': surfaces.expandedChartId = null; break;
  }
  return { ...state, surfaces, overlayStack: popSurface(state.overlayStack, surface) };
}

export function sessionReducer(state: SessionUIState, action: SessionAction): SessionUIState {
  switch (action.type) {
    case 'select-investors':
      return { ...state, selection: { ...state.selection, investorKeys: action.keys } };
    case 'set-view-mode':
      return { ...state, selection: { ...state.selection, viewMode: action.viewMode } };
    case 'set-side':
      return {
        ...closeSurface(state, 'expandedChart'),
        selection: { ...state.selection, side: action.side },
      };
    case 'set-filters':
      return { ...state, filters: action.filters };
    case 'set-query':
      return { ...state, investorQuery: action.query };
    case 'set-scenario-filter':
      return { ...state, filters: { ...state.filters, scenarioId: action.scenarioId } };
    case 'set-focus-visual':
      return { ...state, focusVisual: action.visualId };
    case 'toggle-section':
      return applySection(state, state.section === 'investors' ? 'scenarios' : 'investors');
    case 'set-section':
      return applySection(state, action.section);
    case 'open-drawer':
      return {
        ...state,
        surfaces: { ...state.surfaces, drawer: { open: true } },
        overlayStack: pushStack(state.overlayStack, 'drawer'),
      };
    case 'toggle-palette':
      return state.surfaces.palette
        ? closeSurface(state, 'palette')
        : { ...state, surfaces: { ...state.surfaces, palette: true }, overlayStack: pushStack(state.overlayStack, 'palette') };
    case 'toggle-help':
      return state.surfaces.help
        ? closeSurface(state, 'help')
        : { ...state, surfaces: { ...state.surfaces, help: true }, overlayStack: pushStack(state.overlayStack, 'help') };
    case 'open-filter-popover':
      return {
        ...state,
        surfaces: { ...state.surfaces, filterPopover: action.filterId },
        overlayStack: pushStack(state.overlayStack, 'filterPopover'),
      };
    case 'open-import':
      return {
        ...state,
        surfaces: { ...state.surfaces, importModal: true },
        overlayStack: pushStack(state.overlayStack, 'importModal'),
      };
    case 'set-expanded-chart':
      return action.chartId
        ? {
            ...state,
            surfaces: { ...state.surfaces, expandedChartId: action.chartId },
            overlayStack: pushStack(state.overlayStack, 'expandedChart'),
          }
        : closeSurface(state, 'expandedChart');
    case 'close-surface':
      return closeSurface(state, action.surface);
    case 'close-top': {
      const top = state.overlayStack[state.overlayStack.length - 1];
      if (!top) return state;
      return closeSurface(state, top);
    }
    case 'import-completed':
      return {
        ...closeSurface(state, 'importModal'),
        selection: {
          investorKeys: action.defaultInvestorKey ? [action.defaultInvestorKey] : [],
          viewMode: 'combined',
          side: action.side,
        },
        filters: { ...defaultDashboardFilters, endDate: action.endDate },
        investorQuery: '',
        section: 'investors',
        focusVisual: 'cashFlow',
      };
    default:
      return state;
  }
}
