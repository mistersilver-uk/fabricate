/**
 * The published `Typeahead` on Fabricate's real Svelte runtime (issue 2860), through a fresh seam
 * registered with the adapter's own table: its description and refusals, an older Fabricate's
 * refusal of the entry, its names, the query a companion holds, a choice and free text by pointer
 * and by key, the current tick, the no-match line and its status region, the error state, its
 * densities, what it draws for options outside the contract, and the list hosted by the
 * `overlayHost` option, an application root, the standalone layer and a second window's document.
 * Limit: happy-dom runs no screen reader and lays nothing out, so an announcement is read off the
 * region's role and text; the list's geometry, rings and forced colours are
 * `typeahead-published-rendered.test.js`'s.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Window } from 'happy-dom';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { PUBLISHED_COMPONENT_MANIFEST } from '../../src/ui/publishedComponentManifest.js';
import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  FAULT_REPORT,
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  fabricateTarget,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REFUSAL = 'Fabricate | published components: ';
const LAYER = '.fabricate.fabricate-standalone-overlay';
const REWARDS = Object.freeze([
  { value: 'iron-ingot', label: 'Iron ingot', icon: 'fas fa-cube', detail: 'Metal · 3 in stock' },
  { value: 'iron-ore', label: 'Iron ore' },
  { value: 7, label: 'Ironwood plank', detail: 'Timber' },
  { value: 'copper-wire', label: 'Copper wire', icon: 'fas fa-bolt' },
]);
const NAMED = Object.freeze({ ariaLabel: 'Find a reward' });

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-typeahead-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let shells;
let handles;
let stopRecording;

const ui = () =>
  shippedSeam({
    ...seamParts,
    report: (...args) => {
      reports.push(args);
    },
  });

/** A seam over `table`, the manifest of an older Fabricate, registered with the same runtime. */
function seamOver(table) {
  const instance = seamParts.createPublishedComponents({
    table,
    isReady: () => true,
    report: (...args) => {
      reports.push(args);
    },
  });
  const loaders = Object.fromEntries(
    table
      .filter(({ lazy }) => lazy)
      .map(({ path }) => [path, () => Promise.reject(new Error(path))])
  );
  instance.register({ ...seamParts.runtime, components: seamParts.components, loaders });
  return instance.publicApi;
}

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  seamParts = { createPublishedComponents, runtime, components };
  stopRecording = recordEscapes((error) => {
    escaped.push(error);
  });
});

after(() => {
  stopRecording();
  return harness.teardown();
});

beforeEach(() => {
  reports = [];
  escaped = [];
  shells = [];
  handles = [];
});

