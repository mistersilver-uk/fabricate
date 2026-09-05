/**
 * The world scoped-entry editor's BUFFERED DRAFT (issue 1372, epic 1357).
 *
 * `scopedEntryDraft.js` is the shared seam behind the world essence entry editor's explicit Save,
 * and behind the world tool entry editor's next. Everything in it is pure, so this file is the
 * whole of its contract; the RENDERED half — that typing writes nothing until Save, and that the
 * button is disabled until there is something to write — is
 * `tests/components/essence-world-scope-screens-mounted.test.js`, because those are questions
 * about the DOM.
 *
 * ── WHAT EACH CLAUSE IS ACTUALLY GUARDING ─────────────────────────────────────────────────────
 * Three of these are the difference between a buffered editor that works and one that opens
 * dirty, saves too much, or never clears:
 *
 *  - a section value is stored OPAQUELY and may be a bare string or an `{id, name}` pair, so
 *    identity comparison reports every store round-trip as a change and every reload opens the
 *    editor with unsaved work in it;
 *  - a Save writes only the keys that DIFFER, so re-pointing one world default does not restate
 *    the name and description over whatever another client wrote to them meanwhile;
 *  - the exit guard answers `true` SYNCHRONOUSLY on the clean path, because the shell's route-exit
 *    cascade preserves the promise identity of what it is handed and a resolved promise there
 *    would put every route activation in the manager one microtask later.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  confirmScopedEntryExit,
  finishScopedEntryExit,
  flushScopedEntryDraft,
  scopedEntryBaseline,
  scopedEntryDirty,
  scopedEntryWrites,
  withScopedEntryDefault,
  withScopedEntryIdentity,
} from '../src/ui/svelte/apps/manager/scoped/scopedEntryDraft.js';

/** The essence entry editor's own shape, which is what the shipped caller passes. */
const SHAPE = Object.freeze({
  identityFields: Object.freeze(['name', 'icon', 'colorToken', 'description']),
  sections: Object.freeze(['effectSource', 'macro']),
});

