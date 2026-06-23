import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { VISUAL_NAMES } from '../../data/defaultLogic';
import { activationStatusClass } from '../../data/fieldActivation';
import type { FormulaRegistry } from '../../types';
import { validateFormula } from '../../utils/formula';
import { diffFormula } from '../../utils/formulaDiff';
import { FieldReferenceChips } from '../FieldReferenceChips';
import { Button } from '../common';
import { FunctionPalette } from './FunctionPalette';

// The supported formula vocabulary (mirrors utils/formula.ts evalCall). Each
// entry powers the insert palette and splices a ready-to-fill template.
const FORMULA_FUNCTIONS = [
  { name: 'SUM', signature: 'SUM("Field")', template: 'SUM("")', description: 'Signed total of a numeric field across the bucket.', category: 'Aggregate', example: 'SUM("Total Distributions")' },
  { name: 'ABS_SUM', signature: 'ABS_SUM("Field")', template: 'ABS_SUM("")', description: 'Sum of absolute row values for a field.', category: 'Aggregate', example: 'ABS_SUM("Carry Paid")' },
  { name: 'NEG_SUM', signature: 'NEG_SUM("Field")', template: 'NEG_SUM("")', description: 'Negated sum — flips a stored-negative field positive.', category: 'Aggregate', example: 'NEG_SUM("Investments Value")' },
  { name: 'METRIC', signature: 'METRIC("Name")', template: 'METRIC("")', description: 'Reuse another metric in this same visual.', category: 'Reference', example: 'METRIC("Distributions")' },
  { name: 'CUMULATIVE', signature: 'CUMULATIVE("Name")', template: 'CUMULATIVE("")', description: 'A metric evaluated from inception through this period.', category: 'Reference', example: 'CUMULATIVE("Capital At Work")' },
  { name: 'SAFE_DIVIDE', signature: 'SAFE_DIVIDE(a, b, fallback)', template: 'SAFE_DIVIDE(, , 0)', description: 'Divide with a fallback when the denominator is ~0.', category: 'Math', example: 'SAFE_DIVIDE(SUM("Total Distributions"), 1, 0)' },
  { name: 'ROUND', signature: 'ROUND(value, places)', template: 'ROUND(, 2)', description: 'Round to a whole number of decimal places (0–6).', category: 'Math', example: 'ROUND(METRIC("TVPI"), 2)' },
  { name: 'ABS', signature: 'ABS(value)', template: 'ABS()', description: 'Absolute value.', category: 'Math', example: 'ABS(METRIC("Net Cash"))' },
  { name: 'NEG', signature: 'NEG(value)', template: 'NEG()', description: 'Negate a value.', category: 'Math', example: 'NEG(SUM("Carry Realized"))' },
  { name: 'MAX', signature: 'MAX(a, b, …)', template: 'MAX(, 0)', description: 'Largest of its arguments.', category: 'Math', example: 'MAX(METRIC("Capital At Work"), 0)' },
  { name: 'MIN', signature: 'MIN(a, b, …)', template: 'MIN(, 0)', description: 'Smallest of its arguments.', category: 'Math', example: 'MIN(SUM("Total Contributions"), 0)' },
  { name: 'IF', signature: 'IF(condition, then, else)', template: 'IF( > 0, , )', description: 'Branch on a comparison.', category: 'Logic', example: 'IF(METRIC("Commitments") > 0, 1, 0)' },
] as const;

// macOS uses ⌘; everything else uses Ctrl. Computed once — purely for the hint.
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl';

// The container width at which the panel stops being a tall column (sidebar) and
// becomes an editor + segmented right-rail (footer dock). Mirrors the @container
// breakpoint in workbench.css.
const WIDE_AT = 560;

type RefId = 'compare' | 'fields' | 'insert';

export type LogicPanelProps = {
  formulas: FormulaRegistry;
  /** The metric whose formula is shown; null falls back to the first metric. */
  selectedMetricId: string | null;
  onSelectMetric: (metricId: string) => void;
  /** Commit a draft formula for a metric — charts recompute through it. */
  onApplyDraft: (metricId: string, draftFormula: string) => void;
  /** Restore one metric to its production formula. */
  onResetMetric: (metricId: string) => void;
  /** Restore every metric to production. */
  onResetAll: () => void;
};

