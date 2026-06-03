# UI PR Screenshot Evidence

UI changes must have smoke-run screenshot evidence in the PR body. The existing CI `check-screenshots` job enforces this with `scripts/ui-pr-screenshot-evidence.mjs`.

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

2. Run the Foundry smoke harness to generate real UI screenshots:

   ```sh
   npm run test:foundry
   ```

   The harness writes real Foundry-mounted screenshots under `test-results/`.

3. Collect only the mapped smoke screenshots for the PR:

   ```sh
   npm run screenshots:ui -- --base origin/main --pr <number>
   ```

   This copies relevant smoke artifacts from `test-results/` into `tmp/pr-screenshots/<number>/`. PR-scoped screenshots are temporary handoff files only.

4. Upload the collected screenshots through GitHub's native PR/issue attachment flow and embed the returned image markdown in the `Screenshots (if applicable)` section of the PR description:

   ```md
   ![pr-123 manager environment editor](https://github.com/user-attachments/assets/<id>)
   ```

   The image alt text must include `pr-<number>` so the scoped CI check can verify the screenshot belongs to the current PR. The normal PR handoff should show rendered images in the PR description, not only artifact names or file lists.

5. Clean the local PR-scoped screenshots immediately after the PR has been updated:

   ```sh
   npm run screenshots:ui:clean -- --pr <number>
   ```

   Do not commit files from `tmp/pr-screenshots/<number>/` or move them into `docs/`, `assets/`, or any other repository asset directory.
   Do not install or use helper upload extensions unless the user explicitly approves that fallback; prefer the native GitHub attachment route.

6. If smoke screenshot capture is genuinely blocked, add exactly one handoff line with a specific reason:

   ```md
SCREENSHOTS_NEEDED: Foundry smoke harness could not launch locally; changed Manager tools browser row spacing.
   ```

## Screenshot Source

Screenshot evidence must come from real smoke-harness artifacts in `test-results/`. The screenshot evidence script does not render hand-authored HTML fixtures, does not use copied mock asset manifests, and does not generate synthetic previews. Smoke fixture data should use Foundry core or dnd5e non-SVG raster icon paths directly when a preview image is needed.

## CI Behavior

CI accepts:

- PR-scoped GitHub attachment markdown whose alt text includes `pr-<pr-number>`
- PR-scoped uploaded artifact references such as `codex-ui-evidence-<pr-number>` for automation-only fallback runs
- PR-scoped `test-results/...png|jpg|jpeg|webp|gif` artifact paths
- `SCREENSHOTS_NEEDED: <reason>` when capture is blocked

Artifact references and `test-results` paths are accepted for CI compatibility, but they are not the normal UI PR evidence format. Manual and agent-driven PR updates should embed visible GitHub attachment images in the PR description.

CI does not accept unrelated image markdown as UI evidence.
