import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  XAxis,
  YAxis,
} from 'recharts';
import { useId, useRef } from 'react';
import { useModalFocus } from '../hooks/useModalFocus';
import type { ChartBundle, PieModel, ProgramPoint, QuarterPoint, YearPoint } from '../types';
import { chartColors as colors, piePalette } from '../utils/chartTheme';
import { EmptyState } from './common';
import type { Visibility } from './Charts';

type LpChartKey = 'commitmentSummary' | 'totalValue' | 'cashFlowSummary' | 'ratioAnalysis' | 'capitalAtWork';
type GpChartKey =
  | 'ltdCommitmentSummaryBar'
  | 'ltdCommitmentSummaryPie'
  | 'totalValueByProgramBar'
  | 'totalValueByProgramPie'
  | 'carriedInterestByProgramBar'
  | 'carriedInterestByProgramPie'
  | 'cashFlowByPeriod';
type ChartPreviewKey = LpChartKey | GpChartKey;
type ChartItem = { key: ChartPreviewKey; label: string };

const lpItems: ChartItem[] = [
  { key: 'commitmentSummary', label: 'Commitment Summary' },
  { key: 'totalValue', label: 'Total Value' },
  { key: 'cashFlowSummary', label: 'Cash Flow Summary' },
  { key: 'ratioAnalysis', label: 'Ratio Analysis' },
  { key: 'capitalAtWork', label: 'Capital At Work' },
];

const gpItems: ChartItem[] = [
  { key: 'ltdCommitmentSummaryBar', label: 'LTD Commitment Summary Bar' },
  { key: 'ltdCommitmentSummaryPie', label: 'LTD Commitment Summary Pie' },
  { key: 'totalValueByProgramBar', label: 'Total Value By Program Bar' },
  { key: 'totalValueByProgramPie', label: 'Total Value By Program Pie' },
  { key: 'carriedInterestByProgramBar', label: 'Carried Interest By Program Bar' },
  { key: 'carriedInterestByProgramPie', label: 'Carried Interest By Program Pie' },
  { key: 'cashFlowByPeriod', label: 'Cash Flow By Period' },
];

const sampleQuarterSeries: QuarterPoint[] = [
  {
    key: '2025-Q1',
    label: 'Q1',
    endDate: '2025-03-31',
    rowCount: 4,
    contributions: 620000,
    distributions: 180000,
    commitments: 1200000,
    unfundedCommitments: 850000,
    capitalAccountBalance: 520000,
    totalValue: 700000,
    tvpi: 0.58,
    dpi: 0.15,
    capitalAtWork: 440000,
    percentDeployed: 0.37,
    nonRecallableDistributions: 140000,
    tooltipMetrics: {},
  },
  {
    key: '2025-Q2',
    label: 'Q2',
    endDate: '2025-06-30',
    rowCount: 5,
    contributions: 780000,
    distributions: 240000,
    commitments: 1280000,
    unfundedCommitments: 720000,
    capitalAccountBalance: 640000,
    totalValue: 880000,
    tvpi: 0.69,
    dpi: 0.19,
    capitalAtWork: 540000,
    percentDeployed: 0.42,
    nonRecallableDistributions: 180000,
    tooltipMetrics: {},
  },
  {
    key: '2025-Q3',
    label: 'Q3',
    endDate: '2025-09-30',
    rowCount: 6,
    contributions: 960000,
    distributions: 310000,
    commitments: 1320000,
    unfundedCommitments: 570000,
    capitalAccountBalance: 790000,
    totalValue: 1100000,
    tvpi: 0.83,
    dpi: 0.23,
    capitalAtWork: 650000,
    percentDeployed: 0.49,
    nonRecallableDistributions: 230000,
    tooltipMetrics: {},
  },
  {
    key: '2025-Q4',
    label: 'Q4',
    endDate: '2025-12-31',
    rowCount: 7,
    contributions: 1040000,
    distributions: 420000,
    commitments: 1380000,
    unfundedCommitments: 420000,
    capitalAccountBalance: 900000,
    totalValue: 1320000,
    tvpi: 0.96,
    dpi: 0.3,
    capitalAtWork: 620000,
    percentDeployed: 0.45,
    nonRecallableDistributions: 320000,
    tooltipMetrics: {},
  },
  {
    key: '2026-Q1',
    label: 'Q1',
    endDate: '2026-03-31',
    rowCount: 8,
    contributions: 1120000,
    distributions: 520000,
    commitments: 1450000,
    unfundedCommitments: 340000,
    capitalAccountBalance: 1020000,
    totalValue: 1540000,
    tvpi: 1.06,
    dpi: 0.36,
    capitalAtWork: 600000,
    percentDeployed: 0.41,
    nonRecallableDistributions: 420000,
    tooltipMetrics: {},
  },
];

