# UI PR Screenshot Evidence

UI changes must have generated screenshot evidence in the PR body. The existing CI `check-screenshots` job enforces this with `scripts/ui-pr-screenshot-evidence.mjs`.

## When It Applies

The rule applies when a PR changes any file under:

- `src/ui/`
- `styles/`
- any `*.svelte` file
- any `*.css` file

## Local Workflow

1. Plan the required screenshot views:

   ```sh
   npm run screenshots:ui:plan -- --base main
   ```

2. Generate focused screenshots for the mapped views:

   ```sh
   npm run screenshots:ui -- --base main --pr <number>
   ```

   This writes only the mapped focused views into `docs/assets/pr-screenshots/pr-<number>/`. The focused generator uses deterministic representative fixtures and copied Foundry core/dnd5e raster assets from `tests/fixtures/ui-assets/manifest.js`; it does not boot Foundry and does not run the smoke harness.

3. Commit the generated screenshot assets and embed them in the PR `Screenshots (if applicable)` section:

   ```md
   ![Manager environment editor](https://github.com/<owner>/<repo>/blob/<branch>/docs/assets/pr-screenshots/pr-123/manager-environment-editor.png?raw=1)
   ```

4. Optional fallback: collect screenshots from an explicit smoke-harness run:

   ```sh
   npm run screenshots:ui:collect -- --base main --pr <number>
   ```

   Use this only when live Foundry behavior is the evidence being requested. The full smoke harness is intentionally not part of the normal UI screenshot path because it is slower and produces many unrelated images.

5. If focused screenshot capture is genuinely blocked, add exactly one handoff line with a specific reason:

   ```md
   SCREENSHOTS_NEEDED: Playwright could not launch locally; changed Manager tools browser row spacing.
   ```

## Preview Icon Assets

Mock screenshot fixtures must use copied assets from `tests/fixtures/ui-assets/manifest.js` instead of hard-coded image paths. The manifest points to non-SVG raster files copied from Foundry VTT core and dnd5e, with source metadata recording the original `icons/...` or `systems/dnd5e/...` path. Do not invent or check in custom SVG preview art. The manifest covers:

- crafting components and outputs
- gathering environments
- gathering hazards
- missing/disabled/placeholder fallbacks

Validate the manifest with:

```sh
npm run screenshots:ui:assets
```

Focused Playwright previews must use these copied manifest entries. Live Foundry smoke-harness data may continue to use direct Foundry core/dnd5e raster paths because those screenshots run inside a real Foundry installation, but smoke output is not the default PR evidence path.

## CI Behavior

CI accepts:

- committed generated screenshots under `docs/assets/pr-screenshots/pr-<number>/`
- uploaded artifact references such as `codex-ui-evidence-*`
- `test-results/...png` artifact paths
- `SCREENSHOTS_NEEDED: <reason>` when capture is blocked

CI does not accept unrelated image markdown as UI evidence.
