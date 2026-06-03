# UI PR Screenshot Evidence Design

## CI And Local Dev

The existing `.github/workflows/ci.yml` `check-screenshots` job remains the only PR gate. It checks out the repo and calls `node scripts/ui-pr-screenshot-evidence.mjs check` with the live PR body and changed-file list from GitHub.

Local agents use the same script:

- `plan` lists the screenshot view recipes implied by changed UI files.
- `generate` creates focused representative screenshots for the mapped views directly under `docs/assets/pr-screenshots/pr-<number>/`.
- `collect` remains an explicit fallback that copies matching generated screenshots from `test-results/` into `docs/assets/pr-screenshots/pr-<number>/` when the user requested live Foundry or smoke-harness evidence.
- `check` verifies that a PR body contains generated evidence or an explicit `SCREENSHOTS_NEEDED:` handoff.

This keeps CI cheap, makes the normal local path fast and focused, and avoids coupling PR screenshots to the full Foundry smoke harness.

## Evidence Rules

UI changes are files under `src/ui/`, `styles/`, or files ending in `.svelte` / `.css`.

Accepted evidence:

- markdown or HTML image/link references to `docs/assets/pr-screenshots/pr-<number>/...`
- links or text naming uploaded `codex-ui-evidence-*` artifacts
- `test-results/...png|jpg|jpeg|webp` artifact paths
- `SCREENSHOTS_NEEDED: <non-empty reason>` when screenshots are genuinely blocked

Generic unrelated image markdown is not sufficient.

## Preview Icon Assets

Approved screenshot fixture icons live under `tests/fixtures/ui-assets/copied/` and are exported by `tests/fixtures/ui-assets/manifest.js`. Focused screenshot fixture data should import copied asset paths from this manifest rather than hard-code image paths. The copied files are non-SVG Foundry VTT core and dnd5e raster icons, and the manifest records the original `icons/...` or `systems/dnd5e/...` source path for each asset. Do not invent or check in custom SVG preview art. Live Foundry smoke-harness data may continue to use direct Foundry core/dnd5e raster paths because it runs inside a real Foundry installation, but it is not the normal PR screenshot source.