const sampleProgramSeries: ProgramPoint[] = [
  {
    programKey: 'buyout',
    programName: 'Buyout',
    companyGroupCode: 'BO',
    rowCount: 8,
    ltdUnfunded: 520000,
    ltdDeemed: 260000,
    ltdCash: 820000,
    ltdCommitment: 1600000,
    investmentValue: 760000,
    carriedInterestDistributed: 120000,
    carriedInterestBalance: 180000,
    investmentDistributed: 240000,
    transferOfInterest: 60000,
    totalValue: 1360000,
    carryRealizedDistributed: 110000,
    carryRealizedUndistributed: 90000,
    carryUnrealizedGain: 140000,
    carryTransfer: 30000,
    totalCarriedInterest: 370000,
    tooltipMetrics: {},
  },
  {
    programKey: 'growth',
    programName: 'Growth',
    companyGroupCode: 'GR',
    rowCount: 6,
    ltdUnfunded: 360000,
    ltdDeemed: 180000,
    ltdCash: 640000,
    ltdCommitment: 1180000,
    investmentValue: 560000,
    carriedInterestDistributed: 90000,
    carriedInterestBalance: 130000,
    investmentDistributed: 190000,
    transferOfInterest: 35000,
    totalValue: 1005000,
    carryRealizedDistributed: 85000,
    carryRealizedUndistributed: 65000,
    carryUnrealizedGain: 105000,
    carryTransfer: 24000,
    totalCarriedInterest: 279000,
    tooltipMetrics: {},
  },
  {
    programKey: 'credit',
    programName: 'Credit',
    companyGroupCode: 'CR',
    rowCount: 4,
    ltdUnfunded: 220000,
    ltdDeemed: 90000,
    ltdCash: 440000,
    ltdCommitment: 750000,
    investmentValue: 390000,
    carriedInterestDistributed: 56000,
    carriedInterestBalance: 72000,
    investmentDistributed: 150000,
    transferOfInterest: 20000,
    totalValue: 688000,
    carryRealizedDistributed: 52000,
    carryRealizedUndistributed: 42000,
    carryUnrealizedGain: 78000,
    carryTransfer: 16000,
    totalCarriedInterest: 188000,
    tooltipMetrics: {},
  },
];

const sampleYearSeries: YearPoint[] = [
  { year: 2022, label: '2022', rowCount: 4, contributions: -420000, distributions: 90000, netCash: -330000, tooltipMetrics: {} },
  { year: 2023, label: '2023', rowCount: 6, contributions: -680000, distributions: 180000, netCash: -500000, tooltipMetrics: {} },
  { year: 2024, label: '2024', rowCount: 5, contributions: -520000, distributions: 360000, netCash: -160000, tooltipMetrics: {} },
  { year: 2025, label: '2025', rowCount: 7, contributions: -280000, distributions: 540000, netCash: 260000, tooltipMetrics: {} },
  { year: 2026, label: '2026', rowCount: 3, contributions: -160000, distributions: 620000, netCash: 460000, tooltipMetrics: {} },
];

const previewMargin = { top: 10, right: 10, bottom: 8, left: 10 };
const previewContainerProps = {
  width: '100%' as const,
  height: '100%' as const,
  minWidth: 1,
  minHeight: 1,
  initialDimension: { width: 300, height: 150 },
};

