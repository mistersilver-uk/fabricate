/**
 * `BulkSalvageChatCard` — the aggregated result card for a bulk run (issue 859).
 *
 * The module is a PURE MARKUP BUILDER: it never touches `game`, `ui` or `ChatMessage`,
 * so every case below is a plain model in and a string out with no Foundry stubs. The
 * "which token did the applier receive" assertions live in
 * `tests/bulk-chat-visibility.test.js`, which imports the module that actually owns that
 * decision — a pin here could only ever mirror it.
 *
 * The per-system `features.chatOutput` gate is the SERVICE's (only it holds the crafting
 * systems), so the one test of it below drives the real service and asserts on the card
 * that reached the poster — the join, not a re-derivation of it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BULK_SALVAGE_CHAT_KEYS,
  buildBulkSalvageChatContent,
  sumChatEntriesByName,
} from '../src/systems/BulkSalvageChatCard.js';
import { BulkSalvageService } from '../src/systems/BulkSalvageService.js';
import { SALVAGE_CHAT_KEYS } from '../src/systems/SalvageChatCard.js';
import {
  bulkComponent,
  bulkSystem,
  bulkTarget,
  cardSubject,
  craftingSystemLookup,
} from './helpers/bulkSalvageFixtures.js';

/** A localizer that renders each key as a readable, greppable token. */
const loc = (key) => `[${key.split('.').at(-1)}]`;

/** Build a card and hand back its markup. */
function card(model) {
  return buildBulkSalvageChatContent(model, loc);
}

/** How many times `needle` occurs in `text`. */
const occurrences = (text, needle) => text.split(needle).length - 1;