/**
 * A projected entry, in the shape `worldScopeProjection` builds.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function entryOf({ entity = {}, defaults = null } = {}) {
  return {
    id: 'ash',
    entity: { id: 'ash', name: 'Ash', icon: 'fas fa-fire', colorToken: 'ember', ...entity },
    defaults,
  };
}

describe('the persisted snapshot a draft is seeded from and measured against', () => {
  it('reads exactly the declared identity fields and sections, and NOTHING else', () => {
    const baseline = scopedEntryBaseline(
      entryOf({
        entity: { description: 'Cinders', membershipCount: 4, enabled: false },
        defaults: { id: 'ash', effectSource: 'Item.ember', macro: 'Macro.temper' },
      }),
      SHAPE
    );
    assert.deepEqual(baseline.identity, {
      name: 'Ash',
      icon: 'fas fa-fire',
      colorToken: 'ember',
      description: 'Cinders',
    });
    assert.deepEqual(baseline.defaults, {
      effectSource: 'Item.ember',
      macro: 'Macro.temper',
    });
  });

  it('normalizes an ABSENT identity field to the empty string the control renders', () => {
    // An absent `description` and an authored empty one are the same state on this screen, and
    // treating them as different opens a never-edited editor dirty — which would light Save and
    // raise the unsaved-changes prompt on the way out of a screen nobody touched.
    const baseline = scopedEntryBaseline(entryOf(), SHAPE);
    assert.equal(baseline.identity.description, '');
    assert.equal(scopedEntryDirty({ ...baseline }, baseline), false);
  });

  it('normalizes an ABSENT section to null, which is the value that CLEARS one', () => {
    const baseline = scopedEntryBaseline(entryOf(), SHAPE);
    assert.deepEqual(baseline.defaults, { effectSource: null, macro: null });
  });

  it('lets a shape name a READER per section, for a buffered field that is not under `defaults` (M34)', () => {
    // The entry's aliases live on the ENTITY record, so the baseline reads them through a reader;
    // a section with no reader keeps the `defaults[section] ?? null` snapshot.
    const entry = { entity: { name: 'Coal', aliasItemUuids: ['Item.a'] }, defaults: { category: 'Raw' } };
    const baseline = scopedEntryBaseline(entry, {
      identityFields: ['name'],
      sections: ['category', 'aliases'],
      readers: { aliases: (record) => record?.entity?.aliasItemUuids ?? null },
    });
    assert.deepEqual(baseline, {
      identity: { name: 'Coal' },
      defaults: { category: 'Raw', aliases: ['Item.a'] },
    });
    assert.deepEqual(
      scopedEntryBaseline({ entity: {} }, { sections: ['aliases'], readers: { aliases: (record) => record?.entity?.aliasItemUuids ?? null } }).defaults,
      { aliases: null },
      'an absent buffered field is null, exactly as an absent section is'
    );
  });

  it('answers a shape for a MISSING entry rather than throwing', () => {
    // Reached on every mount before the world corpus publishes, and again when the record the
    // route is open on is deleted from under it.
    const baseline = scopedEntryBaseline(null, SHAPE);
    assert.deepEqual(baseline.identity, { name: '', icon: '', colorToken: '', description: '' });
    assert.deepEqual(baseline.defaults, { effectSource: null, macro: null });
  });
});

describe('an edit produces a NEW draft object', () => {
  it('never mutates the draft it was handed, on either part', () => {
    // This module's own answers depend on it: `scopedEntryWrites` takes the draft and the
    // persisted snapshot as two values, and the caller seeds the draft FROM that snapshot — so a
    // wither that mutated its argument would make the two one object and report every edit as no
    // change. That is why it is asserted here, as a property of the function, rather than left to
    // each caller to remember.
    const baseline = scopedEntryBaseline(entryOf(), SHAPE);
    const named = withScopedEntryIdentity(baseline, 'name', 'Aether');
    assert.notEqual(named, baseline);
    assert.notEqual(named.identity, baseline.identity);
    assert.equal(baseline.identity.name, 'Ash', 'the original draft was mutated');

    const pointed = withScopedEntryDefault(named, 'macro', 'Macro.temper');
    assert.notEqual(pointed.defaults, named.defaults);
    assert.equal(named.defaults.macro, null, 'the original draft was mutated');
    assert.equal(pointed.identity.name, 'Aether', 'the other part was dropped');
  });
});

describe('what a Save writes, and what it deliberately does not', () => {
  it('writes only the identity fields that DIFFER, and no section at all', () => {
    const baseline = scopedEntryBaseline(entryOf(), SHAPE);
    const writes = scopedEntryWrites(withScopedEntryIdentity(baseline, 'name', 'Aether'), baseline);
    assert.deepEqual(writes.identity, { name: 'Aether' });
    assert.deepEqual(writes.sections, []);
  });

  it('writes only the sections that DIFFER, and no identity patch at all', () => {
    const baseline = scopedEntryBaseline(entryOf(), SHAPE);
    const writes = scopedEntryWrites(
      withScopedEntryDefault(baseline, 'macro', 'Macro.temper'),
      baseline
    );
    assert.equal(
      writes.identity,
      null,
      're-pointing one world default must not restate the name and description over whatever ' +
        'another client wrote to them while this editor was open'
    );
    assert.deepEqual(writes.sections, [{ section: 'macro', value: 'Macro.temper' }]);
  });

  it('treats CLEARING a section as a write of null, not as no change', () => {
    const baseline = scopedEntryBaseline(
      entryOf({ defaults: { id: 'ash', effectSource: 'Item.ember' } }),
      SHAPE
    );
    const writes = scopedEntryWrites(
      withScopedEntryDefault(baseline, 'effectSource', null),
      baseline
    );
    assert.deepEqual(writes.sections, [{ section: 'effectSource', value: null }]);
  });

  it('compares an OPAQUE section value STRUCTURALLY, so a round-trip is not a change', () => {
    // `updateWorldDefaultSection` writes the value opaquely and the normalizer coerces shape
    // rather than meaning, so the same authored default arrives as a NEW object on every publish.
    // Reference comparison would report it as an edit and open the editor dirty, for ever.
    const stored = { id: 'Item.ember', name: 'Ember Brand' };
    const baseline = scopedEntryBaseline(
      entryOf({ defaults: { id: 'ash', effectSource: stored } }),
      SHAPE
    );
    const republished = scopedEntryBaseline(
      entryOf({ defaults: { id: 'ash', effectSource: { name: 'Ember Brand', id: 'Item.ember' } } }),
      SHAPE
    );
    assert.notEqual(baseline.defaults.effectSource, republished.defaults.effectSource);
    assert.equal(scopedEntryDirty(baseline, republished), false);
    // …and a value that really did change is still a change, so the equality above is not a
    // comparison that always answers "same".
    const moved = withScopedEntryDefault(baseline, 'effectSource', {
      id: 'Item.frost',
      name: 'Ember Brand',
    });
    assert.equal(scopedEntryDirty(moved, republished), true);
  });

  it('is not dirty for a draft that has not been seeded', () => {
    assert.equal(scopedEntryDirty(null, scopedEntryBaseline(entryOf(), SHAPE)), false);
  });
});

describe('flushing a draft through the world-scope write family', () => {
  /** A recording stand-in for one entity type's action family. */
  function actionsOf({ updateEntity = async () => true, updateWorldDefaultSection = async () => true } = {}) {
    const calls = [];
    return {
      calls,
      updateEntity: async (...args) => {
        calls.push(['updateEntity', ...args]);
        return updateEntity(...args);
      },
      updateWorldDefaultSection: async (...args) => {
        calls.push(['updateWorldDefaultSection', ...args]);
        return updateWorldDefaultSection(...args);
      },
    };
  }

  it('lands the identity patch FIRST and then each section, in the declared order', () => {
    const actions = actionsOf();
    return flushScopedEntryDraft({
      entityId: 'ash',
      writes: {
        identity: { name: 'Aether' },
        sections: [
          { section: 'effectSource', value: 'Item.ember' },
          { section: 'macro', value: null },
        ],
      },
      actions,
    }).then((landed) => {
      assert.equal(landed, true);
      assert.deepEqual(actions.calls, [
        ['updateEntity', 'ash', { name: 'Aether' }],
        ['updateWorldDefaultSection', 'ash', 'effectSource', 'Item.ember'],
        ['updateWorldDefaultSection', 'ash', 'macro', null],
      ]);
    });
  });

  it('STOPS at the first refusal and reports it, so a half-written record cannot pass for saved', async () => {
    const actions = actionsOf({ updateEntity: async () => false });
    const landed = await flushScopedEntryDraft({
      entityId: 'ash',
      writes: {
        identity: { name: 'Aether' },
        sections: [{ section: 'macro', value: 'Macro.temper' }],
      },
      actions,
    });
    assert.equal(landed, false);
    assert.deepEqual(
      actions.calls.map(([name]) => name),
      ['updateEntity'],
      'the section write ran after the identity patch had already refused'
    );
  });

  // ── issue 1371 r18-entry, maintainer ruling M34 ──────────────────────────────────────────────
  it('lets a shape name a WRITER per section, so a buffered field that is not a world default lands through its own action, in the declared order', async () => {
    // The world Component entry buffers its tags (`setWorldTags`) and its aliases (`updateEntity`'s
    // `aliasItemUuids`) beside its two real sections; without a writer map the flush would hand
    // `updateWorldDefaultSection` a name it refuses before it writes, silently.
    const actions = actionsOf();
    actions.setWorldTags = async (...args) => {
      actions.calls.push(['setWorldTags', ...args]);
      return true;
    };
    const landed = await flushScopedEntryDraft({
      entityId: 'coal',
      writes: {
        identity: null,
        sections: [
          { section: 'category', value: 'Raw' },
          { section: 'tags', value: ['fuel'] },
          { section: 'essences', value: { flame: 2 } },
          { section: 'aliases', value: ['Item.a'] },
        ],
      },
      actions,
      writers: {
        tags: (family, entityId, value) => family.setWorldTags(entityId, value ?? []),
        aliases: (family, entityId, value) => family.updateEntity(entityId, { aliasItemUuids: value ?? [] }),
      },
    });
    assert.equal(landed, true);
    assert.deepEqual(actions.calls, [
      ['updateWorldDefaultSection', 'coal', 'category', 'Raw'],
      ['setWorldTags', 'coal', ['fuel']],
      ['updateWorldDefaultSection', 'coal', 'essences', { flame: 2 }],
      ['updateEntity', 'coal', { aliasItemUuids: ['Item.a'] }],
    ]);
  });

  it('and a writer’s refusal stops the flush like any other', async () => {
    const actions = actionsOf();
    const landed = await flushScopedEntryDraft({
      entityId: 'coal',
      writes: { identity: null, sections: [{ section: 'tags', value: [] }, { section: 'essences', value: {} }] },
      actions,
      writers: { tags: async () => false },
    });
    assert.equal(landed, false);
    assert.deepEqual(actions.calls, [], 'the essence write after the refused tag write never ran');
  });

  it('refuses an empty entity id rather than writing against nothing', async () => {
    const actions = actionsOf();
    assert.equal(
      await flushScopedEntryDraft({ entityId: '', writes: { identity: {}, sections: [] }, actions }),
      false
    );
    assert.deepEqual(actions.calls, []);
  });
});