export function ConfigureCharts({
  bundle,
  draftVisibility,
  activeSide,
  dirty,
  onChange,
  onSideChange,
  onCancel,
  onSave,
}: {
  bundle: ChartBundle | null;
  draftVisibility: Visibility;
  activeSide: 'lp' | 'gp';
  dirty: boolean;
  onChange: (key: string, value: boolean) => void;
  onSideChange: (side: 'lp' | 'gp') => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const headingId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const { modalRef, handleModalKeyDown } = useModalFocus<HTMLElement>({
    initialFocusRef: cancelButtonRef,
    onClose: onCancel,
  });
  const items = activeSide === 'lp' ? lpItems : gpItems;
  return (
    <div className="modal-backdrop" role="presentation" title="Configure which chart components are visible in the workbench.">
      <section
        className="configure-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        onKeyDown={handleModalKeyDown}
        title="Turn individual chart components on or off without changing formula logic."
      >
        <header className="configure-header">
          <h2 id={headingId}>Configure Charts</h2>
          <div>
            <button ref={cancelButtonRef} className="text-button" type="button" onClick={onCancel} title="Close chart configuration without applying visibility changes.">
              Cancel
            </button>
            <button className="save-button" type="button" disabled={!dirty} onClick={onSave} title="Apply the selected chart visibility choices to the workbench.">
              Save
            </button>
          </div>
        </header>
        <div className="configure-tabs">
          <button type="button" className={activeSide === 'lp' ? 'active' : ''} onClick={() => onSideChange('lp')} title="Configure LP chart visibility.">
            LP Charts
          </button>
          <button type="button" className={activeSide === 'gp' ? 'active' : ''} onClick={() => onSideChange('gp')} title="Configure GP chart visibility.">
            GP Charts
          </button>
        </div>
        <div className="configure-grid">
          {items.map(({ key, label }) => {
            const checked = draftVisibility[key] ?? true;
            return (
              <label key={key} className={`configure-tile ${checked ? '' : 'configure-tile-disabled'}`} title={visibilityTooltip(label, checked)}>
                <input type="checkbox" checked={checked} onChange={(event) => onChange(key, event.target.checked)} title={visibilityTooltip(label, checked)} />
                <span className="configure-tile-title">{label}</span>
                <ConfigureChartPreview chartKey={key} bundle={bundle} />
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function visibilityTooltip(label: string, checked: boolean): string {
  return checked
    ? `${label} is visible. Uncheck to hide this chart from the workbench.`
    : `${label} is hidden. Check to show this chart in the workbench.`;
}

function ConfigureChartPreview({ chartKey, bundle }: { chartKey: ChartPreviewKey; bundle: ChartBundle | null }) {
  const quarters = bundle?.quarterSeries.length ? bundle.quarterSeries : sampleQuarterSeries;
  const programs = bundle?.programSeries.length ? bundle.programSeries : sampleProgramSeries;
  const years = bundle?.yearSeries.length ? bundle.yearSeries : sampleYearSeries;

  return (
    <div className="configure-chart-preview" data-preview-chart-id={chartKey} aria-hidden="true" title="Small preview of this chart style using imported data when available.">
      {chartKey === 'commitmentSummary' ? (
        <ResponsiveContainer {...previewContainerProps}>
          <ComposedChart data={quarters} margin={previewMargin}>
            <CartesianGrid stroke="#ede8dd" vertical={false} />
            <XAxis dataKey="label" hide />
            <YAxis hide />
            <Bar dataKey="unfundedCommitments" fill={colors.lightBlue} isAnimationActive={false} />
            <Line dataKey="commitments" stroke={colors.orange} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : null}

      {chartKey === 'totalValue' ? (
        <ResponsiveContainer {...previewContainerProps}>
          <ComposedChart data={quarters} margin={previewMargin}>
            <CartesianGrid stroke="#ede8dd" vertical={false} />
            <XAxis dataKey="label" hide />
            <YAxis hide />
            <Bar dataKey="capitalAccountBalance" stackId="value" fill={colors.blue} isAnimationActive={false} />
            <Bar dataKey="distributions" stackId="value" fill={colors.green} isAnimationActive={false} />
            <Scatter dataKey="totalValue" fill={colors.orange} line shape="circle" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : null}

      {chartKey === 'cashFlowSummary' ? (
        <ResponsiveContainer {...previewContainerProps}>
          <AreaChart data={quarters} margin={previewMargin}>
            <CartesianGrid stroke="#ede8dd" vertical={false} />
            <XAxis dataKey="label" hide />
            <YAxis hide />
            <Area dataKey="contributions" fill={colors.purple} stroke={colors.purple} fillOpacity={0.52} isAnimationActive={false} />
            <Area dataKey="distributions" fill={colors.green} stroke={colors.green} fillOpacity={0.38} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : null}

      {chartKey === 'ratioAnalysis' ? (
        <ResponsiveContainer {...previewContainerProps}>
          <AreaChart data={quarters} margin={previewMargin}>
            <CartesianGrid stroke="#ede8dd" vertical={false} />
            <XAxis dataKey="label" hide />
            <YAxis hide />
            <Area dataKey="tvpi" fill={colors.gold} stroke={colors.gold} fillOpacity={0.58} isAnimationActive={false} />
            <Area dataKey="dpi" fill={colors.teal} stroke={colors.teal} fillOpacity={0.28} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : null}

      {chartKey === 'capitalAtWork' ? (
        <ResponsiveContainer {...previewContainerProps}>
          <LineChart data={quarters} margin={previewMargin}>
            <CartesianGrid stroke="#ede8dd" vertical={false} />
            <XAxis dataKey="label" hide />
            <YAxis hide />
            <Line dataKey="capitalAtWork" stroke={colors.gray} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="commitments" stroke={colors.orange} strokeWidth={2} strokeDasharray="6 5" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : null}

      {chartKey === 'ltdCommitmentSummaryBar' ? (
        <PreviewHorizontalBars
          data={programs}
          keys={[
            ['ltdCash', colors.lavender],
            ['ltdDeemed', colors.green],
            ['ltdUnfunded', colors.gold],
          ]}
          totalKey="ltdCommitment"
        />
      ) : null}

      {chartKey === 'ltdCommitmentSummaryPie' ? (
        <PreviewNestedPie
          model={livePieOrSample(bundle?.pies.ltdCommitment, [
            ['Cash Commitment', 'ltdCash'],
            ['Deemed Commitment', 'ltdDeemed'],
            ['Unfunded Commitment', 'ltdUnfunded'],
          ])}
        />
      ) : null}

      {chartKey === 'totalValueByProgramBar' ? (
        <PreviewHorizontalBars
          data={programs}
          keys={[
            ['investmentValue', colors.purple],
            ['investmentDistributed', colors.teal],
            ['carriedInterestDistributed', colors.gold],
            ['carriedInterestBalance', colors.lavender],
            ['transferOfInterest', colors.orange],
          ]}
          totalKey="totalValue"
        />
      ) : null}

      {chartKey === 'totalValueByProgramPie' ? (
        <PreviewNestedPie
          model={livePieOrSample(bundle?.pies.totalValue, [
            ['Investment Value', 'investmentValue'],
            ['Investment Distributed', 'investmentDistributed'],
            ['Carried Interest Distributed', 'carriedInterestDistributed'],
            ['Carried Interest Balance', 'carriedInterestBalance'],
            ['Transfer of Interest', 'transferOfInterest'],
          ])}
        />
      ) : null}

      {chartKey === 'carriedInterestByProgramBar' ? (
        <PreviewHorizontalBars
          data={programs}
          keys={[
            ['carryRealizedDistributed', colors.green],
            ['carryRealizedUndistributed', colors.gold],
            ['carryUnrealizedGain', colors.purple],
            ['carryTransfer', colors.teal],
          ]}
          totalKey="totalCarriedInterest"
        />
      ) : null}

      {chartKey === 'carriedInterestByProgramPie' ? (
        <PreviewNestedPie
          model={livePieOrSample(bundle?.pies.carriedInterest, [
            ['Realized - Distributed', 'carryRealizedDistributed'],
            ['Realized - Undistributed', 'carryRealizedUndistributed'],
            ['Unrealized Gain', 'carryUnrealizedGain'],
            ['Carry Transfer', 'carryTransfer'],
          ])}
        />
      ) : null}

      {chartKey === 'cashFlowByPeriod' ? (
        <ResponsiveContainer {...previewContainerProps}>
          <ComposedChart data={years} margin={previewMargin}>
            <CartesianGrid stroke="#ede8dd" vertical={false} />
            <XAxis dataKey="label" hide />
            <YAxis hide domain={symmetricDomain(years.flatMap((point) => [point.contributions, point.distributions, point.netCash]))} />
            <ReferenceLine y={0} stroke="#8d938f" />
            <Bar dataKey="distributions" fill={colors.navy} isAnimationActive={false} />
            <Bar dataKey="contributions" fill={colors.lightBlue} isAnimationActive={false} />
            <Line dataKey="netCash" stroke={colors.gold} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

function PreviewHorizontalBars({
  data,
  keys,
  totalKey,
}: {
  data: ProgramPoint[];
  keys: Array<[keyof ProgramPoint, string]>;
  totalKey: keyof ProgramPoint;
}) {
  return (
    <ResponsiveContainer {...previewContainerProps}>
      <BarChart data={data} layout="vertical" margin={previewMargin} barCategoryGap="24%">
        <CartesianGrid stroke="#ede8dd" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="programName" hide />
        {keys.map(([key, color]) => (
          <Bar key={String(key)} dataKey={String(key)} stackId="program" fill={color} isAnimationActive={false} />
        ))}
        <Line dataKey={String(totalKey)} stroke={colors.navy} strokeWidth={2} dot={false} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PreviewNestedPie({ model }: { model: PieModel }) {
  if (model.suppressed) {
    return <EmptyState title="Pie suppressed" detail={model.reason ?? 'Negative values cannot be represented truthfully as wedges.'} />;
  }

  if (!model.inner.length && !model.outer.length) {
    return <EmptyState title="No pie values" detail="No non-zero program segments are available." />;
  }

  return (
    <ResponsiveContainer {...previewContainerProps}>
      <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Pie data={model.inner} dataKey="value" nameKey="name" outerRadius={44} paddingAngle={1} isAnimationActive={false}>
          {model.inner.map((entry, index) => (
            <Cell key={entry.name} fill={piePalette[index % piePalette.length]} stroke="#fffefb" strokeWidth={1.25} />
          ))}
        </Pie>
        <Pie data={model.outer} dataKey="value" nameKey="name" innerRadius={52} outerRadius={66} paddingAngle={1} isAnimationActive={false}>
          {model.outer.map((entry, index) => (
            <Cell key={`${entry.category}-${entry.name}`} fill={piePalette[(index + 3) % piePalette.length]} stroke="#fffefb" strokeWidth={1.25} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function livePieOrSample(model: PieModel | undefined, fields: Array<[name: string, key: keyof ProgramPoint]>): PieModel {
  if (model?.suppressed || model?.inner.length || model?.outer.length) return model;
  return buildPreviewPie(sampleProgramSeries, fields);
}

function buildPreviewPie(programs: ProgramPoint[], fields: Array<[name: string, key: keyof ProgramPoint]>): PieModel {
  const values = programs.flatMap((program) =>
    fields.map(([name, key]) => ({
      name,
      program: program.programName,
      signedValue: Number(program[key] ?? 0),
    })),
  );
  const inner = fields
    .map(([name]) => {
      const signedValue = values.filter((value) => value.name === name).reduce((sum, value) => sum + value.signedValue, 0);
      return { name, signedValue, value: Math.abs(signedValue), tooltipMetricKey: name, rowCount: programs.reduce((sum, program) => sum + program.rowCount, 0), tooltipMetrics: {} };
    })
    .filter((value) => value.value !== 0);
  const outer = values
    .filter((value) => value.signedValue !== 0)
    .map((value) => ({
      name: value.program,
      category: value.name,
      signedValue: value.signedValue,
      value: Math.abs(value.signedValue),
      tooltipMetricKey: value.name,
      rowCount: programs.find((program) => program.programName === value.program)?.rowCount ?? 0,
      tooltipMetrics: {},
    }));
  return { suppressed: false, reason: null, inner, outer };
}

function symmetricDomain(values: number[]): [number, number] {
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  return [-max, max];
}
