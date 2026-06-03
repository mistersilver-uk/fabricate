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

2. Generate screenshots with the relevant renderer:

   - Prefer a focused Vite/Playwright capture for a narrow view change.
   - Use `npm run test:foundry` when the view depends on live Foundry APIs or when Phase D0 already screenshots the changed Manager route.
   - Keep raw generated screenshots in `test-results/`.

3. Collect generated screenshots into PR-ready committed assets:

   ```sh
   npm run screenshots:ui -- --base main --pr <number>
   ```

   This copies matching screenshots into `docs/assets/pr-screenshots/pr-<number>/`. If a changed view has no known smoke-harness screenshot, capture a focused screenshot and place it in that directory manually using the same naming style.

4. Embed committed images in the PR `Screenshots (if applicable)` section:

   ```md
   ![Manager environment editor](https://github.com/<owner>/<repo>/blob/<branch>/docs/assets/pr-screenshots/pr-123/manager-environments.png?raw=1)
   ```

5. If screenshot capture is genuinely blocked, add exactly one handoff line with a specific reason:

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

Focused Vite/Playwright previews that need images should use these copied manifest entries. Live Foundry smoke-harness data may continue to use direct Foundry core/dnd5e raster paths because those screenshots run inside a real Foundry installation.

## CI Behavior

CI accepts:

- committed generated screenshots under `docs/assets/pr-screenshots/pr-<number>/`
- uploaded artifact references such as `codex-ui-evidence-*`
- `test-results/...png` artifact paths
- `SCREENSHOTS_NEEDED: <reason>` when capture is blocked

CI does not accept unrelated image markdown as UI evidence.
