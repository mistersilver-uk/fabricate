# Design: PR Screenshot Cleanup OIDC Trust Guidance

## Failure Analysis

Run `26917047657` closed PR `#253` and checked out the trusted base branch
(`main`). The `Configure AWS credentials (OIDC)` step requested role
`arn:aws:iam::088545273404:role/GitHubFabricatePrScreenshotsRole`, then AWS STS
returned `Not authorized to perform sts:AssumeRoleWithWebIdentity`.

This means GitHub could mint an OIDC token and the workflow had
`id-token: write`; the rejection happened inside the AWS role trust policy.

## Trust Policy Shape

The screenshot role should keep an AWS-required `sub` guard, but should not use
`job_workflow_ref` for these normal workflows. The `sub` guard should allow only:

- `repo:mistersilver-uk/fabricate-v2:ref:refs/heads/main` for
  `workflow_dispatch` publishing from `main`.
- `repo:mistersilver-uk/fabricate-v2:pull_request` for `pull_request_target` cleanup.

The tighter workflow guard should use the GitHub-specific AWS OIDC condition
keys:

- `token.actions.githubusercontent.com:repository`
- `token.actions.githubusercontent.com:ref`
- `token.actions.githubusercontent.com:workflow`

`ref: refs/heads/main` is valid for the current trusted workflow model because
both CI role users either run on `workflow_dispatch` from `main` or on
`pull_request_target` against the trusted base branch.

## Security Notes

The role remains dedicated to PR screenshot objects only. The permission policy
must continue to limit S3 access to `pr-screenshots/*`, and the workflows must
continue to check out trusted base code for `pull_request_target` events.

No `pull_request_target` job should execute PR-head code.
