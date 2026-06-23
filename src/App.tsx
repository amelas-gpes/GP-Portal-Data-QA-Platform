import { memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ImportDropZone, ImportModal } from './components/ImportPanel';
import { CommandPalette } from './components/overlays/CommandPalette';
import { HelpOverlay } from './components/overlays/HelpOverlay';
import { QueueRail } from './components/rail/QueueRail';
import { RawData } from './components/RawData';
import { StageHeader } from './components/shell/StageHeader';
import { TopBar } from './components/shell/TopBar';
import { ChartStage } from './components/stage/ChartStage';
import { InvestorScenarioSummary } from './components/stage/InvestorScenarioSummary';
import { ScenariosSection, type ScenarioLens } from './components/stage/ScenariosSection';
import { ScenarioGallery } from './components/gallery/ScenarioGallery';
import { DockPanel, WorkbenchToggles } from './components/workbench/DockPanel';
import { WhatIfPanel } from './components/workbench/WhatIfPanel';
import { DOCK_EDGES, EDGE_VIEWS, useDockLayout, type DockEdge, type DockViewId } from './state/dockLayout';
import { LogicPanel } from './components/workbench/LogicPanel';
import { cloneFormulaRegistry, DEFAULT_FORMULA_REGISTRY } from './data/defaultLogic';
import { useBIWorker } from './hooks/useBIWorker';
import { bundleCacheKey, useBundleCache } from './hooks/useBundleCache';
import { useInvestorHistory } from './hooks/useInvestorHistory';
import { createInitialSessionState, sessionReducer, type AppSection } from './state/sessionReducer';
import type {
  ChartBundle,
  ChartBundleSet,
  DashboardFilters,
  FormulaRegistry,
  ImportFingerprintV2,
  ImportSummary,
  InvestorOption,
  InvestorScenarioRecord,
  LogicVersion,
  QuarterPoint,
  ScenarioBucket,
  ScenarioVisualId,
  WorkerComputeBundleSetPayload,
} from './types';
import { computeKpis, computeQuarterSeries } from './utils/charts';
import { filterInvestors } from './utils/investorFilters';
import { SCENARIO_VISUAL_IDS, classifyInvestorScenarios, scenarioBucketsForInvestors, scenarioEverBucketsForInvestors, scenarioVisualTitle } from './utils/scenarioClassifier';
import { exportScenarioMembersCsv, exportScenarioWorkbook } from './utils/scenarioExport';
import { applyScenarioCustomValues, applyScenarioOverrides, availableScenarioPeriods, type ScenarioCustomValueMap, type ScenarioOverrideMap } from './utils/scenarioSimulation';
import { clearStoredSessionData, createSessionFileFingerprint } from './utils/sessionStore';
import type { NumericKey } from './data/columns';

// ── What-if (source-value) config ──────────────────────────────────────────

export type SimConfig = {
  overrides: ScenarioOverrideMap;
  customValues: ScenarioCustomValueMap;
  periodKey: string;
  presetId: string | null;
};

const LP_QUARTER_KEYS = [
  'contributions', 'distributions', 'commitments', 'unfundedCommitments',
  'capitalAccountBalance', 'totalValue', 'tvpi', 'dpi', 'capitalAtWork',
] as const;

/** Phones treat panels as full-screen drawers; desktop docks them as columns. */
function isNarrowViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
}

function simIsArmed(sim: SimConfig | null): boolean {
  if (!sim) return false;
  return Object.values(sim.overrides).some((polarity) => polarity && polarity !== 'current')
    || Object.values(sim.customValues).some((value) => Number.isFinite(value));
}

/** Merge baseline values into simulated points as `${key}__base` ghost fields. */
function mergeSimBaseline(simPoints: QuarterPoint[], baselinePoints: QuarterPoint[]): QuarterPoint[] {
  const baselineByKey = new Map(baselinePoints.map((point) => [point.key, point]));
  return simPoints.map((point) => {
    const baseline = baselineByKey.get(point.key);
    if (!baseline) return point;
    const next: Record<string, unknown> = { ...point };
    for (const key of LP_QUARTER_KEYS) next[`${key}__base`] = baseline[key];
    return next as unknown as QuarterPoint;
  });
}

const MemoTopBar = memo(TopBar);
const MemoQueueRail = memo(QueueRail);
const MemoStageHeader = memo(StageHeader);
const MemoChartStage = memo(ChartStage);

const ALL_CHARTS_VISIBLE: Record<string, boolean> = {
  commitmentSummary: true, totalValue: true, cashFlowSummary: true, ratioAnalysis: true, capitalAtWork: true,
  ltdCommitmentSummaryBar: true, ltdCommitmentSummaryPie: true, totalValueByProgramBar: true, totalValueByProgramPie: true,
  carriedInterestByProgramBar: true, carriedInterestByProgramPie: true, cashFlowByPeriod: true,
};

const HISTORY_BLOCKING_OVERLAYS: readonly string[] = ['palette', 'help', 'importModal'];