/**
 * The logic editor as docked content — "one line, one truth". At rest the panel
 * is a single calm editing surface: a breadcrumb (visual ▸ metric), the formula,
 * and one adaptive status line. Production reference, the production-vs-draft
 * diff, field semantics, and the function library are all real but tucked behind
 * three quiet disclosures, so nothing competes with the formula you are editing.
 *
 * Apply is contextual (it appears only when a valid change exists), and every
 * "nothing happened" state renders as absence rather than a chip announcing its
 * own emptiness. Charts/KPIs/tooltips recompute live against the applied draft;
 * scenario classification stays raw-ledger-sign based, so labels do not move.
 * Production formulas are never mutated; Reset returns a metric to production.
 *
 * The same markup reflows by container width: a tall narrow column in the right
 * sidebar, an editor + segmented right-rail in the short wide footer dock.
 */
export function LogicPanel({
  formulas,
  selectedMetricId,
  onSelectMetric,
  onApplyDraft,
  onResetMetric,
  onResetAll,
}: LogicPanelProps) {
  const metricList = useMemo(() => Object.values(formulas), [formulas]);
  const metric = (selectedMetricId && formulas[selectedMetricId]) || metricList[0] || null;
  const metricId = metric?.id ?? null;
  const applied = metric?.draftFormula ?? '';

  const metricsForVisual = useMemo(
    () => (metric ? metricList.filter((item) => item.visualId === metric.visualId) : []),
    [metricList, metric],
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeFunction, setActiveFunction] = useState<string | null>(null);
  const [draftText, setDraftText] = useState(applied);
  const [openRef, setOpenRef] = useState<RefId | null>(null);
  const [isWide, setIsWide] = useState(false);

  // Track our own width so we can default the footer's right-rail to a populated
  // panel while leaving the sidebar calm (nothing expanded) at rest.
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const measure = () => setIsWide(node.getBoundingClientRect().width >= WIDE_AT);
    measure(); // synchronous initial read, so the default holds even if RO never fires
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Reconcile the editor with the selected metric's applied formula when the
  // selection changes — or when that applied formula changes from outside (Apply,
  // Reset, Reset all). React's "adjust state during render" pattern, so there is
  // no setState-in-effect. Typing never resets: applied is unchanged mid-edit.
  const syncKey = `${metricId ?? ''} ${applied}`;
  const [lastSyncKey, setLastSyncKey] = useState(syncKey);
  if (syncKey !== lastSyncKey) {
    setLastSyncKey(syncKey);
    setDraftText(applied);
  }

  const anyDraftActive = useMemo(
    () => metricList.some((item) => item.draftFormula !== item.productionFormula),
    [metricList],
  );

  if (!metric || !metricId) {
    return <div className="logic-panel logic-panel--empty">No metrics available to edit.</div>;
  }

  const validation = validateFormula(draftText, formulas, metric.visualId, metric.id);
  const diff = diffFormula(metric.productionFormula, draftText);
  const dirty = draftText !== applied;
  const appliedDiffersFromProd = applied !== metric.productionFormula;
  const localDiffersFromProd = draftText !== metric.productionFormula;
  const canApply = dirty && validation.ok;
  const canReset = appliedDiffersFromProd || localDiffersFromProd;
  const parseClass = !validation.ok ? 'invalid' : validation.warnings.length ? 'warning' : 'valid';

  // Which disclosure's content is showing. The sidebar rests closed; the wide
  // footer defaults its rail to Fields so the space beside the editor is used.
  const effectiveOpen: RefId | null = openRef ?? (isWide ? 'fields' : null);

  const toggleRef = (id: RefId) =>
    setOpenRef((prev) => {
      const current = prev ?? (isWide ? 'fields' : null);
      if (!isWide && current === id) return null; // a second tap collapses in the sidebar
      return id;
    });

  const fieldCount = validation.fieldReferences.length;
  const fieldNoun = fieldCount === 1 ? 'field' : 'fields';
  const allCurrent =
    fieldCount > 0 && validation.fieldReferences.every((field) => activationStatusClass(field.status) === 'current');

  const selectVisual = (visualId: string) => {
    const first = metricList.find((item) => item.visualId === visualId);
    if (first) onSelectMetric(first.id);
  };

  const insertFunction = (name: string) => {
    setActiveFunction(name);
    const fn = FORMULA_FUNCTIONS.find((item) => item.name === name);
    if (!fn) return;
    const textarea = editorRef.current;
    const snippet = fn.template;
    if (!textarea) {
      setDraftText((text) => `${text}${text && !text.endsWith(' ') ? ' ' : ''}${snippet}`);
      return;
    }
    const start = textarea.selectionStart ?? draftText.length;
    const end = textarea.selectionEnd ?? draftText.length;
    const next = draftText.slice(0, start) + snippet + draftText.slice(end);
    setDraftText(next);
    // Drop the caret just inside the inserted call so the user can type the argument.
    const caret = start + snippet.indexOf('(') + 1;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  };

  const apply = () => {
    if (canApply) onApplyDraft(metric.id, draftText);
  };

  const resetToProduction = () => {
    onResetMetric(metric.id);
    setDraftText(metric.productionFormula);
  };

  const onEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      apply();
    } else if (event.key === 'Escape' && dirty) {
      event.preventDefault();
      setDraftText(applied);
    }
  };

  const statusLine = (() => {
    if (!validation.ok) {
      const extra = validation.errors.length - 1;
      return { tone: 'bad', text: `${validation.errors[0] ?? 'Invalid formula.'}${extra > 0 ? ` · +${extra} more` : ''}` };
    }
    if (validation.warnings.length) {
      const extra = validation.warnings.length - 1;
      return { tone: 'warn', text: `${validation.warnings[0]}${extra > 0 ? ` · +${extra} more` : ''}` };
    }
    if (dirty) {
      return { tone: 'good', text: `${fieldCount} ${fieldNoun} ready · ${MOD_LABEL}↵ to apply` };
    }
    if (!fieldCount) return { tone: 'muted', text: 'No fields referenced' };
    return { tone: 'muted', text: `${fieldCount} ${fieldNoun} referenced${allCurrent ? ' · all current' : ''}` };
  })();

  const refPanel = (() => {
    if (effectiveOpen === 'compare') {
      if (!diff.hasChanges) {
        return (
          <>
            <p className="lp-note">Draft matches production — charts stay the same.</p>
            <code className="lp-prod">{metric.productionFormula}</code>
          </>
        );
      }
      return (
        <>
          <p className="lp-impact">{diff.impactSummary}</p>
          <div className="lp-tokens">
            <span className="lp-tokens__label">Production</span>
            <code>
              {diff.productionTokens.map((token, index) => (
                <span className={`formula-token ${token.status}`} key={`p-${token.normalized}-${index}`}>
                  {token.value}
                </span>
              ))}
            </code>
          </div>
          <div className="lp-tokens">
            <span className="lp-tokens__label">Draft</span>
            <code>
              {diff.draftTokens.map((token, index) => (
                <span className={`formula-token ${token.status}`} key={`d-${token.normalized}-${index}`}>
                  {token.value}
                </span>
              ))}
            </code>
          </div>
        </>
      );
    }
    if (effectiveOpen === 'fields') {
      return (
        <>
          <FieldReferenceChips fields={validation.fieldReferences} emptyText="This formula references no fields." />
          {validation.warnings.length ? (
            <ul className="lp-warnlist">
              {validation.warnings.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </>
      );
    }
    if (effectiveOpen === 'insert') {
      return <FunctionPalette functions={FORMULA_FUNCTIONS} activeFunction={activeFunction} onPick={insertFunction} />;
    }
    return null;
  })();

  return (
    <div className="logic-panel" ref={rootRef}>
      <header className="lp-head">
        <div className="lp-sig" aria-hidden="true">Σ</div>
        <div className="lp-titles">
          <span className="lp-pick lp-pick--metric">
            {appliedDiffersFromProd ? <span className="lp-dot lp-dot--accent" aria-hidden="true" /> : null}
            <select value={metric.id} aria-label="Metric" onChange={(event) => onSelectMetric(event.target.value)}>
              {metricsForVisual.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.metricName}{item.draftFormula !== item.productionFormula ? ' •' : ''}
                </option>
              ))}
            </select>
          </span>
          <span className="lp-sub">
            <span className="lp-sub__in">in</span>
            <span className="lp-pick lp-pick--visual">
              <select value={metric.visualId} aria-label="Visual" onChange={(event) => selectVisual(event.target.value)}>
                {VISUAL_NAMES.map((visual) => (
                  <option key={visual.id} value={visual.id}>{visual.name}</option>
                ))}
              </select>
            </span>
          </span>
        </div>
        <div className="lp-head__status">
          <span
            className="lp-statpill"
            data-tone={anyDraftActive ? 'draft' : 'prod'}
            title={anyDraftActive ? 'Charts are showing draft logic.' : 'Charts are on production logic.'}
          >
            <span className="lp-dot" data-tone={anyDraftActive ? 'accent' : 'good'} aria-hidden="true" />
            {anyDraftActive ? 'Draft' : 'Production'}
          </span>
          {anyDraftActive ? (
            <button className="lp-resetall" type="button" onClick={onResetAll} title="Restore every metric to its production formula.">
              Reset all
            </button>
          ) : null}
        </div>
      </header>

      <div className="lp-layout">
        <div className="lp-edit">
          <div className="lp-editor" data-validity={parseClass}>
            <textarea
              id="logic-panel-editor"
              ref={editorRef}
              className="lp-editor__field"
              value={draftText}
              spellCheck={false}
              onChange={(event) => setDraftText(event.target.value)}
              onKeyDown={onEditorKeyDown}
              placeholder={'e.g. SUM("Total Distributions")'}
              aria-label={`Formula for ${metric.metricName}`}
            />
          </div>

          <div className="lp-actionrow">
            <p className="lp-statusline" data-tone={statusLine.tone}>
              {statusLine.tone !== 'muted' ? <span className="lp-dot" data-tone={statusLine.tone} aria-hidden="true" /> : null}
              <span>{statusLine.text}</span>
            </p>
            <div className="lp-actionrow__btns">
              {canApply ? (
                <Button variant="primary" className="lp-apply__btn" onClick={apply} title="Recompute the charts with this draft formula.">
                  Apply <kbd className="lp-kbd">{MOD_LABEL}↵</kbd>
                </Button>
              ) : null}
              {canReset ? (
                <Button variant="text" onClick={resetToProduction} title="Restore this metric to its production formula.">
                  Reset to production
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="lp-refs">
          <div className="lp-segments" role="tablist" aria-label="Formula details">
            <button
              type="button"
              role="tab"
              aria-selected={effectiveOpen === 'compare'}
              className="lp-seg"
              data-active={effectiveOpen === 'compare'}
              onClick={() => toggleRef('compare')}
              title="Compare the draft with the production formula."
            >
              Compare{diff.hasChanges ? <span className="lp-dot lp-dot--accent" aria-hidden="true" /> : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={effectiveOpen === 'fields'}
              className="lp-seg"
              data-active={effectiveOpen === 'fields'}
              onClick={() => toggleRef('fields')}
              title="The BI fields this formula references."
            >
              Fields{validation.warnings.length ? <span className="lp-dot lp-dot--warn" aria-hidden="true" /> : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={effectiveOpen === 'insert'}
              className="lp-seg"
              data-active={effectiveOpen === 'insert'}
              onClick={() => toggleRef('insert')}
              title="Insert a supported function at the cursor."
            >
              Insert function
            </button>
          </div>
          {refPanel ? (
            <div className="lp-panel" data-ref={effectiveOpen}>
              {refPanel}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
