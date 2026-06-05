# Proposal: Fix PR Screenshot Cleanup OIDC Trust Guidance

## Problem

The `PR screenshots cleanup` workflow logs `Could not assume role with OIDC:
Not authorized to perform sts:AssumeRoleWithWebIdentity` when a PR closes.
The workflow is best-effort and still completes successfully, but the S3 cleanup
cannot run because AWS STS rejects the GitHub OIDC token.

The documented IAM trust policy scopes the screenshot role with
`token.actions.githubusercontent.com:job_workflow_ref`. GitHub emits that claim
for reusable workflow jobs; the cleanup job and team-b backlog workflow are
normal repository workflows. Requiring that claim can make an otherwise valid
token fail the role trust policy.

## Proposed Change

Update the screenshot-publishing infrastructure guidance to scope the role by
claims that normal workflows provide and AWS supports for GitHub OIDC:

- `aud` is `sts.amazonaws.com`.
- `sub` is restricted to the expected `main` branch subject for manual
  publishing and the expected pull-request subject for cleanup.
- `repository` is restricted to `mistersilver-uk/fabricate`.
- `ref` is restricted to the trusted `main` branch.
- `workflow` is restricted to the two workflow names that publish or clean PR screenshots.

## CI Behavior

In CI, `team-b-backlog.yml` and `pr-screenshots-cleanup.yml` continue using
OIDC only through `AWS_SCREENSHOTS_ROLE_TO_ASSUME`; no static AWS credentials
are introduced. The cleanup workflow remains best-effort, with the S3 lifecycle
rule as the backstop if AWS credentials cannot be assumed.

## Local Dev Behavior

Local screenshot publishing and cleanup continue using the AWS default provider
chain, such as a local AWS profile. No local workflow or npm command behavior
changes.
