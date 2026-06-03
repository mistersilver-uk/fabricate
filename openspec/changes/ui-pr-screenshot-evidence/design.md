# UI PR Screenshot Evidence Design

## CI And Local Dev

The existing `.github/workflows/ci.yml` `check-screenshots` job remains the only PR gate. It checks out the repo and calls `node scripts/ui-pr-screenshot-evidence.mjs check` with the live PR body and changed-file list from GitHub.

Local agents use the same script:

- `plan` lists the screenshot view recipes implied by changed UI files.
- `collect` copies matching smoke-harness screenshots from `test-results/` into `tmp/pr-screenshots/<number>/`.
- `clean` removes `tmp/pr-screenshots/<number>/` after the screenshots have been uploaded through GitHub's native attachment flow and embedded in the PR description.
- `check` verifies that a PR body contains smoke-run evidence or an explicit `SCREENSHOTS_NEEDED:` handoff.

This keeps CI cheap while ensuring the only local screenshot source is the real Foundry smoke harness rather than synthetic previews.

## Evidence Rules

UI changes are files under `src/ui/`, `styles/`, or files ending in `.svelte` / `.css`.

Normal evidence:

- GitHub attachment markdown whose alt text includes `pr-<pr-number>`
- `SCREENSHOTS_NEEDED: <non-empty reason>` when screenshots are genuinely blocked

Automation fallback evidence:

- links or text naming PR-scoped uploaded `codex-ui-evidence-<pr-number>` artifacts
- PR-scoped `test-results/...png|jpg|jpeg|webp|gif` artifact paths

Artifact references are accepted for CI compatibility with automation-only runs, but they are not the normal UI PR handoff. Manual and agent-driven PR updates should embed visible `github.com/user-attachments/assets/...` images in the PR description.

Generic unrelated image markdown is not sufficient.

## Screenshot Source

The screenshot evidence script does not render synthetic HTML fixtures and does not maintain copied preview asset fixtures. Evidence is collected from real smoke-harness artifacts under `test-results/`. Smoke fixture data should use Foundry core or dnd5e non-SVG raster icon paths directly when a preview image is needed.
