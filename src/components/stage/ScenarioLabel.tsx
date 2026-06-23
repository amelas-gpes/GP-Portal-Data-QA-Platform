// Scenario labels are sign sentences like "Contribution - / Distribution +".
// These renderers tint just the sign glyphs so a pattern is readable at a glance
// without shouting: + (cash returned) in sage, - (capital paid in) in terracotta,
// 0 muted. Shared by the investor profile and the scenario directory.

const SIGN_TONE: Record<string, 'pos' | 'neg' | 'zero'> = { '+': 'pos', '-': 'neg', '0': 'zero' };

/** Prettier minus; leave + and 0 as-is. */
function glyph(sign: string): string {
  return sign === '-' ? '−' : sign;
}

function Sign({ sign }: { sign: string }) {
  return (
    <span className="scn-sign" data-sign={SIGN_TONE[sign] ?? 'zero'}>
      {glyph(sign)}
    </span>
  );
}

/** A full label with its metric words quiet and its signs tinted. */
export function ScenarioLabel({ label, className }: { label: string; className?: string }) {
  const tokens = label.split(' ');
  return (
    <span className={className ? `scn-label ${className}` : 'scn-label'}>
      {tokens.map((token, index) => {
        if (token in SIGN_TONE) return <Sign key={index} sign={token} />;
        if (token === '/') return <span key={index} className="scn-label__sep" aria-hidden="true">/</span>;
        return <span key={index} className="scn-label__word">{token}</span>;
      })}
    </span>
  );
}

/** Just the tinted signs — a compact fingerprint of a scenario. */
export function SignSignature({ signs, className }: { signs: readonly string[]; className?: string }) {
  return (
    <span className={className ? `scn-sig ${className}` : 'scn-sig'} aria-hidden="true">
      {signs.map((sign, index) => <Sign key={index} sign={sign} />)}
    </span>
  );
}
