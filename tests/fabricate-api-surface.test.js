/**
 * The published `game.fabricate` surface (issues 1922, 1933). Names are matched against the
 * boot-contract golden, which `tests/bootstrap/fabricate-boot-contract.test.js` holds equal to a real
 * boot; behaviour is driven through the real facade class and the published-surface builders.
 */
import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Fabricate } from '../src/bootstrap/Fabricate.js';
import { createJournalCommandsForFabricate } from '../src/bootstrap/journalOperations.js';
import { bindFabricateGlobal, buildMacroApi } from '../src/bootstrap/publicApi.js';
import { MANAGER_HOOKS, PLAYER_HOOKS } from '../src/config/hooks.js';
import { GatheringLocationService } from '../src/systems/GatheringLocationService.js';
import { GatheringPartyStore } from '../src/systems/GatheringPartyStore.js';
import { GatheringRealmStore } from '../src/systems/GatheringRealmStore.js';
import { JOURNAL_RUN_SOCKET_KIND } from '../src/systems/journalRunCommands.js';
import { managerExtensions } from '../src/ui/managerExtensions.js';
import { playerExtensions } from '../src/ui/playerExtensions.js';
import { CraftingListingBuilder } from '../src/ui/presenters/CraftingListingBuilder.js';
import { RunJournalBuilder } from '../src/ui/presenters/RunJournalBuilder.js';
import { PUBLISHED_COMPONENT_MANIFEST } from '../src/ui/publishedComponentManifest.js';
import { SHIPPED_KINDS } from '../src/ui/publishedComponentProps.js';
import { publishedComponentSeam } from '../src/ui/publishedComponentSeam.js';
import { findMatchingComponent } from '../src/utils/essenceResolver.js';
import { NEVER_ARIA } from './helpers/publishedComponentGate.js';
import { defineStructureContract } from './helpers/structureContract.js';

const GOLDEN = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'fixtures/fabricateBootContract.golden.json'), 'utf8')
);
const DOCUMENTED = readFileSync(resolve(import.meta.dirname, '../docs/api/index.md'), 'utf8');
const SPECIFIED = readFileSync(
  resolve(import.meta.dirname, '../openspec/specs/ui-extension-points/spec.md'),
  'utf8'
);
const COMPONENTS_TABLE_HEADER = '| Component | Version | Root | Props | Rest |';

const member = (name, length) => ({ set: 'prototypeProperties', name, length });
const published = (set, ...names) => names.map((name) => ({ set, name }));

/**
 * Every public name the retired source pins spelled, each in the ONE golden set it belongs to, with
 * the arity a real boot measured. `absent` rows are names that must stay unpublished.
 */
const PUBLIC_MEMBERS = Object.freeze([
  member('deleteRecipe', 1),
  member('craft', 2),
  member('hydrateCraftingRecipe', 0),
  member('getGatheringPartyStore', 0),
  member('getGatheringRealmStore', 0),
  member('getGatheringLocationService', 0),
  member('getGatheringLocationForActor', 0),
  member('setGatheringPartyRealmOverride', 0),
  member('clearGatheringPartyRealmOverride', 0),
  member('revealGatheringRealmForActor', 0),
  member('hideGatheringRealmForActor', 0),
  member('getGatheringRegionStore', 0),
  member('setGatheringPartyRegionOverride', 0),
  member('clearGatheringPartyRegionOverride', 0),
  member('revealGatheringRegionForActor', 0),
  member('hideGatheringRegionForActor', 0),
  member('executeJournalRunCommand', 2),
  member('dismissJournalRun', 1),
  member('getDismissedJournalRunKeys', 1),
  member('getJournalRunAuthorityAvailability', 0),
  member('setupJournalRunAuthority', 0),
  member('reconcileJournalRunAuthority', 1),
  member('getGatheringEnvironmentStore', 0),
  member('getGatheringRunManager', 0),
  member('getGatheringGateAndCheckEvaluator', 0),
  member('listGatheringForActor', 0),
  member('startGatheringAttempt', 0),
  member('getGatheringDropBreakdown', 0),
  ...published('macroApiKeys', 'deleteRecipe', 'craft'),
  ...published(
    'apiKeys',
    'GatheringRealmStore',
    'GatheringRegionStore',
    'GatheringPartyStore',
    'GatheringLocationService',
    'HOOKS',
    'ui'
  ),
  ...published(
    'gatheringKeys',
    'getPartyStore',
    'getRealmStore',
    'getLocationForActor',
    'setPartyRealmOverride',
    'revealRealmForActor'
  ),
  // The engine is module-private: no accessor, and no instance field holding it.
  { set: 'prototypeProperties', name: 'getGatheringEngine', absent: true },
  { set: 'instanceProperties', name: 'gatheringEngine', absent: true },
]);

const nameOf = (row) => (typeof row === 'string' ? row : row.name);

describe('the public member table matches the golden a real boot is held to', () => {
  for (const row of PUBLIC_MEMBERS) {
    it(`${row.set} ${row.absent ? 'omits' : 'publishes'} ${row.name}`, () => {
      const set = GOLDEN[row.set];
      assert.ok(Array.isArray(set) && set.length > 0, `${row.set} is a populated golden set`);
      const found = set.find((entry) => nameOf(entry) === row.name);
      assert.equal(Boolean(found), !row.absent);
      if (row.length !== undefined) assert.equal(found.length, row.length, `${row.name} arity`);
    });
  }
});

describe('every public hook is namespaced, published on the API, and documented', () => {
  for (const [domain, namespace] of [
    ['manager', MANAGER_HOOKS],
    ['player', PLAYER_HOOKS],
  ]) {
    it(`the ${domain} hooks`, () => {
      const names = Object.values(namespace);
      assert.ok(names.length > 0, `expected at least one ${domain} hook`);
      const convention = new RegExp(`^fabricate\\.${domain}\\.[a-z][A-Za-z]*$`);
      for (const name of names) {
        assert.match(name, convention, `${name} follows fabricate.<domain>.<eventCamelCase>`);
        assert.ok(GOLDEN.publicHookNames.includes(name), `${name} is on game.fabricate.api.HOOKS`);
        assert.ok(DOCUMENTED.includes(`\`${name}\``), `${name} should be documented in docs/api`);
      }
    });
  }
});

