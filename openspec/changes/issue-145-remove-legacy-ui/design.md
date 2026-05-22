# Design — Remove Legacy UI (#145)

## Admin class collapse

`SvelteCraftingSystemManagerV2App` previously `extends SvelteRecipeManagerApp`,
so the legacy admin class doubled as the base class for the V2 manager. To
remove the legacy admin without losing the shared store/service plumbing, the
two classes are merged into one flat class that
`extends SvelteApplicationMixin(foundry.applications.api.ApplicationV2)`
directly:

- `_buildServices()` moves down verbatim (no V2 override existed).
- The two-level `_prepareSvelteProps()` is flattened into one method; the
  V2-only services (`confirmDiscardEssenceDraft`, `confirmDirtyToolsNavigation`,
  `registerEssenceDirtyGuard`) are inlined and `openCurrentAdmin` is dropped.
- The two `close()` overrides merge into one, preserving guard order: essence
  guard, then environment guard, then store teardown, then `super.close()`.
- `DEFAULT_OPTIONS` is inlined (no more spread of a base class' options).

## Entry points

`game.fabricate.api.openRecipeManager()` is kept for backward compatibility with
existing user macros, repointed from the deleted legacy admin to the surviving
manager. The in-app "open current admin" button is removed because the admin it
opened no longer exists.

## "V2" rename

With the legacy admin gone, the surviving manager is no longer "V2", so the
suffix is dropped everywhere via a mechanical, repo-wide rename:
`ManagerV2` → `Manager`, `manager-v2` → `manager`, `managerV2` → `manager`.
This covers the class, file, `manager/` directory, root component, app factory
functions, app id, CSS class prefixes, the `FABRICATE.Admin.ManagerV2.*`
localization namespace, and test files. The rename is mechanically safe: no
pre-existing `Manager`/`manager-` identifiers collided, and the build plus the
full unit suite verify consistency.

## Verification

`npm test` and `npm run build` gate every step locally. The Foundry smoke
suite (`npm run test:foundry:rc`) runs in CI, where Foundry credentials are
available; it is not runnable in a local checkout without those secrets.