describe('buildBulkSalvageChatContent: N subjects, each with its own roll', () => {
  const MODEL = {
    status: 'mixed',
    actorNames: ['Akra'],
    counts: { total: 3, succeeded: 1, failed: 1, waiting: 1 },
    subjects: [
      cardSubject({ name: 'Iron Ore', img: 'icons/ore.webp', rollValue: 17 }),
      cardSubject({
        name: 'Boar Hide',
        img: 'icons/hide.webp',
        outcome: 'failed',
        rollValue: 4,
        message: 'Nothing recovered',
      }),
      cardSubject({
        name: 'Cave Bone',
        img: 'icons/bone.webp',
        outcome: 'waiting',
        message: 'Started (60s remaining)',
      }),
    ],
  };

  it('renders one row per subject, in execution order', () => {
    const html = card(MODEL);
    const rows = html.match(/fabricate-craft-chat__item/g) ?? [];
    assert.equal(rows.length, 3, 'one row each — the single card cannot express this at all');
    const order = ['Iron Ore', 'Boar Hide', 'Cave Bone'].map((name) => html.indexOf(name));
    assert.deepEqual(
      [...order].sort((left, right) => left - right),
      order,
      'execution order'
    );
  });

  it("carries each subject's OWN roll total, and omits the row where nothing rolled", () => {
    const html = card(MODEL);
    assert.match(html, /fabricate-craft-chat__roll-value">17</);
    assert.match(html, /fabricate-craft-chat__roll-value">4</);
    assert.equal(
      occurrences(html, 'fabricate-craft-chat__roll-value'),
      2,
      'the time-gated subject rolled nothing, so it prints no total rather than a 0'
    );
  });

  it('names each outcome with its own copy key', () => {
    const html = card(MODEL);
    assert.match(html, /\[BulkSalvageOutcomeSucceeded]/);
    assert.match(html, /\[BulkSalvageOutcomeFailed]/);
    assert.match(html, /\[BulkSalvageOutcomeWaiting]/);
  });

  it("shows a non-success subject's engine message but never a success's", () => {
    // A success has already said everything it has to say through its outcome copy and
    // its recovered items; repeating the engine's message would be noise. A failure's
    // message ("Not enough Iron Ore. Need 2, have 1") is the only place it can say WHY.
    const html = card({
      ...MODEL,
      subjects: [
        cardSubject({ name: 'Iron Ore', message: 'Salvaged Iron Ore' }),
        cardSubject({ name: 'Boar Hide', outcome: 'failed', message: 'Need 2, have 1' }),
      ],
    });
    assert.match(html, /Need 2, have 1/);
    assert.doesNotMatch(html, /Salvaged Iron Ore/);
  });

  it('renders a tier-step sentence inline in the subject row that earned it', () => {
    const html = card({
      ...MODEL,
      subjects: [
        cardSubject({ name: 'Iron Ore', rollValue: 16, tierStep: { mode: 'up', steps: 1 } }),
      ],
    });
    assert.match(html, /\[TierStepUp]/, 'the shared tier-step sentence, not a second derivation');
  });

  it('falls back to the shared item image for a subject with none', () => {
    const html = card({ ...MODEL, subjects: [cardSubject({ name: 'Iron Ore', img: '' })] });
    assert.match(html, /src="icons\/svg\/item-bag\.svg"/);
  });

  it('omits the whole subjects section when there are none', () => {
    const html = card({ status: 'failed', actorNames: ['Akra'], subjects: [] });
    assert.doesNotMatch(html, /--subjects/);
  });
});

describe('buildBulkSalvageChatContent: the three roll-up statuses', () => {
  const STATUSES = [
    { status: 'succeeded', modifier: 'success', key: 'BulkSalvageSuccess' },
    { status: 'mixed', modifier: 'mixed', key: 'BulkSalvageMixed' },
    { status: 'failed', modifier: 'failure', key: 'BulkSalvageFailure' },
  ];

  for (const testCase of STATUSES) {
    it(`${testCase.status} emits its own modifier and title`, () => {
      const html = card({ status: testCase.status, actorNames: ['Akra'], subjects: [] });
      assert.match(html, new RegExp(`fabricate-craft-chat--${testCase.modifier}\\b`));
      assert.match(html, new RegExp(`\\[${testCase.key}]`));
    });
  }

  it('falls back to `mixed` for an unknown status rather than emitting a bare token', () => {
    const html = card({ status: 'partial', actorNames: ['Akra'], subjects: [] });
    assert.match(html, /fabricate-craft-chat--mixed/);
    assert.doesNotMatch(html, /--partial/, '`partial` already names a progressive award mode');
  });

  it('substitutes every count the summary sentence offers a placeholder for', () => {
    const html = buildBulkSalvageChatContent(
      {
        status: 'mixed',
        actorNames: ['Akra'],
        counts: { total: 5, succeeded: 3, failed: 2 },
        subjects: [],
      },
      (key) =>
        key === BULK_SALVAGE_CHAT_KEYS.summary
          ? '{succeeded} of {total} worked, {failed} did not'
          : key
    );
    assert.match(html, /3 of 5 worked, 2 did not/);
  });

  it('leaves an unused placeholder alone rather than blanking it', () => {
    const html = buildBulkSalvageChatContent(
      { status: 'mixed', actorNames: [], counts: { total: 2 }, subjects: [] },
      (key) => (key === BULK_SALVAGE_CHAT_KEYS.summary ? '{total} rows, {unknown} others' : key)
    );
    assert.match(html, /2 rows, \{unknown} others/);
  });
});

describe('sumChatEntriesByName: aggregation by name AND image', () => {
  it('sums two contributions of the same component into one row', () => {
    // Two rows recovering the same component from different sources; a card listing
    // "Iron Ingot ×1" three times reads as a bug.
    assert.deepEqual(
      sumChatEntriesByName([
        { name: 'Iron Ingot', img: 'icons/ingot.webp', quantity: 2 },
        { name: 'Iron Ingot', img: 'icons/ingot.webp', quantity: 3 },
      ]),
      [{ name: 'Iron Ingot', img: 'icons/ingot.webp', quantity: 5 }]
    );
  });

  it('keeps two same-named entries with DIFFERENT images apart', () => {
    // Component ids are not globally unique across systems, so two systems can each
    // author an "Iron Ingot" with its own art. Merging them would show one row with the
    // wrong picture.
    const summed = sumChatEntriesByName([
      { name: 'Iron Ingot', img: 'icons/a.webp', quantity: 1 },
      { name: 'Iron Ingot', img: 'icons/b.webp', quantity: 1 },
    ]);
    assert.equal(summed.length, 2);
    assert.deepEqual(
      summed.map((entry) => entry.img),
      ['icons/a.webp', 'icons/b.webp']
    );
  });

  it('orders by name with localeCompare, never an uncompared sort', () => {
    assert.deepEqual(
      sumChatEntriesByName([
        { name: 'Zinc', quantity: 1 },
        { name: 'Ash', quantity: 1 },
        { name: 'Iron', quantity: 1 },
      ]).map((entry) => entry.name),
      ['Ash', 'Iron', 'Zinc']
    );
  });

  it('treats a missing, zero or negative quantity as one unit', () => {
    for (const quantity of [undefined, null, 0, -3, 'many']) {
      assert.deepEqual(
        sumChatEntriesByName([{ name: 'Ash', img: '', quantity }]),
        [{ name: 'Ash', img: '', quantity: 1 }],
        String(quantity)
      );
    }
  });

  it('skips null entries and tolerates an absent list', () => {
    assert.deepEqual(sumChatEntriesByName([null, undefined]), []);
    assert.deepEqual(sumChatEntriesByName(undefined), []);
  });
});

describe('buildBulkSalvageChatContent: empty sections are omitted, not emptied', () => {
  const base = { status: 'succeeded', actorNames: ['Akra'], subjects: [cardSubject({})] };

  it('renders no Recovered heading for a run that recovered nothing', () => {
    const html = card({ ...base, results: [], consumed: [], tools: [] });
    assert.doesNotMatch(html, /--results/);
    assert.doesNotMatch(html, /--consumed/);
    assert.doesNotMatch(html, /--tools/);
  });

  it('renders each aggregate section only when it carries entries', () => {
    const html = card({
      ...base,
      results: [{ name: 'Iron Ingot', img: 'icons/ingot.webp', quantity: 4 }],
      consumed: [{ name: 'Iron Ore', img: 'icons/ore.webp', quantity: 4 }],
      tools: [],
    });
    assert.match(html, /--results/);
    assert.match(html, /\[SalvageRecovered]/);
    assert.match(html, /4× Iron Ingot/);
    assert.match(html, /--consumed/);
    assert.doesNotMatch(html, /--tools/, 'no tool broke, so there is no broken-tool heading');
  });

  it('reads the shared salvage vocabulary rather than re-spelling it', () => {
    // The aggregate card must not drift from the single card's headings.
    const html = card({
      ...base,
      results: [{ name: 'Iron Ingot', quantity: 1 }],
      tools: [{ name: 'Hammer', img: 'icons/h.webp' }],
    });
    assert.match(html, new RegExp(`\\[${SALVAGE_CHAT_KEYS.results.split('.').at(-1)}]`));
    assert.match(html, new RegExp(`\\[${SALVAGE_CHAT_KEYS.tools.split('.').at(-1)}]`));
    assert.match(html, new RegExp(`\\[${SALVAGE_CHAT_KEYS.actor.split('.').at(-1)}]`));
  });
});

describe('buildBulkSalvageChatContent: authored names are escaped', () => {
  // Component names, actor names and engine messages are all author- or player-supplied
  // and all land in the card's markup. `esc` is the shared escaper, so this pins that
  // every interpolation goes through it rather than one route being missed.
  const HOSTILE = '<img src=x onerror="alert(1)"> & "quoted"';

  it('escapes a subject name', () => {
    const html = card({
      status: 'succeeded',
      actorNames: [],
      subjects: [cardSubject({ name: HOSTILE })],
    });
    assert.doesNotMatch(html, /onerror="alert/);
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &quot;quoted&quot;/);
  });

  it('escapes an actor name in the subtitle', () => {
    const html = card({ status: 'succeeded', actorNames: [HOSTILE], subjects: [] });
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x/);
  });

  it('escapes an engine message and an aggregate entry name', () => {
    const html = card({
      status: 'failed',
      actorNames: [],
      subjects: [cardSubject({ name: 'Ore', outcome: 'failed', message: HOSTILE })],
      results: [{ name: HOSTILE, img: HOSTILE, quantity: 2 }],
    });
    assert.doesNotMatch(html, /onerror="alert/);
    assert.doesNotMatch(html, /src="<img/);
  });

  it('escapes a localized string, so a translation cannot inject markup either', () => {
    const html = buildBulkSalvageChatContent(
      { status: 'succeeded', actorNames: [], subjects: [] },
      () => HOSTILE
    );
    assert.doesNotMatch(html, /onerror="alert/);
  });
});

describe('the per-system chatOutput gate reaches the card, not just the model', () => {
  /** Run two rows in two systems and hand back whatever was posted. */
  async function runTwoSystems({ chatOutputA, chatOutputB }) {
    const posted = [];
    const service = new BulkSalvageService({
      salvage: async (actorUuid, systemId, componentId) => ({
        success: true,
        results: [{ name: `${componentId} ingot`, img: 'icons/ingot.webp' }],
      }),
      getCraftingSystem: craftingSystemLookup([
        bulkSystem({
          id: 'sys-a',
          chatOutput: chatOutputA,
          components: [bulkComponent({ id: 'comp-ore', name: 'Iron Ore' })],
        }),
        bulkSystem({
          id: 'sys-b',
          chatOutput: chatOutputB,
          components: [bulkComponent({ id: 'comp-hide', name: 'Boar Hide' })],
        }),
      ]),
      postChatMessage: async (message) => posted.push(message),
    });
    const result = await service.run({
      targets: [
        bulkTarget({ systemId: 'sys-a', componentId: 'comp-ore' }),
        bulkTarget({ systemId: 'sys-b', componentId: 'comp-hide' }),
      ],
      interactive: false,
    });
    return { posted, result };
  }

  it('a subject appears iff ITS OWN system has chatOutput enabled', async () => {
    // Acceptance 9. Each system's GM decides independently whether Fabricate narrates,
    // and a run can span systems — so this is a per-subject filter, not a run-level one.
    const { posted } = await runTwoSystems({ chatOutputA: true, chatOutputB: false });
    assert.equal(posted.length, 1);
    assert.match(posted[0].content, /Iron Ore/);
    assert.doesNotMatch(posted[0].content, /Boar Hide/);
    assert.doesNotMatch(posted[0].content, /comp-hide ingot/, 'nor its recovered contribution');
  });

  it('posts nothing at all when no system qualifies', async () => {
    const { posted, result } = await runTwoSystems({ chatOutputA: false, chatOutputB: false });
    assert.equal(posted.length, 0, 'nothing — not an empty card');
    assert.equal(result.posted, false);
    assert.equal(result.counts.succeeded, 2, 'and the run itself still happened');
  });
});