/** A `game` global for the published-surface builders, returning the recorded socket emits. */
function installPublicGame({ user = { id: 'gm', isGM: true } } = {}) {
  const emitted = [];
  globalThis.game = {
    user,
    users: { activeGM: { id: 'gm' }, get: () => null },
    socket: { emit: (...args) => emitted.push(JSON.parse(JSON.stringify(args))) },
    modules: { get: () => null },
    settings: { get: () => undefined },
  };
  globalThis.foundry = { utils: { randomID: () => 'request-id' } };
  globalThis.Hooks = { callAll: () => true };
  return emitted;
}

/** A facade stand-in whose every member records its call and answers its own name. */
function recordingFacade() {
  const calls = [];
  const facade = new Proxy(
    {},
    {
      get: (target, name) =>
        name in target
          ? target[name]
          : (...args) => {
              calls.push([name, ...args]);
              return name;
            },
    }
  );
  return { facade, calls };
}

/**
 * The docs row a described published component must carry: name, version, root, props and rest.
 * A prop cell notes its kind unless it is `data`, then `required`, then `required when` its guard.
 */
function documentedComponentRow(name, { version, props, rest, root }) {
  const cells = Object.entries(props).map(([key, spec]) => {
    const when = spec.requiredWhen ? `required when \`${spec.requiredWhen}\`` : '';
    const notes = [spec.kind === 'data' ? '' : spec.kind, spec.required ? 'required' : '', when];
    const noted = notes.filter(Boolean).join(', ');
    return noted ? `\`${key}\` (${noted})` : `\`${key}\``;
  });
  const published = cells.join(', ') || '—';
  return `| \`${name}\` | ${version} | \`${root}\` | ${published} | ${rest ? 'yes' : 'no'} |`;
}

/** `api.ui` as a fresh bind publishes it. */
function publishedUi() {
  installPublicGame();
  bindFabricateGlobal(recordingFacade().facade, {});
  return globalThis.game.fabricate.api.ui;
}

