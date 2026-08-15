/**
 * Issue 1024 — GM-configurable player-character actor types.
 *
 * The reported bug: a Fallout `robot` PC is absent from Fabricate's actor-selection
 * bar, the GM stamina roster, the manager's Access and Knowledge rosters, and the
 * party member picker, because the predicate was hardcoded to `actor.type ===
 * 'character'`.
 *
 * These cases cover the pure core, the picker's markup and read-back, the persistence
 * round trip, the settings-menu registration, and the player-write guardrail.
 */

import test, { describe, it, after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES_KEY,
  ALWAYS_PLAYER_CHARACTER_TYPE,
  buildActorTypeOptions,
  createPlayerCharacterActorPredicate,
  isPlayerCharacterActor,
  normalizeAdditionalPlayerCharacterTypes,
  readAdditionalPlayerCharacterActorTypes,
  resolvePlayerCharacterTypes,
} from '../src/config/playerCharacterTypes.js';
import {
  ACTOR_TYPE_FIELD_NAME,
  actorTypeLabel,
  buildActorTypeDialogContent,
  DIALOG_WIDTH,
  enumerateActorTypes,
  openPlayerCharacterTypesDialog,
  readSelectedActorTypes,
  registerPlayerCharacterTypesMenu,
} from '../src/config/playerCharacterTypesMenu.js';
import { handleFabricateSettingChange } from '../src/config/settingChangeBridge.js';
import { SETTING_KEYS, WORLD_SCOPED_SETTING_KEYS } from '../src/config/settings.js';
import { setupDOM, teardownDOM } from './helpers/svelte-dom.js';
import { makeSettingsSeam } from './helpers/settings.js';

const NAMESPACE = 'fabricate';

// --- criterion 1: zero regression, asserted as an invariant over garbage -----

describe('resolvePlayerCharacterTypes', () => {
  const GARBAGE = [
    [],
    null,
    undefined,
    ['character'],
    [123, '', 'robot', 'robot'],
    ['quest-pages.quest'],
    'not-an-array',
    {},
    [null, false, {}],
  ];

  for (const value of GARBAGE) {
    it(`always resolves a set containing 'character' for ${JSON.stringify(value) ?? 'undefined'}`, () => {
      const resolved = resolvePlayerCharacterTypes(value);
      assert.ok(resolved instanceof Set);
      assert.equal(resolved.has(ALWAYS_PLAYER_CHARACTER_TYPE), true);
    });
  }

  it('is additive: a configured type joins `character` rather than replacing it', () => {
    assert.deepEqual([...resolvePlayerCharacterTypes(['robot'])], ['character', 'robot']);
  });

  it('keeps a dotted module-subtype id verbatim', () => {
    assert.equal(resolvePlayerCharacterTypes(['quest-pages.quest']).has('quest-pages.quest'), true);
  });
});

describe('normalizeAdditionalPlayerCharacterTypes', () => {
  it('drops non-strings and blanks, trims, and collapses duplicates in order', () => {
    assert.deepEqual(
      normalizeAdditionalPlayerCharacterTypes([123, '', '  robot  ', 'robot', null, 'synth']),
      ['robot', 'synth']
    );
  });

  it('returns [] for anything that is not an array', () => {
    for (const value of [null, undefined, 'robot', 42, {}]) {
      assert.deepEqual(normalizeAdditionalPlayerCharacterTypes(value), []);
    }
  });

  it('KEEPS an unknown id — stale entries are inert, never auto-pruned', () => {
    assert.deepEqual(normalizeAdditionalPlayerCharacterTypes(['from-a-disabled-module']), [
      'from-a-disabled-module',
    ]);
  });
});

describe('createPlayerCharacterActorPredicate', () => {
  it('matches `character` with no configuration at all', () => {
    const predicate = createPlayerCharacterActorPredicate(() => []);
    assert.equal(predicate({ type: 'character' }), true);
    assert.equal(predicate({ type: 'npc' }), false);
  });

  it('matches a configured additional type', () => {
    const predicate = createPlayerCharacterActorPredicate(() => ['robot']);
    assert.equal(predicate({ type: 'robot' }), true);
    assert.equal(predicate({ type: 'character' }), true, 'character is never displaced');
    assert.equal(predicate({ type: 'npc' }), false);
  });

  it('rejects a missing / non-string / empty actor type without throwing', () => {
    const predicate = createPlayerCharacterActorPredicate(() => ['robot']);
    for (const actor of [null, undefined, {}, { type: '' }, { type: 42 }, { type: null }]) {
      assert.equal(predicate(actor), false);
    }
  });

  it('reads the setting PER CALL, so a mid-session change needs no invalidation', () => {
    let configured = [];
    const predicate = createPlayerCharacterActorPredicate(() => configured);
    assert.equal(predicate({ type: 'robot' }), false);
    configured = ['robot'];
    assert.equal(predicate({ type: 'robot' }), true, 'no cached set');
  });
});

