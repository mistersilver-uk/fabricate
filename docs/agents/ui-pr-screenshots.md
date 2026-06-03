# UI PR Screenshot Evidence

UI changes must have real smoke-run screenshot evidence embedded in the PR body. The CI `check-screenshots` job enforces this with `scripts/ui-pr-screenshot-evidence.mjs`.

## When It Applies

The rule applies when a PR changes any file under:

- `src/ui/`
- `styles/`
- `lang/` (visible UI text)
- any `*.svelte` file
- any `*.css` file

## Prerequisites

- A `gh` CLI authenticated with a token that can create releases in the repo (`contents: write`).
- The `gh attach` extension (`gh extension install atani/gh-attach`). `publish` uses its **release mode** (`gh attach --release`), which uploads images as assets on a per-PR release tag (`fabricate-pr-<number>`) and needs only `gh` auth — no browser. (`gh attach`'s default browser mode produces `user-attachments/assets/...` URLs but requires an interactive `playwright-cli` session, so it is not used for automation.)

## Local Workflow

1. Plan the required screenshot views:

   ```sh
   npm run screenshots:ui:plan -- --base origin/main
   ```

2. Run the Foundry smoke harness to generate real UI screenshots (local default is the `full` profile, which captures every per-view screen):

   ```sh
   npm run test:foundry
   ```

   The harness writes real Foundry-mounted screenshots under `test-results/`.

3. Collect only the mapped smoke screenshots for the PR:

   ```sh
   npm run screenshots:ui -- --base origin/main --pr <number>
   ```

   This copies the relevant smoke artifacts from `test-results/` into `tmp/pr-screenshots/<number>/`. PR-scoped screenshots are temporary handoff files only.

4. Upload and embed automatically:

   ```sh
   npm run screenshots:ui:publish -- --pr <number>
   ```

   This uploads each collected PNG with `gh attach --release` (to the `fabricate-pr-<number>` release tag), then patches the PR body via `gh pr edit --body-file`, inserting (or replacing, on re-run) a managed block:

   ```md
   <!-- fabricate:screenshots:start -->
   ![pr-123 Manager gathering environments](https://github.com/<owner>/<repo>/releases/download/fabricate-pr-123/manager-environments.png)
   <!-- fabricate:screenshots:end -->
   ```

   The release tag is PR-scoped (`fabricate-pr-<number>`), so the asset URL itself identifies the PR and the block alt text also includes `pr-<number>`. The block is idempotent — re-running `publish` replaces it in place rather than appending duplicates. Delete the `fabricate-pr-<number>` release when the PR is closed/merged.

5. Clean the local PR-scoped screenshots:

   ```sh
   npm run screenshots:ui:clean -- --pr <number>
   ```

   Do not commit files from `tmp/pr-screenshots/<number>/` or move them into `docs/`, `assets/`, or any other repository asset directory.

## Screenshot Source

Screenshot evidence must come from real smoke-harness artifacts in `test-results/`. The screenshot evidence script does not render hand-authored HTML fixtures, does not use copied mock asset manifests, and does not generate synthetic previews. Smoke fixture data should use Foundry core or dnd5e non-SVG raster icon paths directly when a preview image is needed.

## CI Behavior

CI runs only the lightweight `check` (no smoke run on the runner). It reads the live PR body, changed files, and labels, then accepts:

- PR-scoped GitHub release-asset URLs under `releases/download/fabricate-pr-<pr-number>/...` (the normal evidence produced by `publish`)
- PR-scoped GitHub attachment markdown whose alt text includes `pr-<pr-number>` (browser-mode `user-attachments` uploads)
- PR-scoped uploaded artifact references such as `codex-ui-evidence-<pr-number>` (automation fallback)
- PR-scoped `test-results/...png|jpg|jpeg|webp|gif` artifact paths (automation fallback)

CI does not accept unrelated image markdown, and there is **no `SCREENSHOTS_NEEDED:` text bypass** — that self-serve escape hatch has been removed.

## Bypass

The only way to skip the check is the **`screenshots-exempt` label**, which only a maintainer can apply. An agent must never apply it. When the label is present, the check passes unconditionally. Use it only when screenshot capture is genuinely impossible (e.g. the smoke harness cannot boot for an unrelated reason).