/** The docs `### <Name>` sections from the components table to the descriptor section, in order. */
function documentedComponentSections() {
  const start = DOCUMENTED.indexOf(COMPONENTS_TABLE_HEADER);
  const end = DOCUMENTED.indexOf('\n### The descriptor\n', start);
  assert.ok(start !== -1 && end !== -1, 'the table, then the descriptor section');
  return DOCUMENTED.slice(start, end).split(/^### /mu).slice(1);
}

/**
 * Each top-level bullet one component names under the spec's issue 2448, 2451, 2452, 2453, 2454,
 * 2455, 2601, 2644, 2646, 2647, 2652, 2656, 2784 and 2775 headings, by name and in the order the spec
 * states them.
 */
function specifiedComponentGroups() {
  const groups = ['2448', '2451', '2452', '2453', '2454', '2455', '2601', '2644', '2646', '2647', '2652', '2656', '2784', '2775'].flatMap((issue) => {
    const start = SPECIFIED.indexOf(`\n### The issue ${issue} components\n`);
    const end = SPECIFIED.indexOf('\n### ', start + 1);
    assert.ok(start !== -1 && end !== -1, `the issue ${issue} components, then another heading`);
    return SPECIFIED.slice(start, end)
      .split(/^- \*\*/mu)
      .flatMap((group) => {
        const name = /^`(\w+)`\.\*\*\n/u.exec(group)?.[1];
        return name ? [[name, group]] : [];
      });
  });
  return new Map(groups);
}

/** One token for each family of rest name M13 reserves where an entry's rest lands on a control. */
const RESERVED_REST_FAMILIES = Object.freeze([
  '`data-keyboard-focus`',
  '`data-action`',
  '`data-cursor`',
  '`data-tooltip`',
  '`data-validation-focused`',
  '`data-essence-sort-direction`',
]);

/** The kinds whose key opens a line of its entry's spec group: its arguments, or its values. */
const KINDS_A_GROUP_STATES = new Set(['callback', 'aria']);

/** The names `text` spells between `open` and `close` marks, in order. */
const spelledBetween = (text, open, close = open) =>
  [...(text ?? '').matchAll(new RegExp(`${open}([a-z-]+)${close}`, 'gu'))].map(([, name]) => name);

/** The lines of `text` that `key` opens, alone or as "`a` and `b`", past a list marker. */
function linesOpenedBy(text, key) {
  const opening = new RegExp('^\\s*(?:- )?(?:`[^`]+` and )?`' + key + '`', 'u');
  return text.split('\n').filter((line) => opening.test(line));
}

/** The set of every other backticked token on the lines `key` opens: the values stated for it. */
function statedValues(text, key) {
  const tokens = new Set(linesOpenedBy(text, key).flatMap((line) => line.match(/`[^`]+`/gu)));
  tokens.delete(`\`${key}\``);
  return tokens;
}

describe('bindFabricateGlobal publishes the stable namespaces', () => {
  it('re-publishes the SAME extension registries through the init and ready binds', () => {
    installPublicGame();
    const { facade } = recordingFacade();
    bindFabricateGlobal(facade, {});
    const atInit = globalThis.game.fabricate.api;
    bindFabricateGlobal(facade, {});
    const atReady = globalThis.game.fabricate.api;
    for (const registry of [managerExtensions, playerExtensions]) {
      const key = Object.keys(atInit).find((name) => atInit[name] === registry.publicApi);
      assert.ok(key, 'the registry publicApi is on game.fabricate.api');
      assert.equal(atReady[key], registry.publicApi, 'a replay binds the page-session singleton');
    }
    assert.equal(atInit.ui, publishedComponentSeam.publicApi, 'api.ui is the page-session seam');
    assert.equal(atReady.ui, atInit.ui, 'the ready rebind publishes the same api.ui');
  });

  it('publishes exactly the pinned components, each described as pinned with its root and whether it opens an overlay, and documents them', () => {
    installPublicGame();
    bindFabricateGlobal(recordingFacade().facade, {});
    const { ui } = globalThis.game.fabricate.api;
    assert.deepEqual(ui.components, [
      'TierTrack',
      'Avatar',
      'Medallion',
      'FillBar',
      'Meter',
      'BandedBar',
      'StatBox',
      'InfoStrip',
      'Kicker',
      'Chip',
      'Rail',
      'InspectorCard',
      'EmptyState',
      'Notice',
      'Button',
      'StatusToggle',
      'Stepper',
      'SearchField',
      'Select',
      'StageBars',
      'Field',
      'Well',
      'Callout',
      'IconButton',
      'EditorTabs',
      'RadioCardGroup',
      'SegmentedControl',
      'Pagination',
      'IconPicker',
      'ActionMenu',
      'Modal',
      'ListRow',
      'ToggleCard',
    ]);
    const optional = { kind: 'data', required: false };
    const required = { kind: 'data', required: true };
    const requiredText = { kind: 'text', required: true };
    const slot = { kind: 'slot', required: false };
    assert.deepEqual(Object.fromEntries(ui.components.map((name) => [name, ui.describe(name)])), {
      TierTrack: {
        version: 1,
        props: {
          tiers: required,
          currentIndex: optional,
          direction: optional,
          layout: optional,
          ariaLabel: required,
          currentLabel: required,
          reachedLabel: required,
          aheadLabel: required,
          hint: optional,
        },
        rest: true,
        root: 'any',
        overlays: false,
      },
      Avatar: {
        version: 1,
        props: {
          art: optional,
          name: required,
          alt: optional,
          size: optional,
          shape: optional,
          tint: optional,
          icon: optional,
        },
        rest: false,
        root: 'any',
        overlays: false,
      },
      Medallion: {
        version: 1,
        props: {
          art: optional,
          icon: optional,
          size: required,
          alt: optional,
          tint: optional,
          glyph: optional,
          variant: optional,
          tone: optional,
          ink: optional,
        },
        rest: false,
        root: 'any',
        overlays: false,
      },
      FillBar: {
        version: 1,
        props: {
          value: optional,
          tone: optional,
          color: optional,
          shares: optional,
          density: optional,
        },
        rest: true,
        root: 'any',
        overlays: false,
      },
      Meter: {
        version: 1,
        props: {
          value: optional,
          max: optional,
          segments: optional,
          valueText: optional,
          label: required,
        },
        rest: true,
        root: 'any',
        overlays: false,
      },
      BandedBar: {
        version: 1,
        props: { rows: required, direction: optional, density: optional },
        rest: true,
        root: 'any',
        overlays: false,
      },
      StatBox: {
        version: 1,
        props: { value: required, label: required, icon: optional, tone: optional },
        rest: true,
        root: 'any',
        overlays: false,
      },
      InfoStrip: {
        version: 1,
        props: { label: required, facts: required, badge: optional },
        rest: true,
        root: 'any',
        overlays: false,
      },
      Kicker: {
        version: 1,
        props: { as: optional, tone: optional, size: optional, children: requiredText },
        rest: true,
        root: 'any',
        overlays: false,
      },
      Chip: {
        version: 1,
        props: {
          tone: optional,
          density: optional,
          emphasis: optional,
          icon: optional,
          mono: optional,
          struck: optional,
          truncate: optional,
          children: requiredText,
        },
        rest: true,
        root: 'any',
        overlays: false,
      },
      Rail: {
        version: 1,
        props: { label: optional, children: slot },
        rest: true,
        root: 'any',
        overlays: false,
      },
      InspectorCard: {
        version: 1,
        props: { children: slot },
        rest: true,
        root: 'any',
        overlays: false,
      },
      EmptyState: {
        version: 1,
        props: {
          icon: optional,
          title: optional,
          hint: optional,
          compact: optional,
          inline: optional,
          note: optional,
          filtered: optional,
          children: slot,
        },
        rest: true,
        root: 'any',
        overlays: false,
      },
      Notice: {
        version: 1,
        props: {
          tone: optional,
          title: required,
          detail: optional,
          icon: optional,
          action: optional,
          onAction: { kind: 'callback', required: false },
          dismissable: optional,
          dismissLabel: { kind: 'data', required: false, requiredWhen: 'dismissable' },
          onDismiss: { kind: 'callback', required: false, requiredWhen: 'dismissable' },
        },
        rest: true,
        root: 'any',
        overlays: false,
      },
      Button: {
        version: 1,
        props: {
          role: optional,
          fullWidth: optional,
          disabled: optional,
          size: optional,
          icon: optional,
          busy: optional,
          type: optional,
          children: requiredText,
          onclick: { kind: 'callback', required: true },
          'aria-expanded': { kind: 'aria', required: false },
          'aria-describedby': { kind: 'aria', required: false },
        },
        rest: true,
        root: 'any',
        overlays: false,
      },
      StatusToggle: {
        version: 1,
        props: {
          on: required,
          ariaLabel: required,
          semantics: optional,
          onclick: { kind: 'callback', required: true },
          'aria-labelledby': { kind: 'aria', required: false },
          'aria-describedby': { kind: 'aria', required: false },
        },
        rest: true,
        root: 'any',
        overlays: false,
      },
      Stepper: {
        version: 1,
        props: {
          value: required,
          min: optional,
          max: optional,
          step: optional,
          disabled: optional,
          allowUnset: optional,
          fill: optional,
          density: optional,
          placeholder: optional,
          format: optional,
          stops: optional,
          nullLabel: optional,
          ariaLabel: required,
          decrementLabel: required,
          incrementLabel: required,
          onChange: { kind: 'callback', required: true },
        },
        rest: false,
        root: 'any',
        overlays: false,
      },
      SearchField: {
        version: 1,
        props: {
          value: { kind: 'value', required: false },
          onValueChange: { kind: 'callback', required: false },
          placeholder: optional,
          ariaLabel: required,
        },
        rest: true,
        root: 'any',
        overlays: false,
      },
      Select: {
        version: 1,
        props: {
          options: required,
          value: optional,
          onChange: { kind: 'callback', required: true },
          ariaLabel: required,
          placeholder: optional,
          size: optional,
        },
        rest: false,
        root: 'any',
        overlays: true,
      },
      StageBars: {
        version: 1,
        props: { stages: required, currentIndex: optional, numbered: optional, ariaLabel: required },
        rest: true,
        root: 'any',
        overlays: false,
      },
      Field: {
        version: 1,
        props: { as: required, children: slot },
        rest: true,
        root: 'any',
        overlays: false,
      },
      Well: {
        version: 1,
        props: { label: optional, children: slot },
        rest: true,
        root: 'any',
        overlays: false,
      },
      Callout: {
        version: 1,
        props: {
          tone: optional,
          title: optional,
          text: optional,
          icon: optional,
          items: optional,
          actions: slot,
        },
        rest: true,
        root: 'any',
        overlays: false,
      },
      IconButton: {
        version: 1,
        props: {
          icon: required,
          ariaLabel: required,
          role: optional,
          size: optional,
          disabled: optional,
          onclick: { kind: 'callback', required: true },
          'aria-expanded': { kind: 'aria', required: false },
        },
        rest: true,
        root: 'any',
        overlays: false,
      },
      EditorTabs: {
        version: 1,
        props: {
          tabs: required,
          activeTab: optional,
          onSelect: { kind: 'callback', required: true },
          ariaLabel: required,
          idStem: required,
          activePanelOnly: optional,
        },
        rest: true,
        root: 'any',
        overlays: false,
      },
      RadioCardGroup: {
        version: 1,
        props: {
          options: required,
          value: optional,
          onChange: { kind: 'callback', required: true },
          legend: required,
          layout: optional,
          columns: optional,
          disabled: optional,
          disabledOptions: optional,
        },
        rest: true,
        root: 'any',
        overlays: false,
      },
      SegmentedControl: {
        version: 1,
        props: {
          options: required,
          value: optional,
          onChange: { kind: 'callback', required: true },
          ariaLabel: required,
          fill: optional,
          density: optional,
          tone: optional,
          shape: optional,
        },
        rest: true,
        root: 'any',
        overlays: false,
      },
      Pagination: {
        version: 1,
        props: {
          totalCount: required,
          pageSize: required,
          pageIndex: optional,
          pageSizeOptions: required,
          onPageChange: { kind: 'callback', required: true },
          onPageSizeChange: { kind: 'callback', required: true },
          persistent: optional,
          ariaLabel: required,
          navLabel: required,
          previousLabel: required,
          nextLabel: required,
          perPageLabel: required,
          rangeTemplate: required,
          pageTemplate: required,
          density: optional,
        },
        rest: false,
        root: 'any',
        overlays: false,
      },
      IconPicker: {
        version: 1,
        props: {
          value: optional,
          onChange: { kind: 'callback', required: true },
          ariaLabel: required,
          listLabel: required,
          searchLabel: required,
          searchPlaceholder: optional,
          noMatchesText: required,
        },
        rest: false,
        root: 'any',
        overlays: true,
      },
      ActionMenu: {
        version: 1,
        props: {
          items: required,
          ariaLabel: required,
          align: optional,
          onSelect: { kind: 'callback', required: true },
        },
        rest: false,
        root: 'any',
        overlays: true,
      },
      Modal: {
        version: 1,
        props: {
          open: optional,
          title: required,
          subtitle: optional,
          closeLabel: required,
          closeOnOutsideClick: optional,
          trapFocus: optional,
          initialFocus: optional,
          footerLayout: optional,
          onClose: { kind: 'callback', required: true },
          body: slot,
          footer: slot,
        },
        rest: false,
        root: 'any',
        overlays: true,
      },
      ListRow: {
        version: 1,
        props: {
          name: required,
          detail: optional,
          quantity: optional,
          art: optional,
          icon: optional,
          tint: optional,
          tone: optional,
          muted: optional,
          selected: optional,
          disabled: optional,
          onOpen: { kind: 'callback', required: false },
        },
        rest: true,
        root: 'fabricate',
        overlays: false,
      },
      ToggleCard: {
        version: 1,
        props: {
          title: required,
          sub: optional,
          icon: optional,
          on: required,
          semantics: optional,
          onToggle: { kind: 'callback', required: true },
        },
        rest: false,
        root: 'any',
        overlays: false,
      },
    });
    assert.deepEqual(
      Object.keys(ui),
      ['schemaVersion', 'components', 'describe', 'mount', 'load', 'mountMany'],
      'the descriptor a bind publishes, `mountMany` last'
    );
    const start = DOCUMENTED.indexOf(COMPONENTS_TABLE_HEADER);
    assert.ok(start !== -1, 'docs/api/index.md carries the published-components table');
    const end = DOCUMENTED.indexOf('\n\n', start);
    const rows = DOCUMENTED.slice(start, end === -1 ? undefined : end).trimEnd().split('\n').slice(2);
    assert.deepEqual(
      rows,
      ui.components.map((name) => documentedComponentRow(name, ui.describe(name))),
      'one documented row per published component, in publication order, with all five cells'
    );
  });

  it('gives each published component its own docs section, each prop opening a sentence', () => {
    const ui = publishedUi();
    const sections = documentedComponentSections();
    assert.deepEqual(
      sections.map((section) => section.slice(0, section.indexOf('\n'))),
      ui.components,
      'one section per published component, in publication order, and no other'
    );
    for (const [index, name] of ui.components.entries()) {
      for (const key of Object.keys(ui.describe(name).props)) {
        assert.ok(
          linesOpenedBy(sections[index], key).length > 0,
          `### ${name} opens a sentence with \`${key}\``
        );
      }
    }
  });

  it('states the same values for each key in its docs section as in its spec group', () => {
    const ui = publishedUi();
    const sections = documentedComponentSections();
    const groups = specifiedComponentGroups();
    assert.deepEqual(
      [...groups.keys()],
      ui.components.filter((name) => name !== 'TierTrack'),
      'one group per component but TierTrack, which the design-system capability states'
    );
    for (const [name, group] of groups) {
      const { props } = ui.describe(name);
      const keys = Object.keys(props);
      const valuesIn = (text) =>
        Object.fromEntries(keys.map((key) => [key, statedValues(text, key)]));
      for (const key of keys) {
        if (!KINDS_A_GROUP_STATES.has(props[key].kind)) continue;
        assert.ok(
          linesOpenedBy(group, key).length > 0,
          `the ${name} group opens a line with \`${key}\`, where its arguments or values are stated`
        );
      }
      const specified = valuesIn(group);
      assert.ok(
        Object.values(specified).some((values) => values.size > 0),
        `the ${name} group states a value`
      );
      assert.deepEqual(
        valuesIn(sections[ui.components.indexOf(name)]),
        specified,
        `### ${name} in docs/api/index.md against its spec group`
      );
    }
  });

  it('states the one exception to a content slot’s gap, the normal flow Well’s group and docs section state', () => {
    const exception = (text) =>
      text
        .split('\n')
        .filter((line) => line.startsWith("A host spaces a content slot's children by `gap`"));
    for (const [where, text, whole] of [
      [
        'the spec',
        SPECIFIED,
        "A host spaces a content slot's children by `gap`, except where its group states it draws them in normal flow, as `Well` does; the companion then fills that slot with one element of its own that lays out its content.",
      ],
      [
        'the docs',
        DOCUMENTED,
        "A host spaces a content slot's children by `gap`, except where its section states it draws them in normal flow, as [`Well`](#well) does; you then fill that slot with one element of your own that lays out its content.",
      ],
    ]) {
      assert.deepEqual(exception(text), [whole], `${where} states it once, tail and all`);
    }
    const flowed = (entries) =>
      entries
        .filter(([, prose]) => /\bin (?:the )?normal flow\b/u.test(prose))
        .map(([name]) => name);
    assert.deepEqual(flowed([...specifiedComponentGroups()]), ['Well'], 'one spec group');
    const sections = documentedComponentSections().map((section) => [
      section.slice(0, section.indexOf('\n')),
      section,
    ]);
    assert.deepEqual(flowed(sections), ['Well'], 'and one docs section');
  });

  it('states every value the spec names for an interactive component under Ownership and theme', () => {
    const between = (text, from, to) => {
      const start = text.indexOf(from);
      const end = text.indexOf(to, start + 1);
      assert.ok(start !== -1 && end !== -1, `${from.trim()}, then ${to.trim()}`);
      return text.slice(start, end);
    };
    const specified = between(SPECIFIED, '\n### Interactive components\n', '\n### ');
    const documented = between(DOCUMENTED, '\n### Ownership and theme\n', '\n## Data Persistence\n');
    const tokens = [...new Set(specified.match(/`[^`]+`/gu))];
    assert.ok(tokens.length > 15, 'the spec states its interactive rule in backticked values');
    // The docs write a root bare, as their components table does, where the spec quotes it.
    const stated = (token) =>
      documented.includes(token) || documented.includes(token.replaceAll("'", ''));
    assert.deepEqual(
      tokens.filter((token) => !stated(token)),
      [],
      'each value the spec names for a control is named in the docs'
    );
    assert.ok(
      !documented.includes('non-interactive'),
      'the docs no longer say a published component is non-interactive'
    );
  });

  it('spells the shipped prop kinds alike in the kinds table, the spec and the docs', () => {
    const kinds = Object.keys(SHIPPED_KINDS);
    const shapes = [...SPECIFIED.matchAll(/\{ kind: ('[a-z]+'(?: \| '[a-z]+')+), required/gu)];
    assert.deepEqual(
      shapes.map(([, union]) => spelledBetween(union, "'")),
      [kinds, kinds],
      'the described shape and the manifest shape, in the spec'
    );
    const refusing = /`kind` outside the shipped set, (.+?), with an `Error`/u.exec(SPECIFIED);
    assert.ok(refusing, 'the spec sentence that refuses a `kind` outside the shipped set');
    const [, refused] = refusing;
    assert.deepEqual(spelledBetween(refused, "`'", "'`"), kinds, 'what registration admits');
    const listing = /^A prop's `kind` is (.+)\.$/mu.exec(DOCUMENTED);
    assert.ok(listing, 'the docs sentence that opens "A prop’s `kind` is"');
    const [, sentence] = listing;
    assert.deepEqual(spelledBetween(sentence, '`'), kinds, 'the docs’ kinds sentence');
  });

  it('holds the gate’s never-published ARIA names to the line of the spec and of the docs that spells them', () => {
    const stating = (text) =>
      text.split('\n').filter((line) => line.endsWith(' are never published as one.'));
    const lines = stating(SPECIFIED);
    assert.equal(lines.length, 1, 'one spec line says what is never an aria key');
    assert.deepEqual(spelledBetween(lines[0], '`'), [...NEVER_ARIA]);
    assert.deepEqual(stating(DOCUMENTED), lines, 'and the docs spell the same line');
  });

  it('states the reserved rest names, their refusal and an aria key’s in the spec’s M13 row and the docs’ mounting section', () => {
    const row = SPECIFIED.split('\n').filter((line) => line.startsWith('| M13 |'));
    assert.equal(row.length, 1, 'one M13 row');
    const from = DOCUMENTED.indexOf('\n### Mounting, updating and destroying\n');
    const to = DOCUMENTED.indexOf('\n### ', from + 1);
    assert.ok(from !== -1 && to !== -1, 'the mounting section, then another heading');
    const stated = [
      'is reserved on <name>',
      'must be a string, number or boolean',
      ...RESERVED_REST_FAMILIES,
      '`data-tooltip-`',
      '`data-locked`',
    ];
    for (const [where, prose] of [
      ['the spec’s M13 row', row[0]],
      ['### Mounting, updating and destroying', DOCUMENTED.slice(from, to)],
    ]) {
      assert.deepEqual(
        stated.filter((token) => !prose.includes(token)),
        [],
        `${where} states each reserved name and the tail that refuses it`
      );
    }
  });

  it('states mountMany’s M21 tail in the spec’s row and, with M5 and M19, in the docs’ subsection', () => {
    const tail = (id) => {
      const rows = SPECIFIED.split('\n').filter((line) => line.startsWith(`| ${id} |`));
      assert.equal(rows.length, 1, `one ${id} row`);
      return /`([^`]+)` \|$/u.exec(rows[0])[1];
    };
    assert.equal(tail('M21'), 'items must be an array');
    const from = DOCUMENTED.indexOf('\n### Mounting several at once\n');
    const to = DOCUMENTED.indexOf('\n### ', from + 1);
    assert.ok(from !== -1 && to !== -1, 'the mountMany subsection, then another heading');
    const prose = DOCUMENTED.slice(from, to);
    assert.deepEqual(
      ['M5', 'M19', 'M21'].map(tail).filter((stated) => !prose.includes(`\`${stated}\``)),
      [],
      'the subsection states each tail mountMany adds to or repeats from mount'
    );
    assert.ok(prose.includes("`typeof fabUi.mountMany === 'function'`"), 'and how to detect it');
  });

  it('spells the descriptor’s members, in publication order, as the spec and the docs do', () => {
    const [, ...members] = Object.keys(publishedUi());
    const descriptor = `{ schemaVersion: 1, ${members.join(', ')} }`;
    for (const [where, prose] of [
      ['the spec', SPECIFIED],
      ['the docs', DOCUMENTED],
    ]) {
      const stated = [...prose.matchAll(/ is a frozen `(\{ schemaVersion: 1[^`]*\})`/gu)];
      assert.deepEqual(
        stated.map(([, spelled]) => spelled),
        [descriptor],
        `${where} spells the descriptor once, with every member`
      );
    }
  });

  it('names every reserved family in the spec group and the docs section of each entry whose rest lands on a control, and data-locked exactly where its control carries a tooltip', () => {
    const entries = PUBLISHED_COMPONENT_MANIFEST.filter((entry) => entry.restOn === 'control');
    assert.ok(entries.length > 0, 'an entry states restOn');
    assert.ok(
      entries.some((entry) => entry.tooltip === true),
      'and one states tooltip'
    );
    const groups = specifiedComponentGroups();
    const sections = documentedComponentSections();
    for (const { name, tooltip } of entries) {
      const section = sections.find((candidate) => candidate.startsWith(`${name}\n`));
      for (const [where, prose] of [
        [`the ${name} group`, groups.get(name) ?? ''],
        [`### ${name}`, section ?? ''],
      ]) {
        assert.deepEqual(
          RESERVED_REST_FAMILIES.filter((token) => !prose.includes(token)),
          [],
          `${where} is where a companion learns the names it reserves`
        );
        assert.equal(prose.includes('`data-locked`'), tooltip === true, `${where}: data-locked`);
      }
    }
  });

  it('publishes the canonical realm classes and the deprecated alias as the same class', () => {
    installPublicGame();
    bindFabricateGlobal(recordingFacade().facade, {});
    const { api } = globalThis.game.fabricate;
    assert.equal(api.GatheringRealmStore, GatheringRealmStore);
    assert.equal(api.GatheringRegionStore, GatheringRealmStore);
    assert.equal(api.GatheringPartyStore, GatheringPartyStore);
    assert.equal(api.GatheringLocationService, GatheringLocationService);
  });

  const GATHERING_DELEGATES = [
    ['getPartyStore', 'getGatheringPartyStore'],
    ['getRealmStore', 'getGatheringRealmStore'],
    ['getLocationForActor', 'getGatheringLocationForActor'],
    ['setPartyRealmOverride', 'setGatheringPartyRealmOverride'],
    ['revealRealmForActor', 'revealGatheringRealmForActor'],
  ];
  for (const [helper, target] of GATHERING_DELEGATES) {
    it(`gathering.${helper} forwards to ${target}`, () => {
      installPublicGame();
      const { facade, calls } = recordingFacade();
      bindFabricateGlobal(facade, {});
      const options = { systemId: 'sys' };
      globalThis.game.fabricate.gathering[helper](options);
      assert.deepEqual(
        calls.at(-1),
        helper.startsWith('get') && helper.endsWith('Store') ? [target] : [target, options]
      );
    });
  }
});