afterEach(() => {
  for (const handle of handles) handle.destroy();
  for (const shell of shells) shell.remove();
  assert.ok(!document.querySelector(LAYER), 'no standalone layer outlives its list');
  assert.ok(!document.querySelector('[role="listbox"]'), 'no list outlives its mount');
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/** The rewards whose label holds `query`, as a companion filters them; none for a blank query. */
function matching(query) {
  const needle = String(query).trim().toLowerCase();
  return needle ? REWARDS.filter(({ label }) => label.toLowerCase().includes(needle)) : [];
}

/**
 * A typeahead whose companion holds the query and hands the list the options it yields, as a
 * companion must: its handle, the recorded calls, and its parts as drawn now.
 */
function mountTypeahead(
  props = {},
  {
    target = fabricateTarget(shells, 'fabricate fabricate-app'),
    overlayHost,
    filter = matching,
  } = {}
) {
  const chosen = recorder();
  const free = recorder();
  const queries = [];
  let query = '';
  let extra = props;
  const propsNow = () => ({
    ...NAMED,
    options: filter(query),
    onChange: chosen.record,
    onFreeText: free.record,
    onQueryChange: (next, previous) => {
      queries.push([next, previous]);
      query = next;
      handle.update(propsNow());
    },
    ...extra,
  });
  const handle = ui().mount('Typeahead', { target, props: propsNow(), overlayHost });
  handles.push(handle);
  flushSync();
  const input = () => target.querySelector('input');
  return {
    target,
    handle,
    chosen: chosen.calls,
    free: free.calls,
    queries,
    input,
    update(next) {
      extra = { ...extra, ...next };
      return handle.update(propsNow());
    },
    type(text) {
      const field = input();
      field.focus();
      field.value = text;
      field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
      flushSync();
    },
  };
}

const listboxIn = (doc = document) => doc.querySelector('[role="listbox"]');
const rowsIn = (doc = document) => [...doc.querySelectorAll('[role="option"]')];
const rowText = (row) => row.textContent.replaceAll(/\s+/g, ' ').trim();

/** A cancelable keydown of `key` on `element`, once it has bubbled. */
function press(element, key, init = {}) {
  const event = new globalThis.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  element.dispatchEvent(event);
  flushSync();
  return event;
}

const active = (input) => {
  const id = input.getAttribute('aria-activedescendant');
  return id ? input.ownerDocument.querySelector(`[id="${id}"]`) : null;
};

describe('the published Typeahead describes and refuses', () => {
  it('describes its keys, its value key and its overlay', () => {
    const optional = { kind: 'data', required: false };
    assert.deepEqual(ui().describe('Typeahead'), {
      version: 1,
      props: {
        options: { kind: 'data', required: true },
        query: { kind: 'value', required: false },
        onQueryChange: { kind: 'callback', required: false },
        value: optional,
        onChange: { kind: 'callback', required: true },
        ariaLabel: { kind: 'data', required: true },
        placeholder: optional,
        emptyLabel: optional,
        allowFree: optional,
        onFreeText: { kind: 'callback', required: false, requiredWhen: 'allowFree' },
        density: optional,
        error: optional,
        countLabel: { kind: 'text', required: false },
      },
      rest: false,
      root: 'any',
      overlays: true,
    });
  });

  it('is refused as unpublished, and described as null, by a Fabricate that predates it', () => {
    const older = seamOver(PUBLISHED_COMPONENT_MANIFEST.filter(({ name }) => name !== 'Typeahead'));
    assert.equal(older.describe('Typeahead'), null);
    const target = fabricateTarget(shells);
    assert.throws(
      () =>
        older.mount('Typeahead', {
          target,
          props: { ...NAMED, options: [], onChange() {} },
        }),
      { name: 'TypeError', message: `${REFUSAL}"Typeahead" is not published` }
    );
    assert.equal(target.childNodes.length, 0);
  });

  for (const key of ['source', 'itemLabel', 'onChoose', 'label', 'icon', 'inputProps', 'class']) {
    it(`refuses ${key}, which it does not publish`, () => {
      const target = fabricateTarget(shells);
      assert.throws(
        () =>
          ui().mount('Typeahead', {
            target,
            props: { ...NAMED, options: [], onChange() {}, [key]: 'x' },
          }),
        { name: 'TypeError', message: `${REFUSAL}"${key}" is not a prop of Typeahead` }
      );
      assert.equal(target.childNodes.length, 0);
    });
  }

  for (const [claim, props, tail] of [
    ['no options', { ...NAMED, onChange() {} }, 'Typeahead requires a non-empty "options"'],
    [
      'an empty name',
      { ariaLabel: '', options: [], onChange() {} },
      'Typeahead requires a non-empty "ariaLabel"',
    ],
    ['no onChange', { ...NAMED, options: [] }, 'Typeahead requires a non-empty "onChange"'],
    [
      "allowFree 'false', which is truthy, without onFreeText",
      { ...NAMED, options: [], onChange() {}, allowFree: 'false' },
      'Typeahead requires a non-empty "onFreeText" when "allowFree" is truthy',
    ],
  ]) {
    it(`refuses ${claim}`, () => {
      const target = fabricateTarget(shells);
      assert.throws(() => ui().mount('Typeahead', { target, props }), {
        name: 'TypeError',
        message: REFUSAL + tail,
      });
    });
  }
});

describe('the published Typeahead names', () => {
  it('names its input and its list by ariaLabel, and each row by its label and detail', () => {
    const { input, type } = mountTypeahead();
    const field = input();
    assert.equal(field.getAttribute('type'), 'search');
    assert.equal(field.getAttribute('role'), 'combobox');
    assert.equal(field.getAttribute('aria-label'), NAMED.ariaLabel);
    assert.equal(field.getAttribute('aria-autocomplete'), 'list');
    assert.equal(field.getAttribute('aria-expanded'), 'false');
    assert.ok(!field.hasAttribute('aria-controls'), 'no list to control while closed');
    type('iron');
    const list = listboxIn();
    assert.equal(list.getAttribute('aria-label'), NAMED.ariaLabel);
    assert.equal(field.getAttribute('aria-expanded'), 'true');
    assert.equal(field.getAttribute('aria-controls'), list.id);
    assert.deepEqual(
      rowsIn().map((row) => rowText(row)),
      ['Iron ingot Metal · 3 in stock', 'Iron ore', 'Ironwood plank Timber']
    );
    for (const row of rowsIn()) {
      assert.equal(row.getAttribute('tabindex'), '-1', 'a row never takes focus');
      assert.equal(row.getAttribute('data-keyboard-focus'), 'true');
    }
    assert.equal(rowsIn()[0].querySelector('i').getAttribute('aria-hidden'), 'true');
  });
});

describe('the published Typeahead query', () => {
  it('reports each edit through onQueryChange and opens only while focused on a query', () => {
    const { input, type, queries, handle } = mountTypeahead();
    assert.ok(!listboxIn(), 'closed at rest');
    type('ir');
    assert.deepEqual(queries, [['ir', '']]);
    assert.equal(handle.value('query'), 'ir');
    assert.ok(Boolean(listboxIn()), 'open on a query');
    input().blur();
    flushSync();
    assert.ok(!listboxIn(), 'closed once the field loses focus');
    input().focus();
    flushSync();
    assert.ok(Boolean(listboxIn()), 'reopened on focus');
    type(' '.repeat(3));
    assert.ok(!listboxIn(), 'a blank query lists nothing');
  });

  it('takes a query an update passes without calling onQueryChange', () => {
    const { input, queries, update, handle } = mountTypeahead();
    assert.equal(update({ query: 'cop' }), true);
    flushSync();
    assert.equal(input().value, 'cop');
    assert.equal(handle.value('query'), 'cop');
    assert.deepEqual(queries, []);
  });

  it('closes an open list on Escape keeping the text, then empties the text, each stopped, and lets an empty Escape through', () => {
    const { input, type, queries } = mountTypeahead();
    const heard = [];
    const shell = input().closest('section');
    const hear = (event) => {
      heard.push(event.key);
    };
    shell.addEventListener('keydown', hear);
    type('iron');
    const closing = press(input(), 'Escape');
    assert.ok(closing.defaultPrevented, 'the first Escape is consumed');
    assert.ok(!listboxIn(), 'and closes the list');
    assert.equal(input().value, 'iron', 'keeping the text');
    assert.deepEqual(queries, [['iron', '']], 'so no edit is reported');
    const clearing = press(input(), 'Escape');
    assert.ok(clearing.defaultPrevented, 'the second Escape is consumed');
    assert.deepEqual(heard, [], 'and both are stopped');
    assert.deepEqual(queries.at(-1), ['', 'iron']);
    assert.equal(input().value, '');
    const empty = press(input(), 'Escape');
    assert.ok(!empty.defaultPrevented, 'an empty query takes no Escape');
    assert.deepEqual(heard, ['Escape'], 'which reaches a listener above target');
    shell.removeEventListener('keydown', hear);
  });

  it('starts every edit with no row active, so retyping a query never brings a row back', () => {
    const { input, type, chosen, free } = mountTypeahead({ allowFree: true });
    type('iron');
    press(input(), 'ArrowDown');
    press(input(), 'ArrowDown');
    press(input(), 'Escape');
    type('iron');
    assert.ok(Boolean(listboxIn()), 'the retyped query lists again');
    assert.ok(!input().hasAttribute('aria-activedescendant'), 'with no row active');
    press(input(), 'Enter');
    press(input(), 'ArrowDown');
    type('iro');
    type('iron');
    assert.ok(!input().hasAttribute('aria-activedescendant'), 'nor after an edit and back');
    press(input(), 'Enter');
    assert.deepEqual(chosen, [], 'Enter chose no row it was never moved to');
    assert.deepEqual(free, [['iron'], ['iron']], 'and took the text each time');
  });

  it('is dismissed by a press outside it until the query changes', () => {
    const { type } = mountTypeahead();
    type('iron');
    document.body.dispatchEvent(new globalThis.MouseEvent('mousedown', { bubbles: true }));
    flushSync();
    assert.ok(!listboxIn(), 'an outside press closes it');
    type('iron o');
    assert.ok(Boolean(listboxIn()), 'a new query opens it');
  });
});

describe('a choice in the published Typeahead', () => {
  it('calls onChange with the value as passed, by pointer, and keeps focus in the field', () => {
    const { input, type, chosen, queries } = mountTypeahead();
    type('iron');
    const press = new globalThis.MouseEvent('mousedown', { bubbles: true, cancelable: true });
    rowsIn()[2].dispatchEvent(press);
    assert.ok(press.defaultPrevented, 'a press on the list keeps focus in the field');
    rowsIn()[2].click();
    flushSync();
    assert.deepEqual(chosen, [[7]], 'the number, not its string');
    assert.equal(typeof chosen[0][0], 'number');
    assert.ok(document.activeElement === input(), 'the field holds focus');
    assert.deepEqual(queries, [['iron', '']], 'a choice changes no query');
    assert.ok(!listboxIn(), 'and closes the list');
    assert.equal(input().getAttribute('aria-expanded'), 'false');
    type('iron');
    rowsIn()[0].click();
    flushSync();
    assert.deepEqual(chosen, [[7], ['iron-ingot']], 'a string stays a string');
  });

  it('closes the list on a choice by Enter, and a second Enter at that query reports no free text', () => {
    const { input, type, chosen, free } = mountTypeahead({ allowFree: true });
    type('iron');
    press(input(), 'ArrowDown');
    press(input(), 'Enter');
    assert.equal(input().getAttribute('aria-expanded'), 'false', 'the list is closed');
    const again = press(input(), 'Enter');
    assert.ok(again.defaultPrevented, 'the second Enter is taken');
    assert.deepEqual([chosen, free], [[['iron-ingot']], []], 'and commits nothing more');
    type('iron ');
    press(input(), 'Enter');
    assert.deepEqual(free, [['iron']], 'until the query is edited');
  });

  it('moves the active row by the arrows, named by aria-activedescendant, and chooses it on Enter', () => {
    const { input, type, chosen } = mountTypeahead();
    type('iron');
    const field = input();
    assert.ok(!field.hasAttribute('aria-activedescendant'), 'a new query starts with none');
    press(field, 'ArrowDown');
    assert.equal(rowText(active(field)), 'Iron ingot Metal · 3 in stock');
    assert.equal(active(field).getAttribute('aria-selected'), 'true');
    assert.deepEqual(
      rowsIn().map((row) => row.getAttribute('aria-selected')),
      ['true', 'false', 'false']
    );
    press(field, 'ArrowUp');
    assert.equal(rowText(active(field)), 'Ironwood plank Timber', 'wraps to the last');
    press(field, 'ArrowDown');
    assert.equal(rowText(active(field)), 'Iron ingot Metal · 3 in stock', 'and back to the first');
    assert.ok(document.activeElement === field, 'focus stays in the field');
    const enter = press(field, 'Enter');
    assert.ok(enter.defaultPrevented);
    assert.deepEqual(chosen, [['iron-ingot']]);
    assert.ok(!field.hasAttribute('aria-activedescendant'), 'a choice leaves none active');
  });

  it('chooses nothing on Enter with no row active, under composition, or on Tab', () => {
    const { input, type, chosen, free } = mountTypeahead();
    type('iron');
    const field = input();
    press(field, 'Enter');
    press(field, 'ArrowDown');
    const composing = press(field, 'Enter', { isComposing: true });
    assert.ok(!composing.defaultPrevented, 'an Enter inside a composition is the IME’s');
    const committing = press(field, 'Enter', { keyCode: 229 });
    assert.ok(!committing.defaultPrevented, 'and so is the key that commits one in Safari');
    const tab = press(field, 'Tab');
    assert.ok(!tab.defaultPrevented, 'Tab moves focus as the browser does');
    assert.deepEqual([chosen, free], [[], []]);
  });

  it('calls onChange on no mount, update or opening of the list', () => {
    const { type, update, chosen } = mountTypeahead({ value: 'iron-ore' });
    update({ value: 7 });
    type('iron');
    assert.deepEqual(chosen, []);
  });
});

describe('free text in the published Typeahead', () => {
  it('reports the trimmed query on Enter with no row active, open or with nothing listed', () => {
    const { input, type, free, chosen } = mountTypeahead({ allowFree: true });
    type('  iron  ');
    const listed = press(input(), 'Enter');
    assert.ok(listed.defaultPrevented);
    type('mithril');
    assert.ok(!listboxIn(), 'nothing is listed');
    const unlisted = press(input(), 'Enter');
    assert.ok(unlisted.defaultPrevented);
    assert.deepEqual(free, [['iron'], ['mithril']]);
    assert.deepEqual(chosen, []);
  });

  it('chooses the active row rather than the text, and reports nothing for a blank query or a composition', () => {
    const { input, type, free, chosen } = mountTypeahead({ allowFree: true });
    type('iron');
    press(input(), 'ArrowDown');
    press(input(), 'Enter');
    assert.deepEqual(chosen, [['iron-ingot']]);
    type('mithril');
    press(input(), 'Enter', { isComposing: true });
    press(input(), 'Enter', { keyCode: 229 });
    type(' '.repeat(3));
    const blank = press(input(), 'Enter');
    assert.ok(blank.defaultPrevented, 'an Enter on a blank query is still taken');
    assert.deepEqual(free, []);
  });

  it('reports no free text without allowFree, and takes no Enter while nothing is listed', () => {
    const { input, type, free } = mountTypeahead();
    type('mithril');
    const enter = press(input(), 'Enter');
    assert.ok(!enter.defaultPrevented, 'an Enter the field does not own passes');
    assert.deepEqual(free, []);
  });
});

describe('the published Typeahead current value', () => {
  it('ticks the row whose value is value by ===, and marks every row checked or not', () => {
    const { type, update } = mountTypeahead({ value: 7 });
    type('iron');
    const ticks = () =>
      rowsIn().map((row) => Boolean(row.querySelector('.fabricate-typeahead-option-tick')));
    const checked = () => rowsIn().map((row) => row.getAttribute('aria-checked'));
    assert.deepEqual(ticks(), [false, false, true]);
    assert.deepEqual(checked(), ['false', 'false', 'true']);
    update({ value: '7' });
    flushSync();
    assert.deepEqual(ticks(), [false, false, false], "'7' is not 7");
    assert.deepEqual(checked(), ['false', 'false', 'false']);
    for (const value of [null, undefined]) {
      update({ value });
      flushSync();
      assert.deepEqual(checked(), [null, null, null], `no row is checkable under ${value}`);
    }
  });
});

describe('the published Typeahead no-match line', () => {
  const region = (target) =>
    target.querySelector(':scope .fabricate-typeahead-control > [role="status"]');

  it('draws its status region empty from mount, beside the field, and says emptyLabel into it', () => {
    const { target, type } = mountTypeahead({ emptyLabel: 'Nothing matches. Press Enter.' });
    const status = region(target);
    assert.ok(status?.classList.contains('visually-hidden'), 'a clipped region inside target');
    assert.equal(status.textContent, '');
    type('iron');
    assert.equal(status.textContent, '', 'silent while rows are listed');
    type('mithril');
    assert.ok(region(target) === status, 'the same region');
    assert.equal(status.textContent, 'Nothing matches. Press Enter.');
    const note = document.querySelector('.fabricate-typeahead-note');
    assert.equal(note.textContent, 'Nothing matches. Press Enter.', 'and the panel shows it');
    assert.ok(!note.parentElement.hasAttribute('role'), 'the panel is no second region');
    assert.ok(!listboxIn(), 'and no listbox');
    type('cop');
    assert.equal(status.textContent, '', 'emptied once a row is listed');
  });

  it('says nothing without emptyLabel, and draws no panel', () => {
    const { target, type } = mountTypeahead();
    type('mithril');
    assert.equal(region(target).textContent, '');
    assert.ok(!document.querySelector('.fabricate-typeahead-list'));
  });
});

describe('the published Typeahead error', () => {
  it('draws the invalid face, aria-invalid and the message naming the description, and an update clears them in place', () => {
    const { target, input, update } = mountTypeahead({ error: 'Choose a reward from the list.' });
    const field = input();
    const shell = target.querySelector('.fabricate-search');
    const message = target.querySelector('.fabricate-typeahead-error');
    assert.ok(shell.classList.contains('is-invalid'));
    assert.equal(field.getAttribute('aria-invalid'), 'true');
    assert.equal(message.textContent, 'Choose a reward from the list.');
    assert.equal(field.getAttribute('aria-describedby'), message.id);
    assert.ok(shell.nextElementSibling === message, 'beneath the field');
    field.focus();
    for (const error of ['', ' '.repeat(3), undefined, 3]) {
      update({ error });
      flushSync();
      assert.ok(input() === field && document.activeElement === field, 'the same focused input');
      assert.ok(!shell.classList.contains('is-invalid'), `none for ${JSON.stringify(error)}`);
      assert.ok(!field.hasAttribute('aria-invalid') && !field.hasAttribute('aria-describedby'));
      assert.ok(!target.querySelector('.fabricate-typeahead-error'));
    }
  });
});

describe('the published Typeahead density', () => {
  for (const [density, written] of [
    ['toolbar', 'is-density-toolbar'],
    ['inline', 'is-density-inline'],
  ]) {
    it(`writes ${written} for '${density}'`, () => {
      const { target } = mountTypeahead({ density });
      assert.ok(target.querySelector('.fabricate-search').classList.contains(written));
    });
  }

  for (const density of ['compact', 'default', 'Toolbar', 34, null]) {
    it(`draws the default shell for ${JSON.stringify(density)}, never the compact one`, () => {
      const { target } = mountTypeahead({ density });
      assert.equal(
        target.querySelector('.fabricate-search').className,
        'fabricate-search fabricate-typeahead'
      );
    });
  }
});

describe('the published Typeahead options outside the contract', () => {
  for (const options of [null, { value: 'x', label: 'X' }, 'iron']) {
    it(`ends the mount as a contained fault for options ${JSON.stringify(options)}`, async () => {
      const faults = [];
      const target = fabricateTarget(shells);
      ui().mount('Typeahead', {
        target,
        props: { ...NAMED, options, onChange() {} },
        onFault: (fault) => {
          faults.push(fault);
        },
      });
      flushSync();
      await settle();
      await settle();
      assert.equal(reports.length, 1, 'reported once');
      assert.equal(reports[0][0], FAULT_REPORT);
      assert.equal(reports[0][1], 'Typeahead');
      assert.equal(faults.length, 1, 'onFault is told once');
      assert.equal(target.childNodes.length, 0, 'target is emptied');
    });
  }

  it('draws no row for an item without a string or number value and a non-blank label', () => {
    const odd = [
      { value: 'a', label: 'Iron a' },
      { value: null, label: 'Iron null' },
      { value: true, label: 'Iron true' },
      { value: 'b', label: ' '.repeat(3) },
      { value: 'c' },
      null,
      'iron',
      { value: 'd', label: 'Iron d', icon: 5, detail: '  ' },
      { value: 'a', label: 'Iron a again' },
    ];
    const { type } = mountTypeahead({ value: 'a' }, { filter: (query) => (query ? odd : []) });
    type('iron');
    assert.deepEqual(
      rowsIn().map((row) => rowText(row)),
      ['Iron a', 'Iron d', 'Iron a again']
    );
    assert.ok(!rowsIn()[1].querySelector('i'), 'no glyph for an icon that is not a string');
    assert.ok(!rowsIn()[1].querySelector('.fabricate-typeahead-option-detail'), 'no blank detail');
    assert.deepEqual(
      rowsIn().map((row) => row.getAttribute('aria-checked')),
      ['true', 'false', 'true'],
      'a repeated value is drawn twice and ticked twice'
    );
  });
});

describe('the published Typeahead overlay host', () => {
  const hostOf = (list) => list.parentElement.parentElement;

  it('hosts its list in the nearest application root, or in an overlayHost of the target’s document', () => {
    for (const classes of ['fabricate fabricate-app', 'fabricate fabricate-manager']) {
      const { type, handle } = mountTypeahead({}, { target: fabricateTarget(shells, classes) });
      type('iron');
      assert.equal(hostOf(listboxIn()).className, classes);
      handle.destroy();
    }
    const shell = fabricateTarget(shells, 'fabricate fabricate-app').parentElement;
    const overlayHost = document.createElement('section');
    shell.append(overlayHost);
    const { type, target } = mountTypeahead({}, { target: shell.firstElementChild, overlayHost });
    type('iron');
    assert.ok(hostOf(listboxIn()) === overlayHost, 'the overlayHost option');
    assert.ok(!target.contains(listboxIn()), 'never inside target');
  });

  it('opens on the standalone layer in a companion’s own shell, and destroy removes both', () => {
    const { type, handle, target } = mountTypeahead({}, { target: companionTarget(shells) });
    assert.ok(target.firstElementChild.classList.contains('fabricate-standalone-root'));
    type('iron');
    const layer = document.querySelector(LAYER);
    assert.ok(layer?.contains(listboxIn()), 'on the standalone layer');
    handle.destroy();
    assert.ok(!document.querySelector(LAYER) && !listboxIn());
  });

  describe('in a second window', () => {
    let second;

    beforeEach(() => {
      second = new Window({ url: 'http://localhost/detached' });
    });

    afterEach(async () => {
      await second.happyDOM.close();
    });

    it('lists, moves the row and chooses in that window’s document, and an outside press there closes it', () => {
      const doc = second.document;
      const shell = doc.createElement('section');
      const target = doc.createElement('div');
      shell.append(target);
      doc.body.append(shell);
      const { type, input, chosen, handle } = mountTypeahead({}, { target });
      type('iron');
      const list = listboxIn(doc);
      assert.ok(doc.querySelector(LAYER)?.contains(list), "the second document's own layer");
      assert.ok(!listboxIn(), 'nothing in this window');
      press(input(), 'ArrowDown');
      press(input(), 'ArrowDown');
      assert.equal(rowText(active(input())), 'Iron ore');
      press(input(), 'Enter');
      assert.deepEqual(chosen, [['iron-ore']]);
      doc.body.dispatchEvent(new second.MouseEvent('mousedown', { bubbles: true }));
      flushSync();
      assert.ok(!listboxIn(doc), 'a press in that document closes it');
      handle.destroy();
      assert.ok(!doc.querySelector(LAYER), 'its layer goes with it');
    });
  });
});

describe('the published Typeahead list when its target leaves the document', () => {
  it('closes the list once the target is removed, and leaves no panel in its host', async () => {
    const { target, type } = mountTypeahead();
    type('iron');
    assert.ok(Boolean(listboxIn()), 'the list is open');
    const shell = target.parentElement;
    const host = document.createElement('section');
    host.className = 'fabricate fabricate-app';
    document.body.append(host);
    shells.push(host);
    target.remove();
    await settle();
    flushSync();
    assert.ok(!listboxIn(), 'no list is left anywhere');
    assert.equal(shell.querySelectorAll('[role="listbox"], .fabricate-typeahead-list').length, 0);
  });

  it('closes the list of a typeahead mounted in a Modal slot when an update closes the dialog', async () => {
    const api = ui();
    const modalTarget = fabricateTarget(shells, 'fabricate fabricate-app');
    const modalProps = {
      open: true,
      title: 'Choose a reward',
      closeLabel: 'Close',
      onClose() {},
      body: true,
    };
    const modal = api.mount('Modal', { target: modalTarget, props: modalProps });
    handles.push(modal);
    flushSync();
    await settle();
    const slot = modal.slot('body');
    const target = slot.ownerDocument.createElement('div');
    slot.append(target);
    let query = '';
    const props = () => ({
      ...NAMED,
      options: matching(query),
      onChange() {},
      onQueryChange: (next) => {
        query = next;
        typeahead.update(props());
      },
    });
    const typeahead = api.mount('Typeahead', { target, props: props() });
    handles.push(typeahead);
    flushSync();
    const input = target.querySelector('input');
    input.focus();
    input.value = 'iron';
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    flushSync();
    assert.ok(Boolean(listboxIn()), 'the list is open');
    modal.update({ ...modalProps, open: false });
    flushSync();
    await settle();
    flushSync();
    assert.ok(!document.querySelector('[data-manager-modal]'), 'the dialog is gone');
    assert.ok(!listboxIn(), 'and so is the list');
    assert.ok(!document.querySelector(LAYER), 'with no layer left');
  });
});

describe('the published Typeahead options turning invalid on an update', () => {
  for (const open of [true, false]) {
    it(`ends the mount as one contained fault with the list ${open ? 'open' : 'closed'}`, async () => {
      const faults = [];
      const target = fabricateTarget(shells);
      const props = { ...NAMED, options: REWARDS, onChange() {} };
      const handle = ui().mount('Typeahead', {
        target,
        props,
        onFault: (fault) => {
          faults.push(fault);
        },
      });
      flushSync();
      if (open) {
        const input = target.querySelector('input');
        input.focus();
        input.value = 'iron';
        input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
        flushSync();
        assert.ok(Boolean(listboxIn()), 'the list is open');
      }
      handle.update({ ...props, options: 'iron' });
      flushSync();
      await settle();
      await settle();
      assert.equal(reports.length, 1, 'reported once');
      assert.deepEqual(reports[0].slice(0, 2), [FAULT_REPORT, 'Typeahead']);
      assert.equal(faults.length, 1, 'onFault is told once');
      assert.equal(target.childNodes.length, 0, 'target is emptied');
      assert.ok(!listboxIn(), 'no list is left');
    });
  }
});

/** Every attribute name the field, the list and a row carry, which the holder writes by spread. */
const INPUT_ATTRIBUTES = Object.freeze([
  'aria-activedescendant',
  'aria-autocomplete',
  'aria-controls',
  'aria-expanded',
  'aria-label',
  'placeholder',
  'role',
  'type',
]);
const LIST_ATTRIBUTES = Object.freeze(['aria-label', 'class', 'id', 'role', 'style']);
const ROW_ATTRIBUTES = Object.freeze([
  'aria-checked',
  'aria-selected',
  'class',
  'data-keyboard-focus',
  'id',
  'role',
  'tabindex',
  'type',
]);

describe('the published Typeahead attributes', () => {
  it('writes only the allowed attribute names on its input, its list and each row', () => {
    const { input, type } = mountTypeahead({ value: 7, placeholder: 'Search rewards' });
    type('iron');
    press(input(), 'ArrowDown');
    const names = (element) =>
      element
        .getAttributeNames()
        .filter((name) => !name.startsWith('data-svelte'))
        .sort((a, b) => a.localeCompare(b));
    assert.deepEqual(names(input()), [...INPUT_ATTRIBUTES]);
    assert.deepEqual(names(listboxIn()), [...LIST_ATTRIBUTES]);
    for (const row of rowsIn()) assert.deepEqual(names(row), [...ROW_ATTRIBUTES]);
  });
});

describe('the published Typeahead countLabel', () => {
  it('draws the count in the field’s own polite region, the first status in target, and changes it in place', () => {
    const { target, update } = mountTypeahead({ countLabel: '4 more, keep typing' });
    const regions = () => [...target.querySelectorAll('[role="status"]')];
    assert.equal(regions().length, 2, 'the field’s count region, then the typeahead’s own');
    const [count, own] = regions();
    assert.ok(count.classList.contains('fabricate-search-count'));
    assert.equal(count.textContent, '4 more, keep typing');
    assert.ok(own.classList.contains('visually-hidden'));
    update({ countLabel: '2 more' });
    flushSync();
    assert.ok(regions()[0] === count && count.textContent === '2 more', 'the same region');
    update({ countLabel: undefined });
    flushSync();
    assert.equal(count.textContent, '', 'emptied, and still drawn');
  });
});
