import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createOverviewDeepLinks } from '../../src/ui/svelte/apps/manager/systemOverviewDeepLinks.js';

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
  'gathering-event-edit',
  'iterative-counters',
  'iterative-action-edit',
]);

// The deep links, built over spies so each `open` is observable without mounting the root.
function buildLinks() {
  const opened = [];
  const spy = (name) => (id) => {
    opened.push([name, id]);
  };
  const factory = createOverviewDeepLinks({
    editRecipe: spy('recipe'),
    editEnvironment: spy('environment'),
    editComponent: spy('component'),
    openCounter: spy('counter'),
    openAction: spy('action'),
  });
  return { ...factory, opened };
}

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
    const { links } = buildLinks();
    const mapped = new Map(Object.entries(links).map(([kind, link]) => [kind, link.view]));

    // Every non-`system` kind must be deep-linkable.
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
    // The iterative library issues are tagged `system` and grouped by `entityKind`.
    assert.equal(mapped.get('counter'), 'iterative-counters');
    assert.equal(mapped.get('action'), 'iterative-action-edit');
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
    const { links, selectIssue, opened } = buildLinks();
    assert.equal(links.salvage.view, 'component-edit');
    selectIssue({ kind: 'salvage', entityId: 'ingot' });
    assert.deepEqual(opened, [['component', 'ingot']]);
    // The `system-overview` alias must fold into the `system-edit` page in the root.
    assert.match(
      rootSource,
      /view === 'system-overview'\) return 'system-edit'/,
      'the folded-in overview (aggregator nav.view "system-overview") must resolve to the system-edit page'
    );
  });

  // Regression guard for the UX defect.
  it('carries environmentId for environment-derived issues so the deep-link resolves', () => {
    // The aggregator's environment-issue tagger must include an `environmentId`.
    assert.match(
      aggregatorSource,
      /environmentId,/,
      'tagEnvironmentIssue must carry environmentId on environment-derived issues'
    );

    // The root's environment/task/event deep-links must select by environmentId,
    // not by the record/entity id (which selectEnvironment cannot resolve).
    const { links, selectIssue, opened } = buildLinks();
    const issue = { entityId: 'record', environmentId: 'owner' };
    for (const kind of ['environment', 'task', 'event']) {
      assert.equal(
        links[kind].targetId(issue),
        'owner',
        `the "${kind}" deep-link must resolve through issue.environmentId (the owning environment), not the record id`
      );
      selectIssue({ ...issue, kind });
    }
    assert.deepEqual(
      opened.map(([name]) => name),
      ['environment', 'environment', 'environment']
    );
    assert.ok(opened.every(([, id]) => id === 'owner'));
    // Recipe/salvage still resolve through their own entity id.
    assert.equal(links.recipe.targetId(issue), 'record', 'recipe deep-link resolves via entityId');
    assert.equal(links.salvage.targetId(issue), 'record', 'salvage deep-link resolves via entityId');
  });

  it('opens a Counter or Crafting Action library issue by its entity kind', () => {
    const { selectIssue, opened } = buildLinks();
    selectIssue({ kind: 'system', entityKind: 'counter', entityId: 'heat' });
    selectIssue({ kind: 'system', entityKind: 'action', entityId: 'stoke' });
    assert.deepEqual(opened, [
      ['counter', 'heat'],
      ['action', 'stoke'],
    ]);
  });

  it('gives a system blocker, and a library newer than this build, no link', () => {
    const { links, selectIssue, opened } = buildLinks();
    assert.equal(Object.hasOwn(links, 'system'), false);
    selectIssue({ kind: 'system', entityKind: 'system', entityId: null });
    selectIssue({ kind: 'system', entityId: 'sys' });
    selectIssue({ kind: 'system', entityKind: 'counter', entityId: null });
    selectIssue({ kind: 'unknown', entityId: 'x' });
    selectIssue(null);
    assert.deepEqual(opened, []);
  });
});
