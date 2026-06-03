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
   npm run screenshots:ui:plan -- --base origin/main
   ```

2. Generate focused screenshots for the mapped views:

   ```sh
   npm run screenshots:ui -- --base origin/main --pr <number>
   ```

   This writes only the mapped focused views into `tmp/pr-screenshots/<number>/`. The focused generator uses deterministic representative fixtures and copied Foundry core/dnd5e raster assets from `tests/fixtures/ui-assets/manifest.js`; it does not boot Foundry and does not run the smoke harness.

3. Upload the generated screenshots through GitHub's native PR/issue attachment flow and embed the returned image markdown in the `Screenshots (if applicable)` section of the PR description:

   ```md
   ![pr-123 manager environment editor](https://github.com/user-attachments/assets/<id>)
   ```

   The image alt text must include `pr-<number>` so the scoped CI check can verify the screenshot belongs to the current PR. The normal PR handoff should show rendered images in the PR description, not only artifact names or file lists.

4. Clean the local PR-scoped screenshots immediately after the PR has been updated:

   ```sh
   npm run screenshots:ui:clean -- --pr <number>
   ```

   Do not commit files from `tmp/pr-screenshots/<number>/` or move them into `docs/`, `assets/`, or any other repository asset directory.
   Do not install or use helper upload extensions unless the user explicitly approves that fallback; prefer the native GitHub attachment route.

5. Optional fallback: collect screenshots from an explicit smoke-harness run:

   ```sh
   npm run screenshots:ui:collect -- --base origin/main --pr <number>
   ```

   Use this only when live Foundry behavior is the evidence being requested. The full smoke harness is intentionally not part of the normal UI screenshot path because it is slower and produces many unrelated images.

6. If focused screenshot capture is genuinely blocked, add exactly one handoff line with a specific reason:

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

- PR-scoped GitHub attachment markdown whose alt text includes `pr-<pr-number>`
- PR-scoped uploaded artifact references such as `codex-ui-evidence-<pr-number>` for automation-only fallback runs
- PR-scoped `test-results/...png|jpg|jpeg|webp|gif` artifact paths
- `SCREENSHOTS_NEEDED: <reason>` when capture is blocked

Artifact references and `test-results` paths are accepted for CI compatibility, but they are not the normal UI PR evidence format. Manual and agent-driven PR updates should embed visible GitHub attachment images in the PR description.

CI does not accept unrelated image markdown as UI evidence.