describe('the macro helpers delegate through game.fabricate', () => {
  for (const [helper, args] of [
    ['deleteRecipe', ['recipe-1']],
    ['craft', [{ id: 'actor' }, 'recipe-1', { interactive: false }]],
  ]) {
    it(`fabricate.${helper}`, async () => {
      installPublicGame();
      const { facade, calls } = recordingFacade();
      globalThis.game.fabricate = facade;
      await buildMacroApi({})[helper](...args);
      assert.deepEqual(calls, [[helper, ...args]]);
    });
  }
});

/** The real facade, ready, over the collaborators one question needs. */
function readyFacade(collaborators = {}) {
  return Object.assign(new Fabricate(), { ready: true, ...collaborators });
}

describe('the real facade routes each public member to its collaborator', () => {
  it('deleteRecipe routes through the cascading CraftingSystemManager.deleteRecipes', async () => {
    const deleted = [];
    const facade = readyFacade({
      recipeManager: { getRecipe: (id) => ({ id, craftingSystemId: 'sys-1' }) },
      craftingSystemManager: { deleteRecipes: async (...args) => deleted.push(args) },
    });
    await facade.deleteRecipe('recipe-1');
    assert.deepEqual(deleted, [['sys-1', ['recipe-1']]]);
  });

  it('getGatheringRegionStore forwards to the realm store', () => {
    const realmStore = { kind: 'realms' };
    assert.equal(
      readyFacade({ gatheringRealmStore: realmStore }).getGatheringRegionStore(),
      realmStore
    );
  });

  it('the crafting listing builder resolves held items with the shared component resolver', () => {
    assert.equal(
      readyFacade()._getCraftingListingBuilder()._resolveComponentForItem,
      findMatchingComponent
    );
  });

  it('hydrateCraftingRecipe answers through the builder detail phase for the resolved actor', () => {
    const actor = { id: 'actor-1' };
    globalThis.game = {
      user: { id: 'gm', isGM: true },
      actors: { get: (id) => (id === actor.id ? actor : null) },
    };
    const facade = readyFacade();
    const details = [];
    facade._craftingListingBuilder = {
      buildRecipeDetail: (request) => details.push(request) && 'detail',
    };
    assert.equal(
      facade.hydrateCraftingRecipe({
        recipeId: 'recipe-1',
        actorId: 'actor-1',
        componentSourceActorIds: [],
      }),
      'detail'
    );
    assert.equal(details[0].recipeId, 'recipe-1');
    assert.equal(details[0].craftingActor, actor);
    assert.equal(details[0].viewer, globalThis.game.user);
  });

  // Issue 2265: a station is per call, so it gets its own builder over a presence view and the
  // cached builder never sees it; a recording manager answers the station its Tool consult saw.
  it('builds station detail and Journal listings over a per-call presence view', () => {
    const actor = { id: 'actor-1' };
    const actors = { get: (id) => (id === actor.id ? actor : null) };
    Object.assign(globalThis, { game: { user: { id: 'gm', isGM: true }, actors } });
    const recipeManager = {
      resolveToolStates: (_recipe, _tools, _actors, options) => options?.presentTools ?? null,
    };
    const facade = readyFacade({ recipeManager });
    facade._resolveJournalActor = () => actor;
    const built = [];
    const spies = [
      [CraftingListingBuilder.prototype, 'buildRecipeDetail'],
      [RunJournalBuilder.prototype, 'buildListing'],
    ].map(([prototype, method]) => {
      const original = prototype[method];
      prototype[method] = function record() {
        built.push(this);
        return method;
      };
      return () => (prototype[method] = original);
    });
    const station = { systemId: 'smithing', componentIds: [], toolIds: ['anvil'] };
    try {
      for (const presentTools of [station, null]) {
        const sources = { actorId: actor.id, componentSourceActorIds: [] };
        facade.hydrateCraftingRecipe({ ...sources, recipeId: 'recipe-1', presentTools });
        facade.listJournalForActor({ rememberedActorId: actor.id, presentTools });
      }
    } finally {
      for (const restore of spies) restore();
    }
    const consulted = (builder) =>
      (builder.recipeManager ?? builder._recipeManager).resolveToolStates(null, [], []);
    assert.deepEqual(built.slice(0, 2).map(consulted), [station, station]);
    assert.deepEqual(built.slice(2).map(consulted), [null, null]);
    assert.equal(built[2], facade._getCraftingListingBuilder(), 'no station keeps the cached builder');
    assert.equal(built[3], facade._getRunJournalBuilder());
    assert.notEqual(built[0], built[2]);
    assert.equal(facade.recipeManager, recipeManager);
  });

  it('craftRecipe and advanceCraftingRun hand the station to craft, never altered', async () => {
    const actor = { id: 'actor-1', uuid: 'Actor.actor-1', isOwner: true };
    const actors = { get: (id) => (id === actor.id ? actor : null) };
    Object.assign(globalThis, { game: { user: { id: 'gm', isGM: true }, actors } });
    const run = { id: 'run-1', recipeId: 'recipe-1', componentSourceActorUuids: [] };
    const facade = readyFacade({
      craftingRunManager: { getActiveRun: () => run },
    });
    const crafted = [];
    facade.craft = async (...args) => {
      crafted.push(args);
    };
    const station = { systemId: 'smithing', componentIds: [], toolIds: ['anvil'] };
    const craft = { actorId: actor.id, componentSourceActorIds: [], recipeId: 'recipe-1' };
    await facade.craftRecipe({ ...craft, presentTools: station });
    await facade.advanceCraftingRun({ actorId: actor.id, runId: run.id, presentTools: station });
    await facade.craftRecipe(craft);
    assert.deepEqual(
      crafted.map((args) => args[2].presentTools),
      [station, station, null]
    );
  });

  it('craft starts a versioned run on the live engine and executes it with the caller options', async () => {
    globalThis.game = { user: { id: 'gm', isGM: true } };
    const started = [];
    const executed = [];
    const facade = readyFacade({
      recipeManager: { getRecipe: (id) => ({ id }) },
      craftingEngine: {
        craft: async (...args) => {
          started.push(args);
          return {
            success: true,
            requiresExecution: true,
            canExecuteImmediately: true,
            runId: 'run-1',
          };
        },
      },
      journalRunCommands: {
        executeJournalRunCommand: async (...args) => {
          executed.push(args);
          return { success: true };
        },
      },
    });
    const actor = { id: 'actor-1', uuid: 'Actor.actor-1' };

    await facade.craft(actor, 'recipe-1', { interactive: true });

    assert.equal(started[0][0], actor);
    assert.equal(started[0][4].lifecycleVersion, 1, 'a new public craft starts a versioned run');
    assert.equal(executed[0][0].runId, 'run-1');
    assert.deepEqual(
      executed[0][1],
      { interactive: true },
      'the options reach the command service'
    );
  });
});