function App() {
  const { importWorkbook: importWorkbookFromWorker, computeBundleSet, resetWorker, importProgress } = useBIWorker();
  const cache = useBundleCache(computeBundleSet);

  const [ui, dispatch] = useReducer(sessionReducer, undefined, createInitialSessionState);
  // Editable formula registry — the charts compute through it. A metric whose
  // draftFormula differs from production flips the whole view to draft logic, so
  // the worker recompute (and the what-if recompute) evaluate the draft formulas.
  const [formulas, setFormulas] = useState<FormulaRegistry>(() => cloneFormulaRegistry());
  const [logicMetricId, setLogicMetricId] = useState<string | null>(null);
  const draftLogicActive = useMemo(
    () => Object.values(formulas).some((metric) => metric.draftFormula !== metric.productionFormula),
    [formulas],
  );
  const logicVersion: LogicVersion = draftLogicActive ? 'draft' : 'production';
  const [sim, setSim] = useState<SimConfig | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [bundleSet, setBundleSet] = useState<ChartBundleSet | null>(null);
  const [importFingerprint, setImportFingerprint] = useState<ImportFingerprintV2 | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [hasLastImportFile, setHasLastImportFile] = useState(false);
  const [lastImportFileName, setLastImportFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [computePending, setComputePending] = useState(false);
  // The workbench shell: which side panels are open, their sizes, and what each
  // one shows. Persisted to localStorage so the workspace survives a reload.
  const dock = useDockLayout();
  // Directory lens: "latest" = current-state snapshot (counts partition the
  // population); "ever" = every scenario an investor passed through (counts overlap).
  const [scenarioLens, setScenarioLens] = useState<ScenarioLens>('latest');

  const lastImportFileRef = useRef<File | null>(null);
  const activeImportFileRef = useRef<File | null>(null);
  const importGenerationRef = useRef(0);
  const requestKeyRef = useRef<string | null>(null);

  const { selection, filters, investorQuery, section, focusVisual, surfaces, overlayStack } = ui;
  const { investorKeys: selectedInvestorKeys, viewMode, side } = selection;

  useEffect(() => { void clearStoredSessionData(); }, []);

  const hasLiveData = Boolean(summary);
  const simArmed = simIsArmed(sim) && side === 'lp';
  const scenarioModel = summary?.scenarioModel ?? null;

  const deferredInvestorQuery = useDeferredValue(investorQuery);

  // The investor list / stepping is filtered by the DATASET filters only — never
  // by the active scenario. A scenario is browsed in the directory, not a filter
  // that hides the investor you are looking at.
  const navigableInvestors = useMemo(
    () => filterInvestors(summary?.investorOptions ?? [], { ...filters, scenarioId: '' }, deferredInvestorQuery, summary?.scenarioInvestorsById ?? {}),
    [deferredInvestorQuery, filters, summary?.investorOptions, summary?.scenarioInvestorsById],
  );

  // Scenario directory: how the filtered population splits for the focused visual.
  // "latest" buckets each investor by its current state; "ever" counts every
  // scenario an investor passed through across the life of the fund.
  const focusBuckets = useMemo<ScenarioBucket[]>(() => {
    if (!scenarioModel) return [];
    const keys = navigableInvestors.map((option) => option.key);
    return scenarioLens === 'ever'
      ? scenarioEverBucketsForInvestors(scenarioModel.timelineByInvestor, focusVisual, keys)
      : scenarioBucketsForInvestors(scenarioModel, focusVisual, keys);
  }, [scenarioModel, focusVisual, navigableInvestors, scenarioLens]);

  // The selected investor's own classification (investor profile).
  const selectedRecord = useMemo<InvestorScenarioRecord | null>(
    () => (selectedInvestorKeys.length === 1 && scenarioModel ? scenarioModel.recordByInvestor[selectedInvestorKeys[0]] ?? null : null),
    [selectedInvestorKeys, scenarioModel],
  );

  // Members of the selected scenario (directory). Derived from focusBuckets so
  // it honors the active lens — the bucket already holds the right population.
  const scenarioMembers = useMemo<InvestorScenarioRecord[]>(() => {
    if (!scenarioModel || !filters.scenarioId) return [];
    const bucket = focusBuckets.find((candidate) => candidate.id === filters.scenarioId);
    if (!bucket) return [];
    return bucket.investorKeys
      .map((key) => scenarioModel.recordByInvestor[key])
      .filter((record): record is InvestorScenarioRecord => Boolean(record));
  }, [scenarioModel, filters.scenarioId, focusBuckets]);

  const queueOrder = navigableInvestors;
  const currentKey = selectedInvestorKeys[selectedInvestorKeys.length - 1] ?? null;
  const currentQueueIndex = currentKey ? queueOrder.findIndex((option) => option.key === currentKey) : -1;

  const selectedInvestors = useMemo(() => {
    if (!summary) return [] as InvestorOption[];
    const byKey = new Map(summary.investorOptions.map((option) => [option.key, option]));
    return selectedInvestorKeys.map((key) => byKey.get(key)).filter((option): option is InvestorOption => Boolean(option));
  }, [selectedInvestorKeys, summary]);

  const bundle: ChartBundle | null = bundleSet?.combined ?? null;
  const individualBundles = bundleSet?.individual ?? [];

  const selectedName = selectedInvestors.length === 1
    ? (selectedInvestors[0].investorPortalDisplayName ?? selectedInvestors[0].investorGroupName ?? selectedInvestors[0].label)
    : 'Investor';

  // In the directory, keep a valid scenario selected for the focused visual:
  // entering the section or switching visual auto-selects the largest scenario.
  useEffect(() => {
    if (section !== 'scenarios' || !scenarioModel) return;
    const valid = focusBuckets.some((bucket) => bucket.id === filters.scenarioId);
    if (!valid) dispatch({ type: 'set-scenario-filter', scenarioId: focusBuckets[0]?.id ?? '' });
  }, [section, scenarioModel, focusBuckets, filters.scenarioId]);

  // ── Bundle compute (cache → worker), echo-verified commit ────────────────
  const includeIndividualBundles = selectedInvestorKeys.length > 1 && viewMode === 'individual';
  // The Data dock renders raw rows; fetch them whenever it (or the what-if / an
  // expanded chart) needs them.
  const dataDockVisible =
    (dock.layout.right.open && dock.layout.right.view === 'data') ||
    (dock.layout.bottom.open && dock.layout.bottom.view === 'data');
  // The gallery synthesizes scenarios from the selected investor's rows, so it
  // needs the raw rows just like the what-if / data dock do.
  const needRawRows = sim !== null || surfaces.expandedChartId !== null || dataDockVisible || section === 'gallery';
  useEffect(() => {
    if (!summary || !selectedInvestorKeys.length) return;
    const payload: WorkerComputeBundleSetPayload = {
      investorKeys: selectedInvestorKeys,
      filters,
      formulas,
      logicVersion,
      includeIndividualBundles,
      includeRawRows: needRawRows,
    };
    const key = bundleCacheKey(payload);
    requestKeyRef.current = key;
    let cancelled = false;
    void (async () => {
      // Set inside the async body (not synchronously in the effect) to avoid a
      // cascading render; it still runs before the first await, so the pending
      // flag is raised the moment the request starts, exactly as before.
      setComputePending(true);
      try {
        const set = await cache.getBundleSet(payload);
        if (cancelled || requestKeyRef.current !== key) return;
        setBundleSet(set);
        setComputePending(false);
        setError(null);
        if (selectedInvestorKeys.length === 1 && currentQueueIndex >= 0) {
          const neighbors = [currentQueueIndex + 1, currentQueueIndex + 2, currentQueueIndex - 1]
            .map((index) => queueOrder[index])
            .filter((option): option is InvestorOption => Boolean(option))
            .map((option) => ({
              investorKeys: [option.key],
              filters,
              formulas,
              logicVersion,
              includeIndividualBundles: false,
              includeRawRows: false,
            }));
          cache.schedulePrefetch(neighbors);
        }
      } catch (computeError) {
        if (cancelled) return;
        if (computeError instanceof Error && computeError.name === 'AbortError') return;
        setComputePending(false);
        setError(computeError instanceof Error ? computeError.message : 'Computation failed.');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, filters, formulas, logicVersion, includeIndividualBundles, needRawRows, selectedInvestorKeys, summary]);

  // ── What-if (client-side, zero worker calls) ──────────────────────────────
  const simResult = useMemo(() => {
    if (!simArmed || !sim || !bundle || !bundle.rawRows.length) return null;
    const overrideFields = Object.keys(sim.overrides) as NumericKey[];
    const customFields = Object.keys(sim.customValues) as NumericKey[];
    let rows = applyScenarioOverrides(bundle.rawRows, overrideFields, sim.overrides, sim.periodKey);
    rows = applyScenarioCustomValues(rows, customFields, sim.customValues, sim.periodKey);
    let rowsChanged = 0;
    for (let index = 0; index < rows.length; index++) {
      if (rows[index] !== bundle.rawRows[index]) rowsChanged += 1;
    }
    const quarterSeries = computeQuarterSeries(rows, formulas, logicVersion, filters.cumulative);
    const kpis = computeKpis(rows, formulas, logicVersion);
    let scenarioShift: Array<{ visual: string; before: string; after: string }> = [];
    if (selectedInvestorKeys.length === 1) {
      const before = Object.values(classifyInvestorScenarios(bundle.rawRows).recordByInvestor)[0];
      const after = Object.values(classifyInvestorScenarios(rows).recordByInvestor)[0];
      if (before && after) {
        scenarioShift = SCENARIO_VISUAL_IDS
          .filter((visualId) => before.labels[visualId] !== after.labels[visualId])
          .map((visualId) => ({ visual: scenarioVisualTitle(visualId), before: before.labels[visualId], after: after.labels[visualId] }));
      }
    }
    return {
      quarterSeries: mergeSimBaseline(quarterSeries, bundle.quarterSeries),
      kpis,
      baselineKpis: bundle.kpis,
      rowsChanged,
      sampleTruncated: bundle.rawRows.length < bundle.rowCount,
      scenarioShift,
    };
  }, [bundle, filters.cumulative, formulas, logicVersion, sim, simArmed, selectedInvestorKeys]);

  // ── Import flow ───────────────────────────────────────────────────────────
  const importWorkbook = async (file: File) => {
    const importGeneration = importGenerationRef.current + 1;
    importGenerationRef.current = importGeneration;
    lastImportFileRef.current = file;
    setHasLastImportFile(true);
    setLastImportFileName(file.name);
    setIsImporting(true);
    setError(null);
    try {
      const nextSummary = await importWorkbookFromWorker(file, formulas);
      const nextFingerprint = await createSessionFileFingerprint(file, nextSummary);
      if (importGeneration !== importGenerationRef.current) return;
      activeImportFileRef.current = file;
      cache.clear();
      setSummary(nextSummary);
      setImportFingerprint(nextFingerprint);
      setBundleSet(null);
      setSim(null);
      investorHistory.reset();
      const landingKey = nextSummary.defaultInvestorKey;
      const landingInvestor = nextSummary.investorOptions.find((option) => option.key === landingKey);
      dispatch({
        type: 'import-completed',
        defaultInvestorKey: landingKey ?? null,
        side: landingInvestor?.investorType?.toUpperCase() === 'GP' ? 'gp' : 'lp',
        endDate: nextSummary.filterOptions.maxDate ?? '',
      });
    } catch (importError) {
      if (importGeneration !== importGenerationRef.current) return;
      setError(importError instanceof Error ? importError.message : 'Import failed.');
    } finally {
      if (importGeneration === importGenerationRef.current) setIsImporting(false);
    }
  };

  const restoreActiveWorkbook = async (file: File) => {
    const restoreGeneration = importGenerationRef.current + 1;
    importGenerationRef.current = restoreGeneration;
    setLastImportFileName(file.name);
    setIsImporting(true);
    setError('Import cancelled. Restoring the previous workbook view.');
    try {
      const restoredSummary = await importWorkbookFromWorker(file, formulas);
      const restoredFingerprint = await createSessionFileFingerprint(file, restoredSummary);
      if (restoreGeneration !== importGenerationRef.current) return;
      setSummary(restoredSummary);
      setImportFingerprint(restoredFingerprint);
      setError(null);
    } catch {
      if (restoreGeneration !== importGenerationRef.current) return;
      setSummary(null);
      setBundleSet(null);
      setError('Import cancelled, but the previous workbook could not be restored. Choose the workbook again to continue.');
    } finally {
      if (restoreGeneration === importGenerationRef.current) setIsImporting(false);
    }
  };

  const cancelImport = () => {
    const activeFile = activeImportFileRef.current;
    importGenerationRef.current += 1;
    resetWorker('Import cancelled.');
    cache.clear();
    if (summary && activeFile) {
      void restoreActiveWorkbook(activeFile);
      return;
    }
    setIsImporting(false);
    setError('Import cancelled.');
  };

  const recoverImportEngine = () => {
    const lastImportFile = lastImportFileRef.current;
    resetWorker('Import engine restarted.');
    cache.clear();
    setError(null);
    setIsImporting(false);
    if (lastImportFile) void importWorkbook(lastImportFile);
  };

  // Top "Export scenarios" → workbook: every visual + its scenarios, plus a
  // Scenario Detail sheet.
  const exportScenarios = useCallback(() => {
    if (!summary) return;
    const base = (summary.fileName || 'scenarios').replace(/\.[^.]+$/, '');
    void exportScenarioWorkbook(summary.scenarioModel, base);
  }, [summary]);

  // Table "Export" → exactly the rows/columns shown for the selected scenario,
  // with the visual + scenario as context.
  const exportScenarioMembers = useCallback(() => {
    if (!scenarioMembers.length || !filters.scenarioId) return;
    const base = (summary?.fileName || 'scenario').replace(/\.[^.]+$/, '');
    const [visualId, label] = filters.scenarioId.split('::');
    exportScenarioMembersCsv({
      fileBase: base,
      visualTitle: scenarioVisualTitle(visualId as ScenarioVisualId),
      scenarioLabel: label ?? filters.scenarioId,
      records: scenarioMembers,
    });
  }, [scenarioMembers, summary?.fileName, filters.scenarioId]);

  // ── Selection & navigation ────────────────────────────────────────────────
  // On phones the panels float over the stage; dismiss whichever is open after a
  // pick so the chosen investor's profile is visible. On desktop they stay put.
  const closeDocksOnMobile = useCallback(() => {
    if (!isNarrowViewport()) return;
    for (const edge of DOCK_EDGES) dock.setOpen(edge, false);
  }, [dock]);

  const selectInvestor = useCallback((investorKey: string) => {
    dispatch({ type: 'select-investors', keys: [investorKey] });
    dispatch({ type: 'set-section', section: 'investors' });
    closeDocksOnMobile();
  }, [closeDocksOnMobile]);

  const investorHistory = useInvestorHistory(currentKey, selectInvestor);

  const stepInvestor = useCallback((delta: -1 | 1) => {
    if (!queueOrder.length) return;
    const index = currentQueueIndex < 0
      ? (delta > 0 ? 0 : queueOrder.length - 1)
      : Math.min(queueOrder.length - 1, Math.max(0, currentQueueIndex + delta));
    const nextKey = queueOrder[index]?.key;
    if (nextKey && nextKey !== currentKey) dispatch({ type: 'select-investors', keys: [nextKey] });
  }, [currentKey, currentQueueIndex, queueOrder]);

  const cycleFocusVisual = useCallback(() => {
    const index = SCENARIO_VISUAL_IDS.indexOf(focusVisual);
    const next = SCENARIO_VISUAL_IDS[(index + 1) % SCENARIO_VISUAL_IDS.length];
    dispatch({ type: 'set-focus-visual', visualId: next });
  }, [focusVisual]);

  const clearSim = useCallback(() => { setSim(null); }, []);

  const setSection = useCallback((next: AppSection) => dispatch({ type: 'set-section', section: next }), []);

  // Directory: select a scenario card for the focused visual.
  const selectScenario = useCallback((bucket: ScenarioBucket) => {
    dispatch({ type: 'set-scenario-filter', scenarioId: bucket.id });
  }, []);

  const selectVisual = useCallback((visualId: ScenarioVisualId) => {
    dispatch({ type: 'set-focus-visual', visualId });
  }, []);

  // Bridge from the investor profile to the directory, on a specific scenario.
  const viewAllInScenario = useCallback((scenarioId: string, visualId: ScenarioVisualId) => {
    dispatch({ type: 'set-section', section: 'scenarios' });
    dispatch({ type: 'set-focus-visual', visualId });
    dispatch({ type: 'set-scenario-filter', scenarioId });
  }, []);

  // Click an investor in the directory → open their profile.
  const focusInvestorFromMembership = useCallback((investorKey: string) => {
    dispatch({ type: 'select-investors', keys: [investorKey] });
    dispatch({ type: 'set-section', section: 'investors' });
    closeDocksOnMobile();
  }, [closeDocksOnMobile]);

  // The 's' shortcut and command palette reveal the what-if (source-value) surface.
  const openWhatIf = useCallback(() => {
    dock.openWith('right', 'whatif');
  }, [dock]);

  // ── Logic editing ─────────────────────────────────────────────────────────
  // Clicking a metric chip opens the Logic panel focused on that metric. Editing
  // a draft formula flips logicVersion to 'draft', which busts the bundle cache
  // (the key hashes drafts that differ from production) and recomputes the charts.
  const openLogicForMetric = useCallback((metricId: string) => {
    setLogicMetricId(metricId);
    dock.openWith('right', 'logic');
  }, [dock]);

  // Palette / keyboard entry: reveal the editor without targeting a metric (the
  // panel keeps the last selection, or defaults to the first metric).
  const openLogic = useCallback(() => {
    dock.openWith('right', 'logic');
  }, [dock]);

  const selectLogicMetric = useCallback((metricId: string) => setLogicMetricId(metricId), []);

  const applyMetricDraft = useCallback((metricId: string, draftFormula: string) => {
    setFormulas((prev) => {
      const metric = prev[metricId];
      if (!metric || metric.draftFormula === draftFormula) return prev;
      return { ...prev, [metricId]: { ...metric, draftFormula } };
    });
  }, []);

  const resetMetricFormula = useCallback((metricId: string) => {
    setFormulas((prev) => {
      const original = DEFAULT_FORMULA_REGISTRY[metricId];
      if (!original || prev[metricId]?.draftFormula === original.productionFormula) return prev;
      return { ...prev, [metricId]: { ...original } };
    });
  }, []);

  const resetAllFormulas = useCallback(() => {
    setFormulas((prev) => (
      Object.values(prev).every((metric) => metric.draftFormula === metric.productionFormula)
        ? prev
        : cloneFormulaRegistry()
    ));
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = document.activeElement as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inEditor = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;

      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        dispatch({ type: 'toggle-palette' });
        return;
      }
      // Workbench panels: Ctrl/⌘+B navigator, Ctrl/⌘+Alt+B right, Ctrl/⌘+J bottom.
      if (mod && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        dock.toggle(event.altKey ? 'right' : 'left');
        return;
      }
      if (mod && !event.altKey && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        dock.toggle('bottom');
        return;
      }
      if (event.key === 'Escape') {
        if (overlayStack.length) {
          event.preventDefault();
          dispatch({ type: 'close-top' });
        } else if (inEditor) {
          target?.blur();
        }
        return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        if (inEditor || !hasLiveData) return;
        if (overlayStack.some((surface) => HISTORY_BLOCKING_OVERLAYS.includes(surface))) return;
        event.preventDefault();
        if (event.key === 'ArrowLeft') investorHistory.back();
        else investorHistory.forward();
        return;
      }
      if (inEditor || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!hasLiveData) return;
      const blockingOverlays: Array<typeof overlayStack[number]> = ['palette', 'help', 'importModal'];
      if (overlayStack.some((surface) => blockingOverlays.includes(surface))) return;

      switch (event.key) {
        case 'ArrowRight': case ']': case 'j': event.preventDefault(); stepInvestor(1); break;
        case 'ArrowLeft': case '[': case 'k': event.preventDefault(); stepInvestor(-1); break;
        case 't': event.preventDefault(); dispatch({ type: 'toggle-section' }); break;
        case 'g': event.preventDefault(); dispatch({ type: 'set-side', side: side === 'lp' ? 'gp' : 'lp' }); break;
        case 's': event.preventDefault(); openWhatIf(); break;
        case 'v': event.preventDefault(); cycleFocusVisual(); break;
        case 'x': if (simArmed) { event.preventDefault(); clearSim(); } break;
        case '/': {
          event.preventDefault();
          const railSearch = document.querySelector<HTMLInputElement>('.queue-rail__search input');
          railSearch?.focus();
          break;
        }
        case '?': event.preventDefault(); dispatch({ type: 'toggle-help' }); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [clearSim, cycleFocusVisual, dock, hasLiveData, investorHistory, openWhatIf, overlayStack, side, simArmed, stepInvestor]);

  // ── Stable handlers ─────────────────────────────────────────────────────────
  const handleFiltersChange = useCallback((next: DashboardFilters) => {
    startTransition(() => dispatch({ type: 'set-filters', filters: next }));
  }, []);
  const handleOpenFilter = useCallback((filterId: string | null) => {
    if (filterId) dispatch({ type: 'open-filter-popover', filterId });
    else dispatch({ type: 'close-surface', surface: 'filterPopover' });
  }, []);
  const handleClearQuery = useCallback(() => dispatch({ type: 'set-query', query: '' }), []);
  const handleProgressClick = useCallback(() => dispatch({ type: 'toggle-palette' }), []);
  const handleReplace = useCallback(() => dispatch({ type: 'open-import' }), []);
  const handleSelectKeys = useCallback((keys: string[]) => {
    dispatch({ type: 'select-investors', keys });
    if (keys.length === 1) {
      // A single pick is "open this investor's profile".
      dispatch({ type: 'set-section', section: 'investors' });
      closeDocksOnMobile();
    }
  }, [closeDocksOnMobile]);
  const closeAllDocks = useCallback(() => {
    dock.setOpen('left', false);
    dock.setOpen('right', false);
    dock.setOpen('bottom', false);
  }, [dock]);
  // On phones a panel is a full-screen drawer; opening one closes the others so
  // they never stack and overlap. On desktop they coexist as docked columns.
  const toggleDock = useCallback((edge: DockEdge) => {
    const willOpen = !dock.layout[edge].open;
    if (willOpen && isNarrowViewport()) {
      for (const other of DOCK_EDGES) if (other !== edge) dock.setOpen(other, false);
    }
    dock.toggle(edge);
  }, [dock]);
  const handleQueryChange = useCallback((query: string) => dispatch({ type: 'set-query', query }), []);
  const handleSideChange = useCallback((nextSide: 'lp' | 'gp') => dispatch({ type: 'set-side', side: nextSide }), []);
  const handleViewModeChange = useCallback((nextMode: 'combined' | 'individual') => dispatch({ type: 'set-view-mode', viewMode: nextMode }), []);
  const handleExpandedChartChange = useCallback((chartId: string | null) => dispatch({ type: 'set-expanded-chart', chartId }), []);

  const investorOptionByKey = useMemo(
    () => new Map((summary?.investorOptions ?? []).map((option) => [option.key, option])),
    [summary?.investorOptions],
  );
  const getRecentInvestors = useCallback(
    () => investorHistory.getRecent()
      .map((key) => investorOptionByKey.get(key))
      .filter((option): option is InvestorOption => Boolean(option)),
    [investorHistory, investorOptionByKey],
  );

  const simPeriodOptions = useMemo(() => availableScenarioPeriods(bundle?.rawRows ?? []), [bundle?.rawRows]);

  const scenarioShiftNode = simArmed && simResult
    ? (simResult.scenarioShift.length ? (
        <div className="scenario-shift">
          <strong className="scenario-shift__title">Scenario shift</strong>
          {simResult.scenarioShift.map((shift) => (
            <div className="scenario-shift__row" key={shift.visual}>
              <span className="scenario-shift__visual">{shift.visual}</span>
              <span className="scenario-shift__before">{shift.before}</span>
              <span className="scenario-shift__arrow" aria-hidden="true">→</span>
              <span className="scenario-shift__after">{shift.after}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="scenario-shift scenario-shift--none">
          {selectedInvestorKeys.length === 1 ? 'No scenario change for this investor under the current what-if.' : 'Select a single investor to see its scenario shift.'}
        </div>
      ))
    : undefined;

  // The scenario directory — shared by the center stage and any dock that hosts it.
  const scenariosSection = (
    <ScenariosSection
      focusVisual={focusVisual}
      buckets={focusBuckets}
      totalInvestors={navigableInvestors.length}
      selectedScenarioId={filters.scenarioId}
      members={scenarioMembers}
      selectedInvestorKey={currentKey}
      lens={scenarioLens}
      timelines={scenarioModel?.timelineByInvestor}
      onSelectVisual={selectVisual}
      onSelectScenario={selectScenario}
      onFocusInvestor={focusInvestorFromMembership}
      onChangeLens={setScenarioLens}
      onExportMembers={exportScenarioMembers}
    />
  );

  // What the right/bottom panels render for their chosen view.
  const renderDockView = (view: DockViewId): ReactNode => {
    switch (view) {
      case 'scenarios':
        return scenariosSection;
      case 'data':
        return <RawData bundle={bundle} />;
      case 'logic':
        return (
          <LogicPanel
            formulas={formulas}
            selectedMetricId={logicMetricId}
            onSelectMetric={selectLogicMetric}
            onApplyDraft={applyMetricDraft}
            onResetMetric={resetMetricFormula}
            onResetAll={resetAllFormulas}
          />
        );
      case 'whatif':
        return (
          <WhatIfPanel
            side={side}
            sim={sim}
            simArmed={simArmed}
            periodOptions={simPeriodOptions}
            scenarioShift={scenarioShiftNode}
            onSimChange={setSim}
            onClearSim={clearSim}
          />
        );
      default:
        return null;
    }
  };

  const anyDockOpen = dock.layout.left.open || dock.layout.right.open || dock.layout.bottom.open;
  const workbenchStyle = {
    '--nav-size': `${dock.layout.left.size}px`,
    '--side-size': `${dock.layout.right.size}px`,
    '--bottom-size': `${dock.layout.bottom.size}px`,
  } as CSSProperties;

  // ── Render ────────────────────────────────────────────────────────────────
  if (!hasLiveData) {
    return (
      <main className="app-empty">
        <div className="app-empty__inner">
          <h1 className="app-empty__headline">GP Portal Scenarios</h1>
          <p className="app-empty__sub">Import a BI workbook or CSV to classify every investor into a scenario per visual. Everything stays in this browser.</p>
          <ImportDropZone
            className="app-empty__drop"
            chooseButtonTitle="Choose an Excel or CSV file from your computer."
            detail={isImporting ? 'Reading the selected file in this browser.' : 'Drag an Excel or CSV file here, or select one from your computer.'}
            dropZoneTitle="Drop an Excel workbook or CSV file here to start."
            eyebrow={isImporting ? 'Importing' : 'Start'}
            heading="Choose a workbook"
            isImporting={isImporting}
            onImport={importWorkbook}
            primaryLabel={isImporting ? 'Importing...' : 'Select file'}
          />
          {error ? <div className="alert alert-danger app-alert">{error}</div> : null}
          {isImporting && importProgress ? (
            <p className="app-empty__progress">{importProgress.phase}{importProgress.processedRows ? ` — ${importProgress.processedRows.toLocaleString()} rows` : ''}</p>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell" data-mode={simArmed ? 'SIM' : 'PROD'} data-section={section} data-diff-armed={simArmed ? 'true' : undefined}>
      <MemoTopBar
        summary={summary}
        fileName={lastImportFileName}
        filters={filters}
        filterOptions={summary?.filterOptions ?? null}
        investorQuery={investorQuery}
        openFilterId={surfaces.filterPopover}
        simArmed={simArmed}
        isImporting={isImporting}
        onFiltersChange={handleFiltersChange}
        onOpenFilter={handleOpenFilter}
        onClearQuery={handleClearQuery}
        onExport={exportScenarios}
        onReplace={handleReplace}
        onOpenPalette={handleProgressClick}
        onClearSim={clearSim}
        logicDraftActive={draftLogicActive}
        onResetLogic={resetAllFormulas}
        panelControls={<WorkbenchToggles layout={dock.layout} onToggle={toggleDock} />}
      />

      <div
        className="workbench"
        data-nav-open={dock.layout.left.open ? 'true' : undefined}
        data-side-open={dock.layout.right.open ? 'true' : undefined}
        data-bottom-open={dock.layout.bottom.open ? 'true' : undefined}
        style={workbenchStyle}
      >
        <div className="workbench__scrim" data-active={anyDockOpen ? 'true' : undefined} role="presentation" onClick={closeAllDocks} />

        {dock.layout.left.open ? (
          <DockPanel
            edge="left"
            state={dock.layout.left}
            title="Investors"
            onSelectView={() => undefined}
            onClose={() => dock.setOpen('left', false)}
            onResize={(size) => dock.setSize('left', size)}
          >
            <MemoQueueRail
              investors={queueOrder}
              selectedKeys={selectedInvestorKeys}
              query={investorQuery}
              getRecentInvestors={getRecentInvestors}
              onSelect={handleSelectKeys}
              onQueryChange={handleQueryChange}
            />
          </DockPanel>
        ) : null}

        <div className="stage-column">
          <div className="section-switch" role="tablist" aria-label="Section">
            <button type="button" role="tab" aria-selected={section === 'investors'} data-active={section === 'investors' ? 'true' : undefined} onClick={() => setSection('investors')}>
              Investor
            </button>
            <button type="button" role="tab" aria-selected={section === 'scenarios'} data-active={section === 'scenarios' ? 'true' : undefined} onClick={() => setSection('scenarios')}>
              Scenarios
            </button>
            <button type="button" role="tab" aria-selected={section === 'gallery'} data-active={section === 'gallery' ? 'true' : undefined} onClick={() => setSection('gallery')}>
              Gallery
            </button>
          </div>

          {error ? <div className="alert alert-danger app-alert">{error}</div> : null}

          {section === 'investors' ? (
            <>
              <MemoStageHeader
                investors={selectedInvestors}
                viewMode={viewMode}
                side={side}
                position={{ index: currentQueueIndex, total: queueOrder.length }}
                computePending={computePending}
                onStep={stepInvestor}
                onSideChange={handleSideChange}
                onViewModeChange={handleViewModeChange}
              />

              <MemoChartStage
                side={side}
                viewMode={viewMode}
                bundle={bundle}
                individualBundles={individualBundles}
                formulas={formulas}
                logicVersion={logicVersion}
                visibility={ALL_CHARTS_VISIBLE}
                simArmed={simArmed}
                simQuarterSeries={simResult?.quarterSeries ?? null}
                simKpis={simResult?.kpis ?? null}
                baselineKpis={simResult?.baselineKpis ?? null}
                computePending={computePending}
                expandedChartId={surfaces.expandedChartId}
                onExpandedChartChange={handleExpandedChartChange}
                onMetricClick={openLogicForMetric}
                scenarioSummary={
                  selectedRecord ? (
                    <InvestorScenarioSummary
                      investorName={selectedName}
                      fund={selectedRecord.fund}
                      record={selectedRecord}
                      timeline={scenarioModel?.timelineByInvestor[selectedRecord.investorKey]}
                      highlightScenarioId={filters.scenarioId}
                      onViewAll={viewAllInScenario}
                    />
                  ) : null
                }
              />
            </>
          ) : section === 'gallery' ? (
            <ScenarioGallery
              baseRows={bundle?.rawRows ?? []}
              baseName={selectedName}
              baseShortCode={selectedInvestors.length === 1 ? selectedInvestors[0].investorShortCode : null}
              formulas={formulas}
              logicVersion={logicVersion}
              cumulative={filters.cumulative}
              initialVisual={focusVisual}
            />
          ) : (
            scenariosSection
          )}
        </div>

        {dock.layout.right.open ? (
          <DockPanel
            edge="right"
            state={dock.layout.right}
            views={EDGE_VIEWS.right}
            dotView={simArmed ? 'whatif' : null}
            onSelectView={(view) => dock.setView('right', view)}
            onClose={() => dock.setOpen('right', false)}
            onResize={(size) => dock.setSize('right', size)}
          >
            {renderDockView(dock.layout.right.view)}
          </DockPanel>
        ) : null}

        {dock.layout.bottom.open ? (
          <DockPanel
            edge="bottom"
            state={dock.layout.bottom}
            views={EDGE_VIEWS.bottom}
            dotView={simArmed ? 'whatif' : null}
            onSelectView={(view) => dock.setView('bottom', view)}
            onClose={() => dock.setOpen('bottom', false)}
            onResize={(size) => dock.setSize('bottom', size)}
          >
            {renderDockView(dock.layout.bottom.view)}
          </DockPanel>
        ) : null}
      </div>

      {surfaces.palette ? (
        <CommandPalette
          investors={summary?.investorOptions ?? []}
          scenarioModel={scenarioModel}
          filters={filters}
          filterOptions={summary?.filterOptions ?? null}
          currentInvestor={selectedInvestors.length === 1 ? selectedInvestors[0] : null}
          side={side}
          simArmed={simArmed}
          onSelectInvestor={(investorKey: string) => { selectInvestor(investorKey); dispatch({ type: 'close-surface', surface: 'palette' }); }}
          onAction={(actionId: string) => {
            dispatch({ type: 'close-surface', surface: 'palette' });
            switch (actionId) {
              case 'next-investor': stepInvestor(1); break;
              case 'prev-investor': stepInvestor(-1); break;
              case 'flip-side': dispatch({ type: 'set-side', side: side === 'lp' ? 'gp' : 'lp' }); break;
              case 'open-source': openWhatIf(); break;
              case 'open-logic': openLogic(); break;
              case 'toggle-dock': dispatch({ type: 'set-section', section: 'scenarios' }); break;
              case 'toggle-rail-mode': dispatch({ type: 'toggle-section' }); break;
              case 'cycle-visual': cycleFocusVisual(); break;
              case 'clear-sim': clearSim(); break;
              case 'export': exportScenarios(); break;
              case 'replace': dispatch({ type: 'open-import' }); break;
              case 'help': dispatch({ type: 'toggle-help' }); break;
              default: break;
            }
          }}
          onSelectScenario={(scenarioId, visualId) => { viewAllInScenario(scenarioId, visualId); dispatch({ type: 'close-surface', surface: 'palette' }); }}
          onApplyFilter={(patch: Partial<DashboardFilters>) => {
            dispatch({ type: 'set-filters', filters: { ...filters, ...patch } });
            dispatch({ type: 'close-surface', surface: 'palette' });
          }}
          onExpandChart={(chartId: string, chartSide: 'lp' | 'gp') => {
            dispatch({ type: 'close-surface', surface: 'palette' });
            if (chartSide !== side) dispatch({ type: 'set-side', side: chartSide });
            dispatch({ type: 'set-section', section: 'investors' });
            dispatch({ type: 'set-expanded-chart', chartId });
          }}
          onClose={() => dispatch({ type: 'close-surface', surface: 'palette' })}
        />
      ) : null}

      {surfaces.help ? <HelpOverlay onClose={() => dispatch({ type: 'toggle-help' })} /> : null}

      {surfaces.importModal ? (
        <ImportModal
          summary={summary}
          isImporting={isImporting}
          importProgress={importProgress}
          error={error}
          recoverableError={isRecoverableWorkerError(error)}
          hasRetryFile={hasLastImportFile}
          importFingerprint={importFingerprint}
          onImport={importWorkbook}
          onCancelImport={cancelImport}
          onRecoverImport={recoverImportEngine}
          onReloadApp={() => window.location.reload()}
          onClose={() => dispatch({ type: 'close-surface', surface: 'importModal' })}
        />
      ) : null}
    </main>
  );
}

function isRecoverableWorkerError(error: string | null) {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return normalized.includes('worker') || normalized.includes('import engine') || normalized.includes('could not read the file message');
}

export default App;
