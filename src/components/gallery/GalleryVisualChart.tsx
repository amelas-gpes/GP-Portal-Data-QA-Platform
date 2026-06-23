import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart,
  ResponsiveContainer, Scatter, XAxis, YAxis,
} from 'recharts';
import type { QuarterPoint } from '../../types';
import { chartColors as colors } from '../../utils/chartTheme';
import { formatCurrency, formatRatio } from '../../utils/format';

// Chrome-free renditions of the five LP visuals for the Scenario Gallery — same
// chart types, dataKeys, and palette as LPCharts in components/Charts.tsx (the
// source of truth). Kept light on purpose: no tooltips, no hover-sync, no card
// shell. If a visual's series changes there, mirror it here.

const currencyAxis = (value: number) => formatCurrency(value);
const ratioAxis = (value: number) => formatRatio(value);
const gridStroke = '#EEE9DE';
const axisTick = { fontSize: 10 } as const;

type Props = {
  chartId: string;
  data: QuarterPoint[];
  height?: number;
  /** Larger ticks / legend for the expanded view. */
  large?: boolean;
};

export function GalleryVisualChart({ chartId, data, height = 168, large = false }: Props) {
  const tick = large ? { fontSize: 11 } : axisTick;
  const legend = large ? undefined : { fontSize: 11 };
  const legendProps = legend ? { wrapperStyle: legend } : {};

  if (chartId === 'commitmentSummary') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="label" tick={tick} minTickGap={26} />
          <YAxis tickFormatter={currencyAxis} tick={tick} width={48} />
          <Legend {...legendProps} />
          <Bar isAnimationActive={false} dataKey="unfundedCommitments" name="Unfunded Commitments" fill={colors.lightBlue} />
          <Line isAnimationActive={false} dataKey="commitments" name="Commitments" stroke={colors.orange} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }
  if (chartId === 'totalValue') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="label" tick={tick} minTickGap={26} />
          <YAxis tickFormatter={currencyAxis} tick={tick} width={48} />
          <Legend {...legendProps} />
          <Bar isAnimationActive={false} dataKey="capitalAccountBalance" name="Capital Account Balance" stackId="value" fill={colors.blue} />
          <Bar isAnimationActive={false} dataKey="distributions" name="Distributions" stackId="value" fill={colors.green} />
          <Scatter isAnimationActive={false} dataKey="totalValue" name="Total Value" fill={colors.orange} line shape="circle" />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }
  if (chartId === 'cashFlowSummary') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="label" tick={tick} minTickGap={26} />
          <YAxis tickFormatter={currencyAxis} tick={tick} width={48} />
          <Legend {...legendProps} />
          <Area isAnimationActive={false} dataKey="contributions" name="Contributions" fill={colors.purple} stroke={colors.purple} fillOpacity={0.55} />
          <Area isAnimationActive={false} dataKey="distributions" name="Distributions" fill={colors.green} stroke={colors.green} fillOpacity={0.45} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  if (chartId === 'ratioAnalysis') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="label" tick={tick} minTickGap={26} />
          <YAxis tickFormatter={ratioAxis} tick={tick} width={40} />
          <Legend {...legendProps} />
          <Area isAnimationActive={false} dataKey="tvpi" name="TVPI" fill={colors.gold} stroke={colors.gold} fillOpacity={0.65} />
          <Area isAnimationActive={false} dataKey="dpi" name="DPI" fill={colors.teal} stroke={colors.teal} fillOpacity={0.3} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  // capitalAtWork
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis dataKey="label" tick={tick} minTickGap={26} />
        <YAxis tickFormatter={currencyAxis} tick={tick} width={48} />
        <Legend {...legendProps} />
        <Line isAnimationActive={false} dataKey="capitalAtWork" name="Capital At Work" stroke={colors.gray} strokeWidth={2} dot={false} />
        <Line isAnimationActive={false} dataKey="commitments" name="Commitments" stroke={colors.orange} strokeWidth={2} strokeDasharray="6 5" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
