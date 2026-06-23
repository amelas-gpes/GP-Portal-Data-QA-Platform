import { X } from 'lucide-react';
import { IconButton, ModalShell } from '../common';

// HelpOverlay — summoned via `?`. Keyboard map plus a short explanation of the
// scenario model and the what-if.

export type HelpOverlayProps = {
  onClose: () => void;
};

const KEYMAP: Array<{ keys: string; action: string }> = [
  { keys: 'j / k or ← / →', action: 'Step to the previous/next investor' },
  { keys: 'Alt+← / Alt+→', action: 'Back / forward through your investor visit history' },
  { keys: 't', action: 'Toggle rail: investor list ⇄ scenarios for the focused visual' },
  { keys: 'v', action: 'Focus the next visual (Cash Flow → Commitment → Ratio → Total Value → Capital At Work)' },
  { keys: 'g', action: 'Flip LP ⇄ GP charts' },
  { keys: 's', action: 'Open the Change data (what-if) drawer' },
  { keys: 'e', action: 'Toggle the scenario membership panel' },
  { keys: 'x', action: 'Clear the active what-if' },
  { keys: '/', action: 'Focus rail search' },
  { keys: 'Ctrl+K', action: 'Command palette — fuzzy-search actions, investors, scenarios, charts, and filters. Scope with a leading sigil (> actions, @ investors, # scenarios, * charts, : filters) or Tab.' },
  { keys: '?', action: 'This help overlay' },
  { keys: 'Esc', action: 'Close the innermost surface' },
];

const HOW_IT_WORKS: Array<{ title: string; body: string }> = [
  {
    title: 'Scenarios are sign-patterns',
    body: 'A scenario is the sign tuple of an investor’s aggregated metrics, classified separately for each visual. Cash Flow looks at Contributions and Distributions; Commitment Summary at Commitments and Unfunded; Ratio Analysis adds Capital Account Balance; Total Value at Capital Account Balance, Distributions, and Total Value; Capital At Work at Capital At Work, Commitments, % Deployed, and Non-Recallable Distributions. There is no severity — a scenario is simply a classification.',
  },
  {
    title: 'Aggregated per investor-fund',
    body: 'Every line item for an investor is summed first (across all periods), then the signs are taken — so classification is at the aggregate investor-fund level, never per row. Signs use raw ledger values: Contribution − means capital was paid in; Distribution + means cash was returned.',
  },
  {
    title: 'Breakdown & membership',
    body: 'Pick a visual to see how the population splits into scenarios, with an investor count on each chip. Click a chip (or a scenario in the rail) to filter the charts and rail to that scenario and list its members in the bottom panel. Export scenarios downloads one row per investor with its label for all five visuals.',
  },
  {
    title: 'Change data (what-if)',
    body: 'Open the drawer with s, then flip a metric’s sign, zero it, or set a value for a period or all periods. The charts update with amber ghosts against the baseline, and the Scenario Shift readout shows exactly how the selected investor moves between scenarios — how the data produces the classification.',
  },
  {
    title: 'Privacy',
    body: 'Everything runs in this browser: the workbook is never uploaded and nothing persists after the tab closes. Export the scenario membership before closing if you need it.',
  },
];

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  return (
    <ModalShell
      actions={(
        <IconButton label="Close help" onClick={onClose}>
          <X size={16} />
        </IconButton>
      )}
      backdropClassName="help-overlay"
      className="help-overlay__shell"
      heading="Help"
      onBackdropClick={onClose}
      size="lg"
      subheading="Scenario explorer · everything stays in this browser"
    >
      <section aria-label="Keyboard shortcuts" className="help-overlay__section" data-section="keyboard">
        <h3 className="help-overlay__section-title">Keyboard</h3>
        <table className="help-overlay__keys">
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {KEYMAP.map((entry) => (
              <tr key={entry.keys}>
                <td className="help-overlay__key-cell"><kbd>{entry.keys}</kbd></td>
                <td>{entry.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-label="How it works" className="help-overlay__section" data-section="review">
        <h3 className="help-overlay__section-title">How it works</h3>
        {HOW_IT_WORKS.map((paragraph) => (
          <p className="help-overlay__paragraph" key={paragraph.title}>
            <strong>{paragraph.title}.</strong> {paragraph.body}
          </p>
        ))}
      </section>
    </ModalShell>
  );
}
