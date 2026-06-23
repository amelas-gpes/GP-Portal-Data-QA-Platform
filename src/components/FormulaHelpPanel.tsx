import { Plus } from 'lucide-react';

type FormulaFunctionHelp = {
  name: string;
  signature: string;
  description: string;
  category: string;
  example: string;
};

export function FormulaHelpPanel({
  functions,
  activeFunction,
  onInsert,
}: {
  functions: ReadonlyArray<FormulaFunctionHelp>;
  activeFunction: string | null;
  onInsert: (name: string) => void;
}) {
  const categories = Array.from(new Set(functions.map((fn) => fn.category)));
  const activeFunctionHelp = functions.find((fn) => fn.name === activeFunction);

  return (
    <div className="formula-help-panel" title="Formula function reference.">
      <div className="formula-help-header">
        <div>
          <strong>Function guide</strong>
          <span>{activeFunctionHelp ? activeFunctionHelp.description : 'Insert a supported function template into the editor.'}</span>
        </div>
        {activeFunctionHelp ? <code>{activeFunctionHelp.signature}</code> : null}
      </div>
      {categories.map((category) => (
        <div className="formula-help-group" key={category}>
          <strong>{category}</strong>
          <div className="formula-help-list">
            {functions
              .filter((fn) => fn.category === category)
              .map((fn) => (
                <button
                  key={fn.name}
                  type="button"
                  className={activeFunction === fn.name ? 'active' : ''}
                  onClick={() => onInsert(fn.name)}
                  title={`Insert ${fn.signature}. ${fn.description}`}
                >
                  <span className="formula-help-function-row">
                    <code>{fn.signature}</code>
                    <span className="formula-help-insert"><Plus size={12} /> Insert</span>
                  </span>
                  <span>{fn.description}</span>
                  <small>{fn.example}</small>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
