/** Bounded source-description embeds: replace inline content, not entire rich Document HTML. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { expandDescriptionEmbeds } from '../src/systems/descriptionEmbeds.js';
import { plainTextDescription } from '../src/utils/plainTextDescription.js';

import { setupDOM, teardownDOM } from './helpers/svelte-dom.js';

const SCROLL_UUID = 'Compendium.dnd5e.equipment24.Item.dmgSpellScroll00';

function fixtures(documents) {
  const calls = [];
  const io = {
    resolveEmbedUuid: async (uuid, relativeTo) => {
      calls.push({ uuid, relativeTo: relativeTo?.uuid });
      return documents[uuid] ?? null;
    },
    rawSourceDescription: (document) => document.description ?? '',
    enrichToHtml: async (raw, { relativeTo }) =>
      relativeTo?.uuid === 'Item.embedded'
        ? raw.replaceAll('@UUID[.Item.reference]', '<a>Referenced Item</a>')
        : raw,
    plainTextDescription,
  };
  return { io, calls };
}

test('expands the real dnd5e inline spell-scroll syntax into the referenced Item text', async (t) => {
  setupDOM();
  t.after(teardownDOM);
  const source = { uuid: 'Item.spell-scroll-1' };
  const { io, calls } = fixtures({
    [SCROLL_UUID]: {
      uuid: SCROLL_UUID,
      name: 'Spell Scroll, Cantrip',
      description: '<p>A spell scroll bears the words of a single spell.</p>',
    },
  });

  const original = 'Before @Embed[' + SCROLL_UUID + ' inline] after.';
  const result = await expandDescriptionEmbeds(original, source, io);

  assert.equal(plainTextDescription(result), 'Before A spell scroll bears the words of a single spell. after.');
  assert.equal(result.includes('@Embed'), false);
  assert.deepEqual(calls, [{ uuid: SCROLL_UUID, relativeTo: source.uuid }]);
});

test('resolves nested relative links in the EMBEDDED document context and strips private text', async (t) => {
  setupDOM();
  t.after(teardownDOM);
  const source = { uuid: 'Item.parent' };
  const { io, calls } = fixtures({
    'Item.embedded': {
      uuid: 'Item.embedded',
      name: 'Public Notes',
      description:
        '<p>See @UUID[.Item.reference].</p>' +
        '<section data-visibility="gm">GM secret</section>' +
        '<section class="secret">Unrevealed secret</section>',
    },
  });

  const result = await expandDescriptionEmbeds(
    'Public: @Embed[uuid=Item.embedded inline]',
    source,
    io
  );

  assert.equal(plainTextDescription(result), 'Public: See Referenced Item.');
  assert.deepEqual(calls, [{ uuid: 'Item.embedded', relativeTo: source.uuid }]);
  assert.ok(!result.includes('GM secret'));
  assert.ok(!result.includes('Unrevealed secret'));
});

test('honours authored captions for block embeds and omits them for inline embeds', async (t) => {
  setupDOM();
  t.after(teardownDOM);
  const source = { uuid: 'Item.parent' };
  const { io } = fixtures({
    'Item.page': { uuid: 'Item.page', name: 'Rules', description: '<p>Useful prose.</p>' },
  });

  assert.equal(
    plainTextDescription(await expandDescriptionEmbeds('@Embed[Item.page]{Custom heading}', source, io)),
    'Custom heading Useful prose.'
  );
  assert.equal(
    plainTextDescription(await expandDescriptionEmbeds('@Embed[Item.page caption=false]', source, io)),
    'Useful prose.'
  );
  assert.equal(
    plainTextDescription(await expandDescriptionEmbeds('@Embed[Item.page inline]', source, io)),
    'Useful prose.'
  );
});

test('retains missing references, limits oversized sources, and prevents recursive cycles', async (t) => {
  setupDOM();
  t.after(teardownDOM);
  const source = { uuid: 'Item.A', name: 'Alpha' };
  const { io } = fixtures({
    'Item.A': {
      uuid: 'Item.A',
      name: 'Alpha',
      description: '<p>Root</p>',
    },
    'Item.B': {
      uuid: 'Item.B',
      name: 'Beta',
      description: '<p>Nested @Embed[Item.A inline]</p>',
    },
    'Item.huge': {
      uuid: 'Item.huge',
      name: 'Too long',
      description: 'X'.repeat(12_001),
    },
  });

  const missing = '@Embed[Item.removed inline]';
  assert.equal(await expandDescriptionEmbeds(missing, source, io), missing);
  assert.equal(
    plainTextDescription(await expandDescriptionEmbeds('@Embed[Item.B inline]', source, io)),
    'Nested Alpha'
  );
  assert.equal(
    plainTextDescription(await expandDescriptionEmbeds('@Embed[Item.huge inline]', source, io)),
    'Too long'
  );
});

test('never expands more than sixteen embeds in a single source description', async (t) => {
  setupDOM();
  t.after(teardownDOM);
  const { io, calls } = fixtures({
    'Item.short': { uuid: 'Item.short', name: 'Short', description: 'Short body' },
  });
  const input = Array.from({ length: 17 }, () => '@Embed[Item.short inline]').join(' / ');
  const result = await expandDescriptionEmbeds(input, { uuid: 'Item.parent' }, io);

  assert.equal(calls.length, 16);
  assert.equal(result.split('Short body').length - 1, 16);
  assert.equal(result.split('@Embed[Item.short inline]').length - 1, 1);
});