describe('the route-exit guard', () => {
  it('answers true SYNCHRONOUSLY when there is nothing to ask, and asks nothing', () => {
    // Load-bearing rather than an optimization: the shell's cascade preserves the promise
    // identity of what it is handed, so a resolved promise on the clean path would put EVERY
    // route activation in the manager one microtask later.
    let asked = 0;
    const answer = confirmScopedEntryExit({
      dirty: false,
      confirm: () => {
        asked += 1;
        return 'cancel';
      },
      save: () => true,
      discard: () => {},
    });
    assert.equal(answer, true);
    assert.equal(typeof answer?.then, 'undefined', 'the clean path returned a promise');
    assert.equal(asked, 0);
  });

  it('gates navigation on the SAVE landing, not on the choice being made', async () => {
    const refused = await confirmScopedEntryExit({
      dirty: true,
      confirm: () => Promise.resolve('save'),
      save: () => Promise.resolve(false),
      discard: () => assert.fail('discard ran on the save branch'),
    });
    assert.equal(refused, false, 'a Save that did not land must leave the GM on the editor');

    const landed = await confirmScopedEntryExit({
      dirty: true,
      confirm: () => Promise.resolve('save'),
      save: () => Promise.resolve(true),
      discard: () => assert.fail('discard ran on the save branch'),
    });
    assert.equal(landed, true);
  });

  it('discards and proceeds, or cancels and stays, on the other two answers', () => {
    let discarded = 0;
    assert.equal(
      finishScopedEntryExit('discard', { save: () => assert.fail('saved'), discard: () => (discarded += 1) }),
      true
    );
    assert.equal(discarded, 1);
    assert.equal(
      finishScopedEntryExit('cancel', { save: () => assert.fail('saved'), discard: () => assert.fail('discarded') }),
      false
    );
  });

  it('reads the BOOLEAN answers the two-way fallback prompt gives, which the shared dialog answers with when no three-way one exists', () => {
    // `_confirmDiscardDirtyDraft` degrades to a yes/no `confirmDialog` when the services bag
    // carries no `choiceDialog`, and that path answers `'discard' | 'cancel'` — but the boolean
    // pair reaches this shape from `confirmDiscardDirtyToolsDraft`, so both are read.
    let discarded = 0;
    assert.equal(
      finishScopedEntryExit(true, { save: () => assert.fail('saved'), discard: () => (discarded += 1) }),
      true
    );
    assert.equal(discarded, 1);
    assert.equal(
      finishScopedEntryExit(false, { save: () => assert.fail('saved'), discard: () => assert.fail('discarded') }),
      false
    );
  });
});
