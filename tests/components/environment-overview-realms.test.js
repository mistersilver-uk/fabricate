import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import { createClassComponent } from '../../node_modules/svelte/src/legacy/legacy-client.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  createSvelteCompiler,
  installComponentTestGlobals
} from '../helpers/svelte-component-harness.js';
import {
  assertSelectHasResolvedName,
  chooseSelectOption,
  closeSelectPanel,
  selectOptionValues,
  selectTriggerText
} from '../helpers/select-control.js';

// The primitive's sentinel id, spelled as every driving suite spells it; `select-mounted.test.js`
// pins the spelling against `Select.svelte`.
const UNCHANGED_OPTION_ID = '__unchanged__';

// The two add controls share the chip row's focus-fallback hook rather than carrying one of their
// own, so the trigger class is what tells them apart from the row inside their own field.
const ADD_TRIGGER = '.fabricate-select-trigger[data-chip-remove-fallback]';
const DANGER_TRIGGER = '.fabricate-select-trigger[data-environment-field="dangerLevel"]';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let EnvironmentOverviewTab;
let mounted;
let target;

const { writeCompiledSvelte, writeRawModule } = createSvelteCompiler(repoRoot, () => tempRoot);

function baseProps(overrides = {}) {
  return {
    environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: [], includedRealmIds: [] },
    realmRecords: [],
    realmsEnabled: false,
    biomeOptions: [],
    dangerOptions: [],
    linkedSceneImage: '',
    onPickImagePath: null,
    onUpdate: () => {},
    onSetCompositionMode: () => {},
    ...overrides
  };
}

async function mountTab(props) {
  target = document.createElement('div');
  // The portal host: without this class a converted panel lands on `<body>`.
  target.className = 'fabricate-manager';
  document.body.appendChild(target);
  let environment = props.environment;
  mounted = createClassComponent({ component: EnvironmentOverviewTab, target, props: {
    ...props,
    onUpdate: (patch) => {
      props.onUpdate(patch);
      environment = { ...environment, ...patch };
      mounted.$set({ environment });
    }
  } });
  flushSync();
  await tick();
  flushSync();
}

function remount() {
  if (mounted) { mounted.$destroy(); mounted = null; }
  target?.remove();
}

