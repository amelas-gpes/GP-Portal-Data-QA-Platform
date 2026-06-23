/**
 * Tier vocabulary, shared by every pill, tooltip, and section label so the
 * words never drift between surfaces: critical = "Blocking" (don't approve
 * until resolved), warning = "Check" (verify before approving).
 *
 * Lives in its own module (not common.tsx) so the component file exports only
 * components and React Fast Refresh keeps working.
 */
export function tierNoun(tier: 'critical' | 'warning', count: number): string {
  if (tier === 'critical') return count === 1 ? 'blocking issue' : 'blocking issues';
  return count === 1 ? 'item to check' : 'items to check';
}

export function tierHelp(tier: 'critical' | 'warning'): string {
  return tier === 'critical'
    ? 'Blocking: a high-impact rule fired. Resolve or flag before approving.'
    : 'Check: verify the affected charts before approving.';
}
