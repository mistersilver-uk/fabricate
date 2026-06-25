import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(relPath) {
  return readFileSync(resolve(__dirname, relPath), 'utf8');
}

const aggregatorSource = read('../../src/systems/systemValidation.js');
const rootSource = read('../../src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');

// Every issue `kind` the aggregator can tag. Mirrors `IssueKind` and the
// `tag*Issue` / blocker helpers in systemValidation.js.
const AGGREGATOR_KINDS = ['recipe', 'environment', 'task', 'event', 'salvage', 'system'];

// The view tokens CraftingSystemManagerRoot routes to. A deep-linked kind must
// land on one of these (the root sets `activeView` to one of them, directly or
// via a selection helper). Kept in sync with `setView`/`normalizedActiveView`.
const ROOT_VIEW_TOKENS = new Set([
  'systems',
  // The standalone `system-overview` route was folded into the `system-edit`
  // page's Validation tab; `system-edit` is the routed token deep links resolve
  // to (the page opens its Validation tab via requestedTab).
  'system-edit',
  'recipes',
  'recipe-edit',
  'components',
  'component-edit',
  'tags',
  'essences',
  'essence-edit',
  'tools',
  'checks',
  'environments',
  'environment-edit',
  'gathering-task-edit',
  'gathering-event-edit'
]);

describe('System overview deep-link drift guard', () => {
  it('emits only known issue kinds from the aggregator', () => {
    // Every `kind: '<x>'` literal the aggregator writes must be an expected kind.
    const emitted = new Set(
      [...aggregatorSource.matchAll(/kind:\s*'([a-z]+)'/g)].map((match) => match[1])
    );
    for (const kind of emitted) {
      assert.ok(
        AGGREGATOR_KINDS.includes(kind),
        `aggregator emits unexpected issue kind "${kind}" — update the drift guard + the overview deep-link map`
      );
    }
  });

  it('maps every deep-linkable kind to a real CraftingSystemManagerRoot view token', () => {
    // Parse the root's OVERVIEW_DEEP_LINKS table: kind -> { view: '<token>', ... }.
    const tableMatch = rootSource.match(/const OVERVIEW_DEEP_LINKS = \{([\s\S]*?)\n  \};/);
    assert.ok(tableMatch, 'OVERVIEW_DEEP_LINKS table found in the root component');
    const table = tableMatch[1];

    const mapped = new Map(
      [...table.matchAll(/(\w+):\s*\{\s*view:\s*'([\w-]+)'/g)].map((match) => [match[1], match[2]])
    );

    // Every non-`system` kind must be deep-linkable, and its target view must be
    // a real root view token. (`system` is the overview itself, so it has no
    // deep link.)
    for (const kind of AGGREGATOR_KINDS) {
      if (kind === 'system') {
        assert.equal(mapped.has(kind), false, 'the system kind must not carry a deep link');
        continue;
      }
      assert.ok(mapped.has(kind), `kind "${kind}" must have a deep-link mapping`);
      const view = mapped.get(kind);
      assert.ok(
        ROOT_VIEW_TOKENS.has(view),
        `kind "${kind}" deep-links to "${view}", which is not a real CraftingSystemManagerRoot view token`
      );
    }
  });

  it('routes the aggregator nav.view tokens through the root (no orphaned target)', () => {
    // The raw `nav: { view: '<token>' }` literals the aggregator emits. Every one
    // must either be a real root view token directly, or a known alias: `items`
    // (the salvage alias the root resolves to `component-edit` via the salvage
    // deep-link map) or `system-overview` (the folded-in overview, which the root
    // resolves to the `system-edit` page's Validation tab via normalizedActiveView).
    const navViews = new Set(
      [...aggregatorSource.matchAll(/nav:\s*\{\s*view:\s*'([\w-]+)'/g)].map((match) => match[1])
    );
    const ALLOWED_ALIASES = new Set(['items', 'system-overview']);
    for (const view of navViews) {
      assert.ok(
        ROOT_VIEW_TOKENS.has(view) || ALLOWED_ALIASES.has(view),
        `aggregator nav.view "${view}" resolves to no root view token or known alias`
      );
    }
    // The `items` salvage alias must resolve to the component editor in the root.
    assert.match(
      rootSource,
      /salvage:\s*\{\s*view:\s*'component-edit'/,
      'the salvage kind (aggregator nav.view "items") must resolve to the component-edit view'
    );
    // The `system-overview` alias must fold into the `system-edit` page in the root.
    assert.match(
      rootSource,
      /view === 'system-overview'\) return 'system-edit'/,
      'the folded-in overview (aggregator nav.view "system-overview") must resolve to the system-edit page'
    );
  });

  // Regression guard for the UX defect: task/event issues carry the task/event
  // RECORD id as `entityId`, but the environment editor selects by ENVIRONMENT
  // id. The aggregator must therefore carry `environmentId`, and the root's
  // environment/task/event deep-links must resolve through it — otherwise the
  // "Open gathering task/event" buttons silently no-op.
  it('carries environmentId for environment-derived issues so the deep-link resolves', () => {
    // The aggregator's environment-issue tagger must include an `environmentId`.
    assert.match(
      aggregatorSource,
      /environmentId,/,
      'tagEnvironmentIssue must carry environmentId on environment-derived issues'
    );

    // The root's environment/task/event deep-links must select by environmentId,
    // not by the record/entity id (which selectEnvironment cannot resolve).
    const tableMatch = rootSource.match(/const OVERVIEW_DEEP_LINKS = \{([\s\S]*?)\n  \};/);
    assert.ok(tableMatch, 'OVERVIEW_DEEP_LINKS table found in the root component');
    const table = tableMatch[1];
    const targetIds = new Map(
      [...table.matchAll(/(\w+):\s*\{\s*view:\s*'[\w-]+',\s*targetId:\s*\(issue\)\s*=>\s*issue\.(\w+)/g)].map(
        (match) => [match[1], match[2]]
      )
    );

    for (const kind of ['environment', 'task', 'event']) {
      assert.equal(
        targetIds.get(kind),
        'environmentId',
        `the "${kind}" deep-link must resolve through issue.environmentId (the owning environment), not the record id`
      );
    }
    // Recipe/salvage still resolve through their own entity id.
    assert.equal(targetIds.get('recipe'), 'entityId', 'recipe deep-link resolves via entityId');
    assert.equal(targetIds.get('salvage'), 'entityId', 'salvage deep-link resolves via entityId');
  });
});
