import { useMemo, useState } from 'react';

export type FunctionPaletteEntry = {
  name: string;
  signature: string;
  description: string;
  category: string;
  example: string;
};

/**
 * A compact, type-to-filter inserter for the formula vocabulary. Replaces the
 * old always-on "Function guide" wall: each function is one dense row (signature
 * + one-line description), grouped by category. Clicking a row — or pressing
 * Enter in the filter — splices the function's template at the editor caret. The
 * active function's full signature and example live in a single sticky footer,
 * so the example exists once instead of being multiplied across every row.
 */
export function FunctionPalette({
  functions,
  activeFunction,
  onPick,
}: {
  functions: ReadonlyArray<FunctionPaletteEntry>;
  activeFunction: string | null;
  onPick: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      functions.filter((fn) =>
        !needle ||
        fn.name.toLowerCase().includes(needle) ||
        fn.signature.toLowerCase().includes(needle) ||
        fn.description.toLowerCase().includes(needle) ||
        fn.category.toLowerCase().includes(needle),
      ),
    [functions, needle],
  );

  const categories = useMemo(() => Array.from(new Set(filtered.map((fn) => fn.category))), [filtered]);
  const activeHelp = functions.find((fn) => fn.name === activeFunction);

  return (
    <div className="fn-palette">
      <input
        className="fn-palette__search"
        type="text"
        value={query}
        spellCheck={false}
        placeholder="Filter functions…"
        aria-label="Filter functions"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && filtered.length) {
            event.preventDefault();
            onPick(filtered[0].name);
          }
        }}
      />

      <div className="fn-palette__list">
        {categories.map((category) => (
          <div className="fn-palette__group" key={category}>
            <span className="fn-palette__cat">{category}</span>
            {filtered
              .filter((fn) => fn.category === category)
              .map((fn) => (
                <button
                  key={fn.name}
                  type="button"
                  className={`fn-palette__row${activeFunction === fn.name ? ' is-active' : ''}`}
                  onClick={() => onPick(fn.name)}
                  title={`Insert ${fn.signature} — ${fn.description} e.g. ${fn.example}`}
                >
                  <code>{fn.signature}</code>
                  <span>{fn.description}</span>
                </button>
              ))}
          </div>
        ))}
        {!filtered.length ? (
          <p className="fn-palette__empty">No functions match “{query.trim()}”.</p>
        ) : null}
      </div>

      <div className="fn-palette__help">
        {activeHelp ? (
          <>
            <code>{activeHelp.signature}</code>
            <span>e.g. {activeHelp.example}</span>
          </>
        ) : (
          <span>Pick a function to drop it at the cursor.</span>
        )}
      </div>
    </div>
  );
}
