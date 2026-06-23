import { activationStatusClass } from '../data/fieldActivation';
import type { FormulaFieldReference } from '../types';

export function FieldReferenceChips({
  fields,
  emptyText = 'No field references',
}: {
  fields: FormulaFieldReference[];
  emptyText?: string;
}) {
  if (!fields.length) return <span className="field-reference-empty">{emptyText}</span>;
  return (
    <div className="field-reference-chips" aria-label="Referenced BI fields">
      {fields.map((field) => {
        const statusClass = activationStatusClass(field.status);
        const calculationLabel = field.canCalculate ? 'Numeric' : 'Non-numeric';
        const title = `${field.header}: ${field.detail} ${calculationLabel}.`;
        return (
          <span
            className={`field-reference-chip ${statusClass} ${field.canCalculate ? 'numeric' : 'non-numeric'}`}
            key={`${field.header}-${field.status}`}
            title={title}
          >
            <span className="field-status-dot" aria-hidden="true" />
            <span>{field.header}</span>
            <strong>{field.statusLabel}</strong>
            <em>{calculationLabel}</em>
          </span>
        );
      })}
    </div>
  );
}
