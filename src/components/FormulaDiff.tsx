import { useMemo } from 'react';
import { diffFormula, type FormulaDiffResult, type FormulaDiffToken } from '../utils/formulaDiff';
import { Pill } from './common';

export function FormulaDiff({
  productionFormula,
  draftFormula,
  className = '',
}: {
  productionFormula: string;
  draftFormula: string;
  className?: string;
}) {
  const diff = useMemo(() => diffFormula(productionFormula, draftFormula), [productionFormula, draftFormula]);
  const statusTitle = diff.hasChanges
    ? `${diff.tokenChangeCount} production-vs-draft token changes detected.`
    : 'Draft formula matches the production formula.';

  return (
    <section className={`formula-diff ${className}`.trim()} title="Read-only production-vs-draft formula diff. This panel does not change chart calculations.">
      <div className="formula-diff-header">
        <div>
          <span className="eyebrow">Formula diff</span>
          <h3>Production vs draft</h3>
        </div>
        <Pill tone={diff.hasChanges ? 'warn' : 'good'} title={statusTitle}>{diff.hasChanges ? `${diff.tokenChangeCount} token changes` : 'No changes'}</Pill>
      </div>

      <p className="formula-diff-impact">{diff.impactSummary}</p>

      <div className="formula-diff-token-grid" aria-label="Changed formula tokens">
        <FormulaTokenLine label="Production tokens" tokens={diff.productionTokens} />
        <FormulaTokenLine label="Draft tokens" tokens={diff.draftTokens} />
      </div>

      <FormulaDiffFacts diff={diff} />
    </section>
  );
}

function FormulaTokenLine({ label, tokens }: { label: string; tokens: FormulaDiffToken[] }) {
  return (
    <div className="formula-diff-token-line">
      <label>{label}</label>
      <code>
        {tokens.length ? tokens.map((token, index) => (
          <span className={`formula-token ${token.status}`} key={`${label}-${token.normalized}-${index}`}>
            {token.value}
          </span>
        )) : <span className="formula-token unchanged">Empty formula</span>}
      </code>
    </div>
  );
}

function FormulaDiffFacts({ diff }: { diff: FormulaDiffResult }) {
  return (
    <div className="formula-diff-facts">
      <FormulaFactGroup
        label="Fields"
        emptyLabel="No field changes"
        added={diff.addedFields}
        removed={diff.removedFields}
      />
      <div className="formula-fact-group">
        <strong>Functions</strong>
        <div className="formula-fact-list">
          {diff.changedFunctions.length ? diff.changedFunctions.map((change) => (
            <span className={`formula-fact-chip ${change.status}`} key={change.name} title={`${change.name}: production ${change.productionCount}, draft ${change.draftCount}`}>
              {change.label}
            </span>
          )) : <span className="formula-fact-chip neutral">No function changes</span>}
        </div>
      </div>
    </div>
  );
}

function FormulaFactGroup({
  label,
  emptyLabel,
  added,
  removed,
}: {
  label: string;
  emptyLabel: string;
  added: string[];
  removed: string[];
}) {
  return (
    <div className="formula-fact-group">
      <strong>{label}</strong>
      <div className="formula-fact-list">
        {added.map((field) => <span className="formula-fact-chip added" key={`added-${field}`}>Added {field}</span>)}
        {removed.map((field) => <span className="formula-fact-chip removed" key={`removed-${field}`}>Removed {field}</span>)}
        {!added.length && !removed.length ? <span className="formula-fact-chip neutral">{emptyLabel}</span> : null}
      </div>
    </div>
  );
}
