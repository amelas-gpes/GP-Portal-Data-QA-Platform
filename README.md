# GP Portal Data QA Platform

A browser-based tool for exploring how a fund's limited partners fall into **scenarios** — sign-patterns of their financial metrics — across the GP Portal BI visuals. Import a BI workbook or CSV and the app classifies every investor-fund into a scenario for each visual, shows how the population splits, lists which investors land in each scenario, and lets you change the underlying data to watch the classification move.

Everything runs locally: the workbook is parsed in a Web Worker and never leaves the browser.

React + TypeScript, built with Vite, charts with Recharts.

## What is a "scenario"?

A scenario is the **sign tuple** (`+` / `−` / `0`) of an investor's aggregated metrics, classified separately for each of the five LP visuals. For example, an LP that has paid in capital and received some cash back classifies on the Cash Flow visual as `Contribution − / Distribution +`.

| Visual | The scenario is the signs of… |
|---|---|
| **Cash Flow** | Contributions, Distributions |
| **Commitment Summary** | Total Commitments, Available Unfunded Commitments |
| **Ratio Analysis** | Contributions, Distributions, Capital Account Balance |
| **Total Value** | Capital Account Balance, Distributions, Total Value |
| **Capital At Work** | Capital At Work, Commitments, % Deployed, Non-Recallable Distributions |

Composite metrics are derived from the base ledger fields:

```text
Total Value      = Capital Account Balance + Distributions
Called Capital   = Total Commitments − Available Unfunded Commitments
Capital At Work  = −Called Capital − Distributions
Non-Recallable   = Distributions − Recallable Distributions
```

**Aggregated per investor-fund, never per line item.** A BI export is GL-transactional (hundreds of rows per investor). The app sums every line item for an investor-fund first, then takes the sign — so a scenario is always an investor-fund-level classification. The model and its labels reproduce `RRE Scenarios.xlsx` exactly (validated against all 473 investors in the reference dataset).

**Signs are raw ledger values**, so they match the source workbook: `Contribution −` means capital was paid in; `Distribution +` means cash was returned. There is no "good/bad" or severity — a scenario is simply a classification.

## Using the app

**Import.** Drag in (or choose) an Excel workbook or CSV with the BI export columns. On completion every investor is classified and the app lands on the first investor.

**Two contexts** — toggled by the left rail's **Investors / Scenarios** switch (or `t`):

- **Investor focus.** Select an investor and the panel shows *only that investor's* scenario for each of the five visuals, next to its charts. No other investors, no filtering — you see exactly where the one you're looking at falls.
- **Scenario overview.** The general view: pick a visual to see how the whole population splits into scenarios (each chip shows an investor count and share), and click a scenario to list every investor in it in the bottom membership panel. Clicking a member jumps back to focusing that investor.

A **"See all →"** link on each row of the investor panel bridges from "this investor is in scenario X" to "everyone in scenario X."

**Change data (what-if).** Open the drawer with `s`, then flip a metric's sign, zero it, or set a value — for one period or all. The charts redraw with ghosts against the baseline, and a **Scenario Shift** readout shows exactly how the selected investor moves between scenarios. This is the direct link between the underlying data and the classification.

**Export.** *Export scenarios* downloads a CSV with one row per investor and its scenario label for all five visuals — the same shape as the source workbook's detail sheet.

## Keyboard

`j`/`k` (or `←`/`→`) step investors · `t` toggle rail (Investors ⇄ Scenarios) · `v` focus the next visual · `g` flip LP/GP charts · `s` change data (what-if) · `e` toggle the membership panel · `x` clear the what-if · `/` focus search · `Alt+←/→` back/forward through visited investors · `Ctrl+K` command palette · `?` help · `Esc` dismiss.

The command palette (`Ctrl+K`) fuzzy-searches actions, investors, scenarios, charts, and filters. Scope with a leading sigil (`>` actions, `@` investors, `#` scenarios, `*` charts, `:` filters) or cycle scopes with `Tab`.

## Run

```bash
npm install
npm run dev
```

Open the local URL shown by Vite, usually `http://127.0.0.1:5173`.

## Import details

The importer (a Web Worker, using the maintained `@e965/xlsx` SheetJS-compatible parser):

- Parses CSV directly, or the first Excel worksheet by default.
- Validates the required BI export columns. `Investor Portal Display Name` is optional — when an export omits it, the import records a warning and investor names fall back to `Investor Group Name`.
- Converts Excel serial dates to JavaScript dates and normalizes currency/numeric values (strips blanks, commas, currency symbols, and parenthesized negatives) while preserving the raw values.
- Builds fast indexes by investor, investor-fund, program, quarter, and year, then classifies every investor into a scenario per visual.

No uploaded data is sent to a backend, and each reload starts empty until a workbook or CSV is imported. CSV imports are usually faster because they skip workbook ZIP decompression, but they run through the same validation, normalization, and classification path as Excel.

## How it works (for contributors)

- **Scenario model** — `src/utils/scenarioClassifier.ts`. `SCENARIO_VISUALS` declares the five visuals; `classifyInvestorScenarios()` sums each investor's rows and labels them; `classifyMetrics()` defines each visual's sign tuple and label. Change a visual's definition here.
- **Import + normalization** — `src/workers/importWorker.ts`, `src/utils/normalize.ts`, `src/data/columns.ts` (column → field mapping).
- **Charts** — `src/components/Charts.tsx` (Recharts), computed in `src/utils/charts.ts` from the production metric registry in `src/data/defaultLogic.ts`.
- **What-if** — `src/utils/scenarioSimulation.ts` + `src/components/drawer/SourceValuesPanel.tsx`.
- **Acceptance test** — `src/test/scenarioClassifier.test.ts` runs the classifier against fixtures in `src/test/fixtures/` and asserts it reproduces the workbook's per-investor labels and Sheet1 bucket counts.

## Tests

```bash
npm test
```

Coverage includes the scenario classifier (reproducing the workbook's labels and counts, sign edge cases, composite derivations), chart aggregation and export, filter cascades, palette search, period-hover syncing, and the raw-data table.

## Limitations

- The browser cannot preload files from local absolute paths; import through the file picker or drag/drop.
- The what-if and raw-row views work from at most 5,000 worker-returned rows per selection to keep the UI responsive, and warn when a selection is larger.
- Frontend-only — nothing persists across reloads. Export before closing if you need the results.
- Scenarios cover the five LP visuals defined in the workbook; GP/program visuals render as plain charts without a scenario layer.