describe('EnvironmentOverviewTab multi-realm selector', () => {
  before(async () => {
    setupDOM();
    installComponentTestGlobals();

    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-env-overview-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    // The popover closure rides in because all three pickers are `<Select>`s as of issue 1510.
    for (const modulePath of SEARCHABLE_POPOVER_RAW_MODULES) writeRawModule(modulePath);
    writeRawModule('src/gatheringImageDefaults.js');
    writeRawModule('src/ui/svelte/util/gatheringFormat.js');
    writeRawModule('src/ui/svelte/apps/manager/environment/environmentSelectOptions.js');
    writeCompiledSvelte('src/ui/svelte/components/StatusToggle.svelte');
    // The realm and biome rows render the shared chip as of issue 1515, and their add controls plus
    // the danger picker render the shared `<Select>` as of issue 1510. A `.svelte` this tree
    // renders but this list omits does not FAIL this suite - the temp tree dies on
    // ERR_MODULE_NOT_FOUND and node reports every test here as `# cancelled`.
    // Spelled out, not spread: `mounted-harness-primitive-allowlist.test.js` reads the literals.
    writeCompiledSvelte('src/ui/svelte/components/Select.svelte');
    writeCompiledSvelte('src/ui/svelte/components/SearchablePopover.svelte');
    writeCompiledSvelte('src/ui/svelte/components/ManagerButton.svelte');
    writeCompiledSvelte('src/ui/svelte/components/Chip.svelte');
    writeCompiledSvelte('src/ui/svelte/components/Field.svelte');
    writeCompiledSvelte('src/ui/svelte/components/EmptyState.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/environment/CompositionModeControl.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/environment/EnvironmentOverviewTab.svelte');
    const mod = await import(pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/environment/EnvironmentOverviewTab.svelte.js')).href);
    EnvironmentOverviewTab = mod.default;
  });

  after(() => {
    if (mounted) mounted.$destroy();
    target?.remove();
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('hides the realm field entirely when the Travel & Realms toggle is off', async () => {
    await mountTab(baseProps({ realmsEnabled: false, realmRecords: [{ id: 'r1', name: 'Verdant' }] }));
    assert.equal(target.querySelector('[data-environment-field="includedRealmIds"]'), null, 'realm field is hidden when disabled');
    // The legacy single-region <select> must not appear either.
    assert.equal(target.querySelector('[data-environment-field="region"]'), null, 'legacy single-region select is removed');
    remount();
  });

  it('shows an empty-state hint pointing to the Travel tab when enabled but no realms exist', async () => {
    await mountTab(baseProps({ realmsEnabled: true, realmRecords: [] }));
    const field = target.querySelector('[data-environment-field="includedRealmIds"]');
    assert.ok(field, 'realm field renders when enabled');
    assert.ok(target.querySelector('[data-environment-realm-empty]'), 'empty-state hint renders');
    assert.ok(
      !field.querySelector('.fabricate-select-trigger'),
      'no add control at all when there are no realms'
    );
    remount();
  });

  for (const [kind, property, fieldSelector, options] of [
    ['realm', 'includedRealmIds', '[data-environment-field="includedRealmIds"]', ['r1', 'r2']],
    ['biome', 'biomes', '.manager-environment-context-biomes', ['forest', 'desert']]
  ]) it(`reflects ${kind} additions and removals from empty to chips and back`, async () => {
    const updates = [];
    await mountTab(baseProps({
      realmsEnabled: true,
      realmRecords: [
        { id: 'r1', name: 'Verdant' },
        { id: 'r2', name: 'Dunes' }
      ],
      biomeOptions: [{ id: 'forest', label: 'Forest' }, { id: 'desert', label: 'Desert' }],
      onUpdate: (patch) => updates.push(patch)
    }));

    const field = target.querySelector(fieldSelector);
    const trigger = `${fieldSelector} ${ADD_TRIGGER}`;
    const empty = () => field.querySelector('.manager-empty.is-inline.is-field');
    const pills = () => field.querySelectorAll(`[data-environment-${kind}-pill]`);
    // What the picker offers, opened and closed again; the sentinel row is not a member.
    const available = () => {
      const values = selectOptionValues(target, trigger).filter((value) => value !== UNCHANGED_OPTION_ID);
      closeSelectPanel(target, trigger);
      return values;
    };
    assert.ok(empty(), 'starts with a field-sized empty state');
    assert.equal(empty().textContent.trim(), `No ${kind}s selected`);
    assert.equal(
      assertSelectHasResolvedName(target, trigger),
      `Add ${kind}`,
      'the add control keeps the name its native select announced'
    );
    assert.deepEqual(available(), options);
    // The sentinel row is the picker's own name sitting in the list, not a member: choosing it
    // must write nothing. Without this the add handlers' `if (!id) return;` guard is unproven and
    // its loss would persist an empty-string member - a chip with no label, matching nothing.
    chooseSelectOption(target, trigger, UNCHANGED_OPTION_ID);
    await tick();
    flushSync();
    assert.equal(updates.length, 0, 'the sentinel row is the picker name, not a member to add');
    assert.equal(pills().length, 0, 'and it adds no chip');
    for (const [index, id] of options.entries()) {
      chooseSelectOption(target, trigger, id);
      await tick();
      flushSync();
      assert.deepEqual(updates.at(-1), { [property]: options.slice(0, index + 1) });
      assert.equal(pills().length, index + 1);
      assert.ok(!empty(), 'selection replaces the placeholder');
      if (index < options.length - 1) {
        // The picker rests on the sentinel rather than on what was just added, so the trigger
        // reads its own name again - the resting face the native select had.
        assert.equal(
          selectTriggerText(target, trigger),
          `Add ${kind}`,
          'the picker resets to its sentinel'
        );
        assert.deepEqual(available(), options.slice(index + 1));
      }
    }
    assert.ok(
      !target.querySelector(trigger),
      'with every member selected the add control is gone, so there is nothing left to offer'
    );
    for (const [index, id] of options.entries()) {
      field.querySelector(`[data-environment-${kind}-pill="${id}"] [data-chip-remove]`).click();
      await tick();
      flushSync();
      assert.deepEqual(updates.at(-1), { [property]: options.slice(index + 1) });
      assert.equal(pills().length, options.length - index - 1);
      assert.equal(Boolean(empty()), index === options.length - 1);
      if (index === options.length - 1) {
        // The fallback ladder's OTHER end (issue 1515). The exhausted end - no chip, no add control,
        // focus held by the row - is gated below; this is the end where the add control is back on
        // screen because a member is free again, so the hook `Chip` resolves outward is the TRIGGER.
        // Without this the outward search could stop resolving to the button and nothing would fail.
        assert.ok(
          document.activeElement?.matches(ADD_TRIGGER),
          `focus landed on the add control, got ${document.activeElement?.tagName}.${document.activeElement?.className}`
        );
      }
    }
    assert.deepEqual(available(), options);
    assert.equal(empty().textContent.trim(), `No ${kind}s selected`);
    assert.equal(field.querySelector(`[data-environment-${kind}-status]`).textContent.trim(), `No ${kind}s selected`);
    remount();
  });

  it('writes the danger ceiling the GM picks, under the key the editor persists', async () => {
    // The one site whose wrapper demoted (issue 1510): a `<Field as="label">` named its trigger
    // by containment, with the caption and the hint sentence after it.
    const updates = [];
    await mountTab(baseProps({
      dangerOptions: [{ id: 'safe', label: 'Camp safe' }, { id: 'hazardous', label: 'Rough going' }],
      environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: [], includedRealmIds: [], dangerLevel: 'safe' },
      onUpdate: (patch) => updates.push(patch)
    }));

    const trigger = target.querySelector(DANGER_TRIGGER);
    assert.ok(Boolean(trigger), 'the danger ceiling renders the shared picker');
    assert.equal(
      assertSelectHasResolvedName(target, DANGER_TRIGGER),
      'Danger level',
      'the caption names the trigger by id, and the hint paragraph is no longer part of the name'
    );
    assert.ok(
      !trigger.closest('label'),
      'a `<label>` would forward a caption click into a control that cannot be closed from it'
    );
    // The hint the `<label>` used to contribute to the name is reattached as a DESCRIPTION, so the
    // ceiling sentence is still announced; without the referrer it is announced by nothing.
    const described = (trigger.getAttribute('aria-describedby') ?? '').trim();
    assert.ok(described.length > 0, 'the danger trigger carries no `aria-describedby` at all');
    const hint = target.ownerDocument.getElementById(described);
    assert.ok(
      Boolean(hint),
      `the danger trigger points \`aria-describedby\` at "${described}", which names no element`
    );
    assert.match(
      hint.textContent.replaceAll(/\s+/gu, ' ').trim(),
      /up to and including this level/u,
      'and the element it names is the ceiling hint, not the caption'
    );
    assert.equal(trigger.querySelector('.fabricate-select-value').textContent.trim(), 'Camp safe');

    chooseSelectOption(target, DANGER_TRIGGER, 'hazardous');
    await tick();
    flushSync();
    assert.deepEqual(updates.at(-1), { dangerLevel: 'hazardous' });
    remount();
  });

  it('announces the set each editable row now holds, which the chip primitive cannot do for it', async () => {
    // THE LIVE REGION IS THE CALLER'S.
    await mountTab(baseProps({
      realmsEnabled: true,
      realmRecords: [{ id: 'r1', name: 'Verdant' }, { id: 'r2', name: 'Dunes' }],
      environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: [], includedRealmIds: ['r1', 'r2'] }
    }));
    const both = target.querySelector('[data-environment-realm-status]');
    assert.ok(Boolean(both), 'the realm row books a live region');
    assert.equal(both.getAttribute('aria-live'), 'polite');
    assert.ok(both.classList.contains('visually-hidden'), 'the summary is for the screen reader, not the screen');
    assert.equal(both.textContent.trim(), 'Verdant and Dunes');
    remount();

    // The same row with one member taken out: the region names what SURVIVES.
    await mountTab(baseProps({
      realmsEnabled: true,
      realmRecords: [{ id: 'r1', name: 'Verdant' }, { id: 'r2', name: 'Dunes' }],
      environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: [], includedRealmIds: ['r1'] }
    }));
    assert.equal(
      target.querySelector('[data-environment-realm-status]').textContent.trim(),
      'Verdant'
    );
    remount();
  });

  it('draws a biome chip in the colour the biome was AUTHORED in, not the one its token names', async () => {
    // THE ONE CLAIM IN THIS ROUTE THAT A READER CANNOT CHECK BY EYE (issue 1515). The chip
    // primitive's `tint` is what arms its tinted face, and it validates BARE `--fab-tag-*` palette
    // keys only — a biome carrying an authored hex has no key to pass. So the view passes both:
    await mountTab(baseProps({
      biomeOptions: [
        { id: 'ashfall', label: 'Ashfall', colorToken: 'mist', customColor: '#AA3311' },
        { id: 'verdant', label: 'Verdant', colorToken: 'sage' }
      ],
      environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: ['ashfall', 'verdant'], includedRealmIds: [] }
    }));

    const authored = target.querySelector('[data-environment-biome-pill="ashfall"]');
    assert.ok(Boolean(authored), 'the authored-colour biome renders a chip');
    assert.ok(authored.classList.contains('has-tint'), 'the chip wears the primitive’s tinted face');
    // happy-dom normalises the attribute by appending the terminating semicolon it was written
    // without, which is why this reads the declaration rather than the whole string.
    assert.ok(
      authored.getAttribute('style').startsWith('--fab-chip-color: #AA3311'),
      `the authored hex reaches the chip, got ${authored.getAttribute('style')}`
    );

    const tokened = target.querySelector('[data-environment-biome-pill="verdant"]');
    assert.ok(Boolean(tokened), 'the token-coloured biome renders a chip');
    assert.ok(
      tokened.getAttribute('style').startsWith('--fab-chip-color: var(--fab-tag-sage)'),
      `an unauthored biome still reads its palette token, got ${tokened.getAttribute('style')}`
    );
    remount();
  });

  it('keeps focus in the row when the LAST chip is removed and no add control is left', async () => {
    // THE LADDER RAN OUT (issue 1515). `Chip` resolves its focus destination BEFORE it removes
    // the chip: the next chip's remove control, else the previous chip's, else the nearest
    // enclosing `[data-chip-remove-fallback]`. This row hung that hook on its add control, which
    // renders only while an UNSELECTED realm remains — so with one realm in the world and that
    // realm selected there was no next chip, no previous chip and no add control, and removing
    // the last chip dropped focus to `<body>`. That is the unfocused-window state (Space pauses
    // the game, the arrows pan the canvas) with the keyboard user stranded at the top of the
    // document. The row itself is the rung that cannot disappear.
    await mountTab(baseProps({
      realmsEnabled: true,
      realmRecords: [{ id: 'r1', name: 'Verdant' }],
      environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: [], includedRealmIds: ['r1'] }
    }));

    const field = target.querySelector('[data-environment-field="includedRealmIds"]');
    assert.ok(
      !field.querySelector('.fabricate-select-trigger'),
      'the precondition IS the defect: every realm is selected, so the add control is gone'
    );

    // STATIC CLAUSE FIRST, because happy-dom will focus anything it is asked to and would report
    // `activeElement` as the row even if the row were a plain `<div>` no browser could focus.
    const row = field.querySelector('.manager-chip-row');
    assert.ok(Boolean(row), 'the row renders');
    assert.ok(row.hasAttribute('data-chip-remove-fallback'), 'the row carries the fallback hook');
    assert.equal(row.getAttribute('tabindex'), '-1', 'and is focusable without taking a tab stop');

    const chips = field.querySelectorAll('[data-environment-realm-pill]');
    assert.equal(chips.length, 1, 'exactly one chip, so there is no sibling to fall back to');
    field.querySelector('[data-environment-realm-pill] [data-chip-remove]').click();
    await tick();
    flushSync();

    assert.ok(
      document.activeElement === row,
      `focus stayed in the row rather than falling to <body>, got ${document.activeElement?.tagName}.${document.activeElement?.className}`
    );
    remount();
  });
});
