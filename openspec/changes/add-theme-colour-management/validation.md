# Validation

## Automated Gates

- `npm test` passed on 2026-05-09.
- `npm run build` passed on 2026-05-09.

## Rendered Theme Check

`tests/components/theme-rendered-validation.test.js` renders a representative Manager V2/Admin surface at `960x720` for both theme attributes:

- `data-fabricate-theme="fabricate"` screenshot: `test-results/theme-fabricate.png`
- `data-fabricate-theme="mythwright"` screenshot: `test-results/theme-mythwright.png`

The check asserts that the document theme attribute is applied, theme root tokens compute to the expected theme-specific values, primary and submit actions are visible, focus rings render from keyboard tab navigation, rail/main/inspector regions do not overlap, scroll containment is owned by the manager body, and primary action, essence submit, tag chip, and status toggle text contrast are at least `4.5:1`.

Observed root tokens:

| Theme | `--fab-bg-0` | `--fab-text` |
| --- | --- | --- |
| Fabricate | `#111A23` | `#F1D1B5` |
| Mythwright | `#071116` | `#F2F7F5` |
