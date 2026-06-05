# UI PR Screenshot Evidence

UI changes must include screenshot evidence in the PR body. The CI `check-screenshots` job enforces this with `scripts/ui-pr-screenshot-evidence.mjs`: the body must contain a **Screenshots** heading (any ATX level, normally `##`) with at least one image beneath it. The smoke-harness/S3 workflow below is the recommended way to produce real screenshots, but any image under a Screenshots heading — including a drag-and-dropped GitHub attachment — satisfies the check.

## When It Applies

The rule applies when a PR changes any file under:

- `src/ui/`
- `styles/`
- `lang/` (visible UI text)
- any `*.svelte` file
- any `*.css` file

## Prerequisites

- A `gh` CLI authenticated (used only to read and patch the PR body).
- AWS credentials for the release S3 bucket. **Locally**, the AWS default provider chain (env vars or an `aws` CLI profile). **In CI**, OIDC role assumption only — never static keys. `publish` uploads PNGs to `s3://<bucket>/pr-screenshots/<number>/` (bucket/baseUrl from `release.s3.config.json`, overridable via `S3_RELEASE_BUCKET`/`RELEASE_BASE_URL`/`AWS_REGION`).

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

   This uploads each collected PNG to `s3://<bucket>/pr-screenshots/<number>/<view>.png`, then patches the PR body via `gh pr edit --body-file`, inserting (or replacing, on re-run) a managed block:

   ```md
   <!-- fabricate:screenshots:start -->
   ![pr-123 Manager gathering environments](https://<bucket>.s3.<region>.amazonaws.com/pr-screenshots/123/manager-environments.png)
   <!-- fabricate:screenshots:end -->
   ```

   The S3 key is PR-scoped (`pr-screenshots/<number>/`), so the object URL itself identifies the PR and the block alt text also includes `pr-<number>`. The block is idempotent — re-running `publish` replaces it in place rather than appending duplicates.

5. Clean up:

   ```sh
   npm run screenshots:ui:clean -- --pr <number>
   ```

   This removes the local `tmp/pr-screenshots/<number>/` only. The uploaded S3 objects stay live so the embedded image URLs keep working while the PR is open. Do not commit files from `tmp/pr-screenshots/<number>/` or move them into `docs/`, `assets/`, or any other repository asset directory.

   **Removing the S3 objects** (e.g. when the PR closes): `npm run screenshots:ui:clean -- --pr <number> --s3` deletes them best-effort (a missing-credentials/permission failure only warns).

   **Orphan prevention:** the S3 bucket has a lifecycle rule expiring the `pr-screenshots/` prefix after N days as a backstop, so PR screenshots never accumulate even if `--s3` cleanup is skipped.

## Screenshot Source

Screenshot evidence must come from real smoke-harness artifacts in `test-results/`. The screenshot evidence script does not render hand-authored HTML fixtures, does not use copied mock asset manifests, and does not generate synthetic previews. Smoke fixture data should use Foundry core or dnd5e non-SVG raster icon paths directly when a preview image is needed.

## CI Behavior

CI runs only the lightweight `check` (no smoke run on the runner). It reads the live PR body, changed files, and labels, then passes when the body has a **Screenshots** heading whose section contains at least one image:

```md
## Screenshots

![Manager gathering tools](https://github.com/user-attachments/assets/<uuid>)
```

Details of the rule:

- The heading match is case-insensitive, accepts any ATX level (`#`–`######`) and the singular form (`## Screenshot`).
- The section runs from the heading to the next heading of the same or higher level, so an image under a *different* later heading does not count.
- Images may be markdown (`![alt](url)`) or HTML (`<img src=...>`). GitHub drag-and-drop attachment URLs have no file extension, so the image syntax — not the URL shape — is what matters.
- An image with no Screenshots heading, or a Screenshots heading with no image, does not pass. There is **no `SCREENSHOTS_NEEDED:` text bypass**.

The `publish` step writes its managed block beneath a `## Screenshots` heading, so an auto-published body satisfies the same rule.

## Bypass

The only way to skip the check is the **`screenshots-exempt` label**, which only a maintainer can apply. An agent must never apply it. When the label is present, the check passes unconditionally. Use it only when screenshot capture is genuinely impossible (e.g. the smoke harness cannot boot for an unrelated reason).