describe('readAdditionalPlayerCharacterActorTypes', () => {
  const original = globalThis.game;
  after(() => {
    globalThis.game = original;
  });

  it('degrades to [] when there is no `game` at all', () => {
    globalThis.game = undefined;
    assert.deepEqual(readAdditionalPlayerCharacterActorTypes(), []);
  });

  it('degrades to [] when `settings.get` throws (an unregistered key)', () => {
    globalThis.game = {
      settings: {
        get: () => {
          throw new Error('not registered');
        },
      },
    };
    assert.deepEqual(readAdditionalPlayerCharacterActorTypes(), []);
    // ...and the bound predicate stays usable rather than propagating the throw.
    assert.equal(isPlayerCharacterActor({ type: 'character' }), true);
    assert.equal(isPlayerCharacterActor({ type: 'robot' }), false);
  });

  it('reads the stored value under the module namespace and key', () => {
    const reads = [];
    globalThis.game = {
      settings: {
        get: (namespace, key) => {
          reads.push([namespace, key]);
          return ['robot'];
        },
      },
    };
    assert.deepEqual(readAdditionalPlayerCharacterActorTypes(), ['robot']);
    assert.deepEqual(reads, [[NAMESPACE, ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES_KEY]]);
    assert.equal(isPlayerCharacterActor({ type: 'robot' }), true);
  });
});

// --- buildActorTypeOptions --------------------------------------------------

describe('buildActorTypeOptions', () => {
  it('pins `character` first, checked and locked, and excludes `base`', () => {
    const options = buildActorTypeOptions({
      declaredTypes: ['base', 'npc', 'character', 'robot'],
      selectedTypes: [],
    });
    assert.deepEqual(
      options.map((option) => option.id),
      ['character', 'npc', 'robot']
    );
    assert.deepEqual(options[0], {
      id: 'character',
      label: 'character',
      checked: true,
      locked: true,
      known: true,
    });
    assert.equal(
      options.some((option) => option.id === 'base'),
      false,
      'CONST.BASE_DOCUMENT_TYPE is not a real actor type'
    );
  });

  it('ticks the stored selection and leaves the rest unticked', () => {
    const options = buildActorTypeOptions({
      declaredTypes: ['character', 'npc', 'robot'],
      selectedTypes: ['robot'],
    });
    assert.deepEqual(
      options.map((option) => [option.id, option.checked]),
      [
        ['character', true],
        ['npc', false],
        ['robot', true],
      ]
    );
  });

  it('unions an unknown stored id in, marked not-known and rendered with its raw id', () => {
    const options = buildActorTypeOptions({
      declaredTypes: ['character', 'npc'],
      selectedTypes: ['quest-pages.quest'],
      labelFor: (type) => (type === 'npc' ? 'Non-Player Character' : null),
    });
    const unknown = options.find((option) => option.id === 'quest-pages.quest');
    assert.deepEqual(unknown, {
      id: 'quest-pages.quest',
      label: 'quest-pages.quest',
      checked: true,
      locked: false,
      known: false,
    });
    assert.equal(options.find((option) => option.id === 'npc').label, 'Non-Player Character');
  });

  it('never emits a second `character` row when it is also stored', () => {
    const options = buildActorTypeOptions({
      declaredTypes: ['character'],
      selectedTypes: ['character'],
    });
    assert.deepEqual(
      options.map((option) => option.id),
      ['character']
    );
    assert.equal(options[0].locked, true);
  });

  it('renders `character` even in a system that does not declare it (inert but honest)', () => {
    const options = buildActorTypeOptions({ declaredTypes: ['robot'], selectedTypes: [] });
    assert.equal(options[0].id, 'character');
    assert.equal(options[0].known, false);
  });
});

// --- the dialog markup (criterion 5) ----------------------------------------

/**
 * A model of the CLIENT `foundry.utils.cleanHTML` (`client/utils/helpers.mjs`), which
 * is the one DialogV2 actually calls: a non-allowlisted element is deleted along with
 * its WHOLE SUBTREE. The server/database implementation (`sanitize-html`) keeps the
 * inner text instead, and a stub modelled on that one would pass output the real
 * dialog renders differently.
 */
const ALLOWED_TAGS = new Set(['P', 'FIELDSET', 'LEGEND', 'LABEL', 'INPUT', 'SPAN']);

function cleanLikeClient(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  const strip = (node) => {
    for (const child of [...node.children]) {
      if (ALLOWED_TAGS.has(child.tagName)) strip(child);
      else child.remove();
    }
  };
  strip(container);
  return container;
}

