# Tasks

- [x] Update `docs/contributing.md` screenshot IAM trust policy to remove
  `job_workflow_ref`.
- [x] Document why normal workflows should use `workflow` / `ref` / `repository`
  conditions instead.
- [x] Validate the docs change and, if credentials are available, apply the
  corrected trust policy to `GitHubFabricatePrScreenshotsRole`.
- [x] Summarize the failing run diagnosis and remaining external-state
  requirements.