describe('the location API no-ops when realms are disabled for the system', () => {
  const REALMS_OFF = { id: 'sys-off', gatheringRealmSettings: { enabled: false } };
  const REALMS_ON = { id: 'sys-on', gatheringRealmSettings: { enabled: true } };

  /** A GM facade over one system, recording every write; the actor has discovered `realm-seen`. */
  function locationFacade() {
    const writes = [];
    const actor = {
      id: 'actor-1',
      getFlag: (scope, key) =>
        key === 'fabricate.discoveredGatheringRealms'
          ? { 'realm-seen': { discoveredAt: 1, source: 'manual' } }
          : undefined,
      setFlag: async (...args) => writes.push(['setFlag', ...args]),
    };
    globalThis.game = { user: { id: 'gm', isGM: true }, actors: { get: () => actor } };
    const facade = readyFacade({
      craftingSystemManager: {
        getSystem: (id) => [REALMS_OFF, REALMS_ON].find((system) => system.id === id),
      },
      gatheringLocationService: { buildCurrentRealmContext: () => writes.push(['context']) },
      gatheringPartyStore: {
        setCurrentRealmOverride: () => writes.push(['setOverride']),
        clearCurrentRealmOverride: () => writes.push(['clearOverride']),
      },
      gatheringRealmStore: { get: () => ({ realms: [{ id: 'realm-1' }] }) },
    });
    return { facade, writes };
  }

  const CALLS = [
    [
      'getGatheringLocationForActor',
      (facade, systemId) => facade.getGatheringLocationForActor({ actorId: 'actor-1', systemId }),
      null,
    ],
    [
      'setGatheringPartyRealmOverride',
      (facade, systemId) =>
        facade.setGatheringPartyRealmOverride({ partyId: 'p', systemId, realmIds: ['realm-1'] }),
      null,
    ],
    [
      'clearGatheringPartyRealmOverride',
      (facade, systemId) => facade.clearGatheringPartyRealmOverride({ partyId: 'p', systemId }),
      null,
    ],
    [
      'revealGatheringRealmForActor',
      (facade, systemId) =>
        facade.revealGatheringRealmForActor({ actorId: 'actor-1', systemId, realmId: 'realm-1' }),
      false,
    ],
    [
      'hideGatheringRealmForActor',
      (facade, systemId) =>
        facade.hideGatheringRealmForActor({ actorId: 'actor-1', systemId, realmId: 'realm-seen' }),
      false,
    ],
  ];
  for (const [name, call, disabledAnswer] of CALLS) {
    it(`${name} answers ${disabledAnswer} and writes nothing, then acts once enabled`, async () => {
      const off = locationFacade();
      assert.equal(await call(off.facade, REALMS_OFF.id), disabledAnswer);
      assert.deepEqual(off.writes, []);
      const on = locationFacade();
      await call(on.facade, REALMS_ON.id);
      assert.ok(on.writes.length > 0, `${name} acts when enabled`);
    });
  }

  it('reveal validates the realm against the WORLD travel library', async () => {
    const { facade, writes } = locationFacade();
    const reveal = (realmId) =>
      facade.revealGatheringRealmForActor({ actorId: 'actor-1', systemId: REALMS_ON.id, realmId });
    assert.equal(await reveal('realm-unknown'), false);
    assert.deepEqual(writes, [], 'an unknown realm writes no discovery');
    assert.equal(await reveal('realm-1'), true);
  });
});