describe('buildActorTypeDialogContent', () => {
  before(setupDOM);
  after(teardownDOM);

  const options = [
    { id: 'character', label: 'Character', checked: true, locked: true, known: true },
    { id: 'robot', label: 'Robot', checked: true, locked: false, known: true },
    { id: 'npc', label: 'NPC', checked: false, locked: false, known: true },
    {
      id: 'quest-pages.quest',
      label: 'quest-pages.quest',
      checked: true,
      locked: false,
      known: false,
    },
  ];

  const content = () => buildActorTypeDialogContent({ options });

  it('carries no `on*` attribute anywhere', () => {
    // Asserted on OUR OWN output rather than trusting the sanitizer: the client
    // implementation compiles each allowlist as `^a|b|c$`, binding the anchors to the
    // first and last alternatives only, so "only allowlisted attributes survive" is not
    // literally true and is not a security property to lean on.
    assert.equal(/\son[a-z]+\s*=/i.test(content()), false);
  });

  it('uses only allowlisted tags, and NO nested <form>', () => {
    const tags = [...content().matchAll(/<([a-z]+)/gi)].map((match) => match[1].toUpperCase());
    for (const tag of tags) assert.ok(ALLOWED_TAGS.has(tag), `<${tag}> is not allowlisted`);
    // `form` survives cleaning, but DialogV2._renderHTML injects the cleaned string into
    // its OWN <form> via innerHTML and the parser drops a nested <form> start tag.
    assert.equal(tags.includes('FORM'), false);
  });

  it('survives the client cleaner as a <fieldset> with a <legend>', () => {
    const cleaned = cleanLikeClient(content());
    const fieldset = cleaned.querySelector('fieldset');
    assert.ok(fieldset, 'the fieldset survives cleaning');
    assert.ok(fieldset.querySelector('legend'), 'with its legend');
    assert.match(
      fieldset.getAttribute('style') || '',
      /max-height:.+overflow:\s*auto/,
      'and its height cap, so an unbounded type list cannot push the buttons off-screen'
    );
  });

  it('pairs every checkbox with a <label for> resolving to its own id', () => {
    const cleaned = cleanLikeClient(content());
    const inputs = [...cleaned.querySelectorAll('input[type="checkbox"]')];
    assert.equal(inputs.length, options.length);
    for (const input of inputs) {
      assert.ok(input.id, 'every checkbox carries an id');
      const label = cleaned.querySelector(`label[for="${input.id}"]`);
      assert.ok(label, `a label[for] resolves to ${input.id}`);
      assert.ok(label.contains(input), 'and wraps it');
    }
    // Namespaced, because DialogV2 renders into the live document alongside every
    // other open application.
    for (const input of inputs) assert.match(input.id, /^fabricate-actor-type-\d+$/);
  });

  it('renders the locked row checked and disabled but with NO name attribute', () => {
    const cleaned = cleanLikeClient(content());
    const locked = cleaned.querySelector('input:disabled');
    assert.ok(locked);
    assert.equal(locked.checked, true);
    assert.equal(
      locked.hasAttribute('name'),
      false,
      'a NAMED locked row would be read back and persist ["character"] into a setting' +
        ' documented as holding only ADDITIONAL types'
    );
    // The suffix is INSIDE the label, so it joins the accessible name rather than being
    // invisible in forms mode. (There is no `game.i18n` here, so `localize` yields the
    // key — which also pins WHICH key the suffix comes from.)
    const label = cleaned.querySelector(`label[for="${locked.id}"]`);
    assert.match(label.textContent, /PlayerCharacterActorTypes\.AlwaysIncluded/);
  });

  it('never disables the <fieldset> itself', () => {
    const cleaned = cleanLikeClient(content());
    assert.equal(
      cleaned.querySelector('fieldset').hasAttribute('disabled'),
      false,
      '<fieldset disabled> would disable every descendant control'
    );
  });

  it('gives every EDITABLE checkbox one shared name with the id in `value`', () => {
    const cleaned = cleanLikeClient(content());
    const editable = [...cleaned.querySelectorAll(`input[name="${ACTOR_TYPE_FIELD_NAME}"]`)];
    assert.deepEqual(
      editable.map((input) => input.getAttribute('value')),
      ['robot', 'npc', 'quest-pages.quest'],
      'the dotted module-subtype id rides in `value`, never in a selector'
    );
  });

  it('marks an undeclared stored type so the GM can identify and prune it', () => {
    const cleaned = cleanLikeClient(content());
    const unknown = cleaned.querySelector('input[value="quest-pages.quest"]');
    assert.equal(unknown.checked, true, 'it survives the round trip');
    const label = cleaned.querySelector(`label[for="${unknown.id}"]`);
    assert.match(label.textContent, /PlayerCharacterActorTypes\.UnknownType/);
    assert.match(label.textContent, /quest-pages\.quest/, 'and renders with its raw id');
  });

  it('renders a raw type id in a typeface the friendly label does not use', () => {
    // The two are adjacent on one row ("Player Character" then `character`), so nothing
    // but their presentation says which is the human name and which is the literal the
    // world declares. Asserting the DECLARATIONS rather than a class name, because a
    // class alone styles nothing: this dialog is core-chromed and the rule would have to
    // live in `styles/fabricate.css`, which the module docblock explains it cannot.
    const cleaned = cleanLikeClient(content());
    const row = cleaned.querySelector('input[value="robot"]').closest('label');
    const rawId = row.querySelector('.fabricate-actor-type-id');
    const friendly = row.querySelector('.fabricate-actor-type-label');
    assert.equal(rawId.textContent, 'robot');
    assert.equal(friendly.textContent, 'Robot');
    assert.match(rawId.getAttribute('style'), /font-family:[^;]*monospace/);
    assert.doesNotMatch(friendly.getAttribute('style') || '', /font-family/);
  });

  it('gives a label-less type the RAW treatment, not the friendly one', () => {
    // `quest-pages.quest` has no `CONFIG.Actor.typeLabels` entry, so `actorTypeLabel`
    // fell back to the id and label === id. Rendering that fallback in the friendly
    // typeface would make the one row a GM most needs to recognise — a type this world
    // does not translate — the only row that lies about which kind of string it is.
    const cleaned = cleanLikeClient(content());
    const row = cleaned.querySelector('input[value="quest-pages.quest"]').closest('label');
    assert.equal(row.querySelector('.fabricate-actor-type-label'), null);
    const rawId = row.querySelector('.fabricate-actor-type-id');
    assert.equal(rawId.textContent, 'quest-pages.quest');
    assert.match(rawId.getAttribute('style'), /font-family:[^;]*monospace/);
    // And it still reads ONCE, not as a friendly name followed by its own id.
    assert.equal(row.querySelectorAll('.fabricate-actor-type-id').length, 1);
  });

  it('does not read a `--fab-*` COLOUR token, which would be the dark theme against Foundry light', () => {
    // The colour tokens are declared on bare `:root` and unconditionally carry the dark
    // "fabricate" theme. This dialog wears core chrome and follows FOUNDRY's theme, so a
    // parchment-on-dark token here is unreadable in a light-themed world. Font family is
    // theme-independent and stays allowed.
    const tokens = [...content().matchAll(/var\(\s*(--fab-[a-z0-9-]+)/gi)].map((m) => m[1]);
    assert.deepEqual([...new Set(tokens)], ['--fab-font-mono']);
  });

  it('keeps a space between the label spans so the accessible name is not run together', () => {
    // `display:flex` drops a whitespace-only text node from the LAYOUT, so the visible
    // separation is the `gap` — but the accessible name is computed from text content.
    const cleaned = cleanLikeClient(content());
    const row = cleaned.querySelector('input[value="robot"]').closest('label');
    assert.match(row.textContent, /Robot\s+robot/);
  });

  it('escapes a hostile id and label rather than emitting markup', () => {
    // An actor type id is module-supplied, so it is not trusted input. We escape our own
    // interpolations rather than relying on the sanitizer downstream of us.
    const hostileId = 'x"><img src=x onerror=alert(1)>';
    const container = document.createElement('div');
    container.innerHTML = buildActorTypeDialogContent({
      options: [
        {
          id: hostileId,
          label: '<script>alert(1)</script>',
          checked: false,
          locked: false,
          known: true,
        },
      ],
    });
    assert.equal(container.querySelector('img'), null, 'no element was injected');
    assert.equal(container.querySelector('script'), null);
    assert.equal(
      container.querySelector('input').getAttribute('value'),
      hostileId,
      'the id survives as DATA, in the attribute it was meant for'
    );
    assert.match(container.querySelector('label').textContent, /<script>alert\(1\)<\/script>/);
  });
});

// --- reading the form back --------------------------------------------------

describe('readSelectedActorTypes', () => {
  before(setupDOM);
  after(teardownDOM);

  function renderIntoForm(options) {
    // Mirrors DialogV2._renderHTML: the cleaned string is injected into the dialog's
    // OWN <form>. `button.form` is that element.
    const form = document.createElement('form');
    form.innerHTML = buildActorTypeDialogContent({ options });
    return form;
  }

  it('returns [] when nothing additional is ticked — and NOT ["character"]', () => {
    const form = renderIntoForm([
      { id: 'character', label: 'Character', checked: true, locked: true, known: true },
      { id: 'robot', label: 'Robot', checked: false, locked: false, known: true },
    ]);
    // The locked row IS checked in the DOM, and neither `querySelectorAll` nor
    // `HTMLFormControlsCollection` filters disabled controls — the missing `name` is
    // what keeps it out.
    assert.equal(form.querySelector('input:disabled').checked, true);
    assert.deepEqual(readSelectedActorTypes(form), []);
  });

  it('reads a SINGLE additional type — the `form.elements.<name>` trap', () => {
    // `form.elements.fabricateAdditionalActorType` returns a BARE ELEMENT rather than a
    // RadioNodeList when exactly one checkbox carries the name, which is precisely the
    // single-additional-type world this feature exists for.
    const form = renderIntoForm([
      { id: 'character', label: 'Character', checked: true, locked: true, known: true },
      { id: 'robot', label: 'Robot', checked: true, locked: false, known: true },
    ]);
    assert.deepEqual(readSelectedActorTypes(form), ['robot']);
  });

  it('reads several, including a dotted module-subtype id', () => {
    const form = renderIntoForm([
      { id: 'character', label: 'Character', checked: true, locked: true, known: true },
      { id: 'robot', label: 'Robot', checked: true, locked: false, known: true },
      { id: 'npc', label: 'NPC', checked: false, locked: false, known: true },
      { id: 'a.b', label: 'a.b', checked: true, locked: false, known: false },
    ]);
    assert.deepEqual(readSelectedActorTypes(form), ['robot', 'a.b']);
  });

  it('returns [] for a missing or non-form argument instead of throwing', () => {
    for (const value of [null, undefined, {}, 'form']) {
      assert.deepEqual(readSelectedActorTypes(value), []);
    }
  });
});

// --- lazy enumeration and labelling -----------------------------------------

describe('enumerateActorTypes / actorTypeLabel', () => {
  const originalGame = globalThis.game;
  const originalConfig = globalThis.CONFIG;
  const originalConst = globalThis.CONST;

  after(() => {
    globalThis.game = originalGame;
    globalThis.CONFIG = originalConfig;
    globalThis.CONST = originalConst;
  });

  it('returns [] before `setupPackages` populates game.documentTypes', () => {
    globalThis.game = {};
    assert.deepEqual(enumerateActorTypes(), []);
    globalThis.game = undefined;
    assert.deepEqual(enumerateActorTypes(), []);
  });

  it('reads the merged server truth and filters CONST.BASE_DOCUMENT_TYPE', () => {
    globalThis.CONST = { BASE_DOCUMENT_TYPE: 'base' };
    globalThis.game = { documentTypes: { Actor: ['base', 'character', 'robot', 'mod.sub'] } };
    assert.deepEqual(enumerateActorTypes(), ['character', 'robot', 'mod.sub']);
  });

  it('labels through CONFIG.Actor.typeLabels, gated on game.i18n.has', () => {
    globalThis.CONFIG = { Actor: { typeLabels: { robot: 'FALLOUT.TYPES.Actor.robot' } } };
    globalThis.game = {
      i18n: {
        has: (key) => key === 'FALLOUT.TYPES.Actor.robot',
        localize: (key) => (key === 'FALLOUT.TYPES.Actor.robot' ? 'Robot' : key),
      },
    };
    assert.equal(actorTypeLabel('robot'), 'Robot');
    // No typeLabels entry at all -> the raw id, which is what a stale stored type gets.
    assert.equal(actorTypeLabel('quest-pages.quest'), 'quest-pages.quest');
  });

  it('falls back to the raw id when the label key is untranslated', () => {
    globalThis.CONFIG = { Actor: { typeLabels: { robot: 'TYPES.Actor.robot' } } };
    globalThis.game = { i18n: { has: () => false, localize: (key) => key } };
    assert.equal(actorTypeLabel('robot'), 'robot');
  });
});

// --- the save round trip (criteria 3 and 4) ---------------------------------

describe('openPlayerCharacterTypesDialog', () => {
  const originalGame = globalThis.game;
  const originalFoundry = globalThis.foundry;
  const originalConfig = globalThis.CONFIG;
  const originalConst = globalThis.CONST;

  before(setupDOM);

  after(() => {
    globalThis.game = originalGame;
    globalThis.foundry = originalFoundry;
    globalThis.CONFIG = originalConfig;
    globalThis.CONST = originalConst;
    teardownDOM();
  });

  /**
   * Drive the real dialog: capture the config DialogV2 would render, build the form the
   * way `_renderHTML` does, apply `tick` to the rendered checkboxes, then invoke the
   * chosen button's callback with a `{ form }` button exactly as core does.
   */
  function runDialog({ stored = [], declared = [], tick = [], action = 'save' } = {}) {
    const writes = [];
    let renderedContent = '';
    let renderedConfig = null;
    globalThis.CONST = { BASE_DOCUMENT_TYPE: 'base' };
    globalThis.CONFIG = { Actor: { typeLabels: {} } };
    globalThis.game = {
      documentTypes: { Actor: declared },
      i18n: { has: () => false, localize: (key) => key, format: (key) => key },
      settings: {
        get: () => stored,
        set: async (namespace, key, value) => {
          writes.push({ namespace, key, value });
          return value;
        },
      },
    };
    globalThis.foundry = {
      applications: {
        api: {
          DialogV2: {
            wait: async (config) => {
              renderedConfig = config;
              renderedContent = config.content;
              const form = document.createElement('form');
              form.innerHTML = config.content;
              for (const value of tick) {
                const input = form.querySelector(`input[value="${value}"]`);
                if (input) input.checked = true;
              }
              const button = config.buttons.find((entry) => entry.action === action);
              return button.callback(new Event('click'), { form });
            },
          },
        },
      },
    };
    return {
      writes,
      content: () => renderedContent,
      config: () => renderedConfig,
      run: () => openPlayerCharacterTypesDialog(),
    };
  }

  it('asks for an explicit pixel width instead of inheriting `width: "auto"`', async () => {
    // `ApplicationV2.DEFAULT_OPTIONS.position` is `{width: "auto"}` and DialogV2 does not
    // override it; `_updatePosition` then skips its clamp and leaves the <dialog> at its
    // `fit-content` default, so the window grew to the intro paragraph's ONE-LINE
    // max-content width — near the full viewport, to hold five short checkbox rows.
    // A number is what engages `Math.clamp(targetWidth, minWidth, maxWidth)`.
    const harness = runDialog({ declared: ['character', 'robot'] });
    await harness.run();
    assert.equal(typeof harness.config().position?.width, 'number');
    assert.equal(harness.config().position.width, DIALOG_WIDTH);
    assert.ok(DIALOG_WIDTH > 0 && DIALOG_WIDTH <= 640, 'and it is a dialog, not a window');
  });

  it('persists the ticked types under the module namespace and key', async () => {
    const harness = runDialog({ declared: ['character', 'robot'], tick: ['robot'] });
    const saved = await harness.run();
    assert.deepEqual(saved, ['robot']);
    assert.deepEqual(harness.writes, [
      { namespace: NAMESPACE, key: ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES_KEY, value: ['robot'] },
    ]);
  });

  it('unticking everything persists [] — and `character` is ABSENT from the payload', async () => {
    // Criterion 3. `Array.isArray(result)` rather than truthiness, so an empty list is
    // a save rather than being misread as a cancel.
    const harness = runDialog({ declared: ['character', 'robot'], stored: [] });
    const saved = await harness.run();
    assert.deepEqual(saved, []);
    assert.equal(harness.writes.length, 1);
    assert.deepEqual(harness.writes[0].value, []);
    assert.equal(
      harness.writes[0].value.includes('character'),
      false,
      'despite the character row being present AND checked in the DOM'
    );
    assert.match(harness.content(), /checked disabled/, '...and it really was rendered checked');
  });

  it('round-trips an unknown dotted module-subtype id unchanged (criterion 4)', async () => {
    const harness = runDialog({
      declared: ['character', 'npc'],
      stored: ['quest-pages.quest'],
      tick: [],
    });
    const saved = await harness.run();
    assert.deepEqual(saved, ['quest-pages.quest'], 'an open -> Save cycle preserves it');
  });

  it('cancel writes nothing at all', async () => {
    const harness = runDialog({ declared: ['character', 'robot'], action: 'cancel' });
    assert.equal(await harness.run(), null);
    assert.deepEqual(harness.writes, []);
  });

  it('no-ops when DialogV2 is unavailable', async () => {
    globalThis.foundry = {};
    assert.equal(await openPlayerCharacterTypesDialog(), null);
  });
});

// --- the settings menu (criterion 12) ---------------------------------------

describe('registerPlayerCharacterTypesMenu', () => {
  const originalGame = globalThis.game;
  const originalFoundry = globalThis.foundry;

  after(() => {
    globalThis.game = originalGame;
    globalThis.foundry = originalFoundry;
  });

  let menus;

  beforeEach(() => {
    menus = [];
    globalThis.game = {
      settings: {
        registerMenu: (namespace, key, definition) => menus.push({ namespace, key, definition }),
      },
    };
    // MUST be stubbed, or the registration early-returns and every assertion below
    // passes vacuously against a menu that was never registered.
    globalThis.foundry = { applications: { api: { ApplicationV2: class {} } } };
  });

  it('registers a restricted menu whose render() runs the dialog instead of a window', async () => {
    assert.equal(registerPlayerCharacterTypesMenu(), true);
    assert.equal(menus.length, 1);
    const { namespace, key, definition } = menus[0];
    assert.equal(namespace, NAMESPACE);
    assert.equal(key, 'playerCharacterActorTypes');
    assert.equal(
      definition.restricted,
      true,
      'restricted hides the entry from users lacking SETTINGS_MODIFY'
    );
    assert.equal(definition.name, 'FABRICATE.Settings.PlayerCharacterActorTypes.Name');
    assert.equal(definition.label, 'FABRICATE.Settings.PlayerCharacterActorTypes.Label');
    assert.equal(definition.hint, 'FABRICATE.Settings.PlayerCharacterActorTypes.Hint');
    assert.equal(typeof definition.type, 'function');

    // The button is a direct ACTION: render() opens the dialog and returns `this`
    // rather than mounting a window.
    globalThis.foundry = {};
    const instance = new definition.type();
    assert.equal(await instance.render(), instance);
  });

  it('no-ops (returning false) when ApplicationV2 is absent, e.g. under the harness', () => {
    globalThis.foundry = {};
    assert.equal(registerPlayerCharacterTypesMenu(), false);
    assert.deepEqual(menus, []);
  });

  it('the extracted shell keeps the repair menu restricted too', async () => {
    const { registerRepairItemDataMenu } = await import('../src/config/repairItemData.js');
    assert.equal(registerRepairItemDataMenu(), true);
    const repair = menus.find((menu) => menu.key === 'repairItemData');
    assert.ok(repair, 'the converted site still registers');
    assert.equal(repair.definition.restricted, true, 'untested before the extraction');
    assert.equal(repair.definition.icon, 'fas fa-wrench');
    assert.equal(repair.definition.type.DEFAULT_OPTIONS.id, 'fabricate-repair-item-data');
  });
});

// --- live propagation -------------------------------------------------------

test('the setting-change bridge emits a local player-character-types hook', () => {
  const hooks = [];
  const handled = handleFabricateSettingChange(
    `${NAMESPACE}.${SETTING_KEYS.ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES}`,
    { callAll: (hook, payload) => hooks.push([hook, payload]) }
  );
  assert.equal(handled, true);
  assert.deepEqual(hooks, [['fabricate.playerCharacterTypesChanged', undefined]]);
});

test('the bridge ignores an unrelated setting key', () => {
  const hooks = [];
  assert.equal(
    handleFabricateSettingChange(`${NAMESPACE}.theme`, {
      callAll: (hook) => hooks.push(hook),
    }),
    false
  );
  assert.deepEqual(hooks, []);
});

// --- criterion 11: the player-write guardrail -------------------------------

describe('player-write guardrail for the actor-types key', () => {
  it('the new key is world-scoped, so the seam is capable of refusing it', async () => {
    assert.equal(
      WORLD_SCOPED_SETTING_KEYS.has(SETTING_KEYS.ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES),
      true
    );
    // Prove the check can FAIL — a mechanical guard that never fails is worthless.
    const seam = makeSettingsSeam({ isGM: false });
    await assert.rejects(
      () => seam.setSetting(SETTING_KEYS.ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES, ['robot']),
      /lacks permission to update Setting/
    );
    assert.deepEqual(seam.refused, [SETTING_KEYS.ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES]);
  });

  it('the bridge branch performs no setting write on a player client', () => {
    const seam = makeSettingsSeam({ isGM: false });
    handleFabricateSettingChange(
      `${NAMESPACE}.${SETTING_KEYS.ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES}`,
      {
        callAll: () => {},
        // Deliberately handed a settings seam it must never reach for.
        setSetting: seam.setSetting,
      }
    );
    assert.deepEqual(seam.writes, [], 'the propagation branch only re-emits a local hook');
    assert.deepEqual(seam.refused, []);
  });

  it('the bar re-seed persists a CLIENT-scoped key, which a player may write', async () => {
    // `refreshSelectableActors` routes its re-seed through `selectActor`, which persists
    // the remembered actor. That key is client-scoped, so the player seam accepts it —
    // the guardrail is that no WORLD key appears in `writes`.
    const seam = makeSettingsSeam({ isGM: false });
    await seam.setSetting(SETTING_KEYS.LAST_GATHERING_ACTOR, 'pc-1');
    assert.deepEqual(seam.writes, [{ key: SETTING_KEYS.LAST_GATHERING_ACTOR, value: 'pc-1' }]);
    assert.deepEqual(seam.refused, []);
  });
});

// --- discoverability: the two empty-state strings ---------------------------
//
// GoldenGamin's player opens Fabricate, owns a `robot`, and reads "No selectable
// characters." That string IS the bug report, and it stayed the string a Fallout GM saw
// until they found a settings menu they had no reason to know existed. The GM-facing one
// was worse: "No character actors exist in this world yet." asserts an absence while the
// GM is looking at three robots.

describe('empty-state copy', () => {
  const lang = JSON.parse(readFileSync(resolve(import.meta.dirname, '../lang/en.json'), 'utf8'));
  const barEmpty = lang.FABRICATE.App.ActorBar.NoActors;
  // Issue 1182 rehomed this string with the World > Parties pane rebuild: the pane is
  // world-scoped, so its copy moved out of the selected-system `Travel.*` namespace and
  // the whole `Travel.Members.*` subtree was retired.
  const partyEmpty = lang.FABRICATE.Admin.Manager.World.Parties.Members.NoActorsConfigured;
  // The TRAVEL-ACTOR picker's equivalent (issue 1182), gated alongside the member one so
  // the two cannot drift: they answer the same GM question about the same setting on the
  // same card, and only one of them being honest is the failure this loop exists to stop.
  // The reason is split across a short title and a body, so tone is judged on both joined.
  const travelActorEmpty = [
    lang.FABRICATE.Admin.Manager.World.Parties.TravelActor.PickerNoEligibleActors,
    lang.FABRICATE.Admin.Manager.World.Parties.TravelActor.PickerNoEligibleActorsDetail,
  ].join(' ');
  const menu = lang.FABRICATE.Settings.PlayerCharacterActorTypes;

  it('defines every key the picker localizes', () => {
    for (const key of [
      'Name',
      'Label',
      'Hint',
      'Title',
      'Body',
      'Legend',
      'AlwaysIncluded',
      'UnknownType',
      'Save',
      'Cancel',
    ]) {
      assert.equal(typeof menu?.[key], 'string', `FABRICATE.Settings.…${key} must exist`);
      assert.notEqual(menu[key].trim(), '');
    }
  });

  it('the PLAYER-facing bar string names the cause and addresses the GM in the THIRD person', () => {
    // The menu is display-gated on SETTINGS_MODIFY, so the player who reads this string
    // has no such entry in their sidebar. Telling them to open it is a dead end for
    // exactly the user who sees it most.
    assert.match(barEmpty, /player-character type/i, 'names the cause');
    assert.match(barEmpty, /ask your GM/i, 'and points at the person who can fix it');
    assert.equal(
      /\byou (can |should |may )?(open|go to|visit)\b/i.test(barEmpty),
      false,
      'it must not instruct the player to open a menu they cannot see'
    );
  });

  it('neither string implies an unconfigured actor is banned, and neither promises a way to pick it', () => {
    // Two failure modes, and the copy has to miss BOTH. Implying a ban is wrong:
    // authorization is ownership-based (`isGatheringActorSelectableByUser`) and this change
    // does not narrow it. But promising the actor "can still be used for crafting and
    // gathering attempts" is also wrong, because every UI path runs through the narrowed
    // bar list and `actorBarStore.selectScopedActor` no-ops for an owned non-PC — so a
    // player who goes looking finds nothing. The honest line is "not blocked, but not
    // pickable here".
    assert.match(barEmpty, /does not block/i, 'no implied ban');
    assert.match(barEmpty, /cannot be picked here/i, 'and no promised affordance');
    assert.equal(
      /still be used for crafting and gathering attempts/i.test(barEmpty),
      false,
      'the retired line pointed the player at a selection they cannot make anywhere'
    );
    for (const copy of [barEmpty, partyEmpty, travelActorEmpty]) {
      assert.equal(/cannot use Fabricate/i.test(copy), false);
      assert.equal(/not supported/i.test(copy), false);
    }
  });

  it('the GM-facing party string no longer asserts a false absence, and points at the setting', () => {
    assert.equal(
      partyEmpty.includes('No character actors exist in this world yet.'),
      false,
      'the retired string asserted an absence while the GM looked at three robots'
    );
    assert.match(partyEmpty, /Player Character Actor Types/, 'names the setting');
    assert.match(partyEmpty, /module settings/i, 'and where to find it');
  });

  it('the travel-actor string names the setting, its side effect, and the way round it', () => {
    assert.match(travelActorEmpty, /Player Character Actor Types/, 'names the setting');
    assert.match(travelActorEmpty, /module settings/i, 'and where to find it');
    // The setting is SHARED with the member picker, so widening it for a travel actor also
    // widens party membership. A GM who is not told that discovers it by finding a vehicle
    // offered as a party member.
    assert.match(travelActorEmpty, /eligible party members/i, 'states the shared consequence');
    // And the escape hatch, because the type list is not the only way to assign one.
    assert.match(travelActorEmpty, /drag/i, 'offers the unfiltered drop path');
  });
});

// --- live propagation wiring (source pins) ----------------------------------
//
// The GM ticks the box; four surfaces must re-project WITHOUT a reload. These are the
// app-module edges that carry the signal, and none of them is reachable from
// `node --test` without a Foundry client, so they are pinned at the source.

describe('the player-character-types hook is wired at every consuming edge', () => {
  const read = (relativePath) =>
    readFileSync(resolve(import.meta.dirname, '..', relativePath), 'utf8');

  it('main.js registers the shared setting handler on BOTH createSetting and updateSetting', () => {
    // The FIRST EVER write to a world setting is a create, not an update, so a GM
    // ticking `robot` for the first time — the exact reported journey — would otherwise
    // propagate to nobody. `updateSetting` alone was the shipped state.
    const main = read('src/main.js');
    assert.match(main, /Hooks\.on\('updateSetting', handleFabricateSettingDocumentChange\);/);
    assert.match(main, /Hooks\.on\('createSetting', handleFabricateSettingDocumentChange\);/);
    // One shared handler, taking the Setting DOCUMENT only: the two hooks do not share
    // a signature (`createSetting` emits `(doc, options, userId)`), so a second
    // positional parameter would receive `options` on the create leg.
    assert.match(main, /const handleFabricateSettingDocumentChange = \(setting\) => \{/);
  });

  it('the player app refreshes the actor bar on the hook, and unregisters it on close', () => {
    const app = read('src/ui/SvelteFabricateApp.svelte.js');
    assert.match(app, /Hooks\.on\('fabricate\.playerCharacterTypesChanged'/);
    assert.match(app, /Hooks\.off\('fabricate\.playerCharacterTypesChanged'/);
    assert.match(app, /actorBar\?\.refreshSelectableActors\?\.\(\)/);
  });

  it('the manager republishes its rosters through the existing data-changed seam', () => {
    // The GM who ticks the box is the one GUARANTEED to be looking at stale data: the
    // settings sidebar sits over an open manager.
    const app = read('src/ui/SvelteCraftingSystemManagerApp.svelte.js');
    assert.match(
      app,
      /hooks\.on\('fabricate\.playerCharacterTypesChanged', playerCharacterTypeListener\);/
    );
    assert.match(
      app,
      /hooks\?\.off\?\.\('fabricate\.playerCharacterTypesChanged', playerCharacterTypeListener\);/
    );
  });
});