test('the Journal composition emitter survives socket serialization with its options bag', async () => {
  const emitted = installPublicGame({ user: { id: 'player', isGM: false } });
  const service = createJournalCommandsForFabricate({
    craftingEngine: { installVersionedRunAuthority: () => {} },
  });
  const command = {
    actorUuid: 'Actor.a',
    runType: 'crafting',
    runId: 'run-1',
    expectedRevision: 1,
    action: 'execute',
    payload: {},
  };

  const answer = service.executeJournalRunCommand(command, { interactive: false });
  const [[channel, request, options]] = emitted;
  service.handleSocketMessage(
    {
      ...command,
      kind: JOURNAL_RUN_SOCKET_KIND.REPLY,
      recipientId: 'player',
      sessionId: request.sessionId,
      requestId: request.requestId,
      response: { success: true },
    },
    'gm'
  );

  assert.equal(channel, 'module.fabricate');
  assert.equal(request.kind, JOURNAL_RUN_SOCKET_KIND.REQUEST);
  // Core's `handleCustomSocket` destructures this argument: a default covers omission, but cannot
  // cover `undefined` serialized as an array `null`.
  assert.deepEqual(options, {}, 'an absent options bag is emitted as {}, never undefined');
  assert.deepEqual(await answer, { success: true });
});

// The GM's reply emits `{ recipients }` behind the authority's claim, which no ledger-free test reaches.
defineStructureContract(
  'the composition emitter forwards its options bag',
  { file: 'src/bootstrap/journalOperations.js', fn: 'createJournalCommandsForFabricate', property: 'emit' },
  { callsWith: [['emit', 'options']] }
);

// The start handler runs behind the authority's claim, which no boot reaches without a ledger.
defineStructureContract(
  'the crafting start handler passes the socket-attested sender as the viewer',
  { file: 'src/bootstrap/journalOperations.js', fn: 'buildRunStartOperations', property: 'start' },
  { callsWith: [['call', 'sender']], keys: ['viewer'] }
);
