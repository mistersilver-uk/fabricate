/** THE GM NOTICES (issue 1363, criterion 11). */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  getHighestRegisteredMigrationVersion,
  MigrationRunner,
} from '../src/migration/MigrationRunner.js';
import { buildWorldEssenceMergeRemapNotice } from '../src/systems/remapWorldScopeIdentityFlags.js';
import {
  buildWorldEssenceMergeNotice,
  buildWorldScopeEntityNotice,
  buildWorldScopeIdentityRemapNotice,
  describeWorldEssenceMerge,
} from '../src/systems/worldScopeEntityNotice.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAIN = readFileSync(resolve(HERE, '..', 'src', 'main.js'), 'utf8');
const LANG = JSON.parse(readFileSync(resolve(HERE, '..', 'lang', 'en.json'), 'utf8'));
const EMPTY = Object.freeze({ message: '', detail: '' });

/** No localizer, so every assertion below reads the FALLBACK sentence the module composes. */
const noLocalizer = () => undefined;

/** `game.i18n.format` over `lang/en.json`, so a composition reads the shipped strings. */
function localizeLang(key, data) {
  const template = key.split('.').reduce((node, segment) => node?.[segment], LANG);
  if (typeof template !== 'string') return undefined;
  return Object.entries(data ?? {}).reduce(
    (text, [token, value]) => text.replaceAll(`{${token}}`, String(value)),
    template
  );
}

/** A report with one of everything, so every clause is reachable from one fixture. */
function fullReport(overrides = {}) {
  return {
    createdEntities: { components: 3, essences: 2, tools: 1 },
    mergedGroups: [
      { entityType: 'components', entityId: 'c1', systemIds: ['sys-a', 'sys-b'] },
      { entityType: 'tools', entityId: 't1', systemIds: ['sys-a', 'sys-b'] },
    ],
    transitiveGroups: [{ entityType: 'components', entityId: 'c1', members: [] }],
    renames: [
      {
        entityType: 'components',
        entityId: 'c1',
        systemId: 'sys-b',
        donorSystemId: 'sys-a',
        oldId: 'c9',
        newId: 'c1',
        changedFields: ['name'],
      },
    ],
    overriddenRecords: 6,
    refusals: [{ systemId: 'sys-c', entityType: 'components', reason: 'outputIdCollision' }],
    flaggedForReview: [{ systemId: 'sys-a', entityType: 'tools', referenceId: 'ghost-tool' }],
    payloadRewriteRepairs: 0,
    ...overrides,
  };
}

/** The same report with every optional list emptied. */
const createdOnly = () =>
  fullReport({ mergedGroups: [], transitiveGroups: [], renames: [], refusals: [], flaggedForReview: [] });

test('the CREATED counts are the numbers the report carries, per entity type', () => {
  // A SUM, which is exactly what a source-text grep cannot pin.
  const { message, detail } = buildWorldScopeEntityNotice(fullReport(), noLocalizer);
  for (const text of [message, detail]) {
    assert.match(text, /3 world component\(s\)/);
    assert.match(text, /2 world essence\(s\)/);
    assert.match(text, /1 world tool\(s\)/);
  }
});

test('each optional clause appears only when its list is non-empty, and names its count', () => {
  const full = buildWorldScopeEntityNotice(fullReport(), noLocalizer);
  assert.match(full.message, /1 definition\(s\)/, 'the RENAMES clause is counted in the toast');
  assert.match(full.message, /1 system\(s\) could not be re-keyed/, 'the REFUSALS clause');
  assert.match(full.message, /1 reference\(s\)/, 'the FLAGGED clause');
  assert.match(full.detail, /2 of them were the same real item/, 'the MERGED clause is console detail');
  assert.match(
    full.detail,
    /1 group\(s\) were merged through a shared source item/,
    'the TRANSITIVE clause'
  );
  assert.doesNotMatch(full.message, /group\(s\)/, 'neither reaches the toast');

  const bare = buildWorldScopeEntityNotice(createdOnly(), noLocalizer);
  assert.match(bare.message, /world component\(s\)/, 'the created clause always appears');
  for (const absent of [/group\(s\)/, /definition\(s\)/, /pair\(s\)/, /reference\(s\)/]) {
    assert.doesNotMatch(bare.message, absent, 'an empty list contributes NO clause');
    assert.doesNotMatch(bare.detail, absent, 'to either channel');
  }
});

test('EVERY rename is named in the detail, with both systems and both ids, and none in the toast', () => {
  const report = fullReport({
    renames: [
      {
        entityType: 'components',
        entityId: 'c1',
        systemId: 'sys-b',
        donorSystemId: 'sys-a',
        oldId: 'c9',
        newId: 'c1',
        changedFields: [],
      },
      {
        entityType: 'tools',
        entityId: 't1',
        systemId: 'sys-c',
        donorSystemId: 'sys-a',
        oldId: 't7',
        newId: 't1',
        changedFields: ['img'],
      },
    ],
  });
  const { message, detail } = buildWorldScopeEntityNotice(report, noLocalizer);
  for (const rename of report.renames) {
    assert.ok(detail.includes(rename.oldId), `${rename.oldId} must be named`);
    assert.ok(detail.includes(rename.newId), `${rename.newId} must be named`);
    assert.ok(detail.includes(rename.systemId));
    assert.ok(detail.includes(rename.donorSystemId));
  }
  assert.match(message, /2 definition\(s\)/);
  assert.doesNotMatch(message, /→|t7|c9/, 'the uncapped rename list stays out of the toast');
});

test('every refusal is named in the detail with its system and its REASON', () => {
  const { message, detail } = buildWorldScopeEntityNotice(
    fullReport({
      refusals: [
        { systemId: 'sys-c', entityType: 'components', reason: 'outputIdCollision' },
        { systemId: 'sys-d', entityType: 'tools', reason: 'nonDisjointMap' },
      ],
    }),
    noLocalizer
  );
  assert.match(detail, /sys-c \(components: outputIdCollision\)/);
  assert.match(detail, /sys-d \(tools: nonDisjointMap\)/);
  assert.doesNotMatch(message, /outputIdCollision|nonDisjointMap/);
});

test('SEVERITY is derived: a rename, a refusal or a prune makes it a permanent warning', () => {
  const created = buildWorldScopeEntityNotice(createdOnly(), noLocalizer);
  assert.equal(created.severity, 'info', 'a pass that merely created entities is informational');

  for (const key of ['renames', 'refusals', 'flaggedForReview']) {
    const only = buildWorldScopeEntityNotice(
      { ...createdOnly(), [key]: fullReport()[key] },
      noLocalizer
    );
    assert.equal(only.severity, 'warn', `${key} alone must make the notice a warning`);
  }
});

test('a pass that changed NOTHING produces no message and no detail', () => {
  // A notice that always fires is a notice nobody reads.
  const { message, detail } = buildWorldScopeEntityNotice(
    {
      createdEntities: { components: 0, essences: 0, tools: 0 },
      mergedGroups: [],
      transitiveGroups: [],
      renames: [],
      refusals: [],
      flaggedForReview: [],
    },
    noLocalizer
  );
  assert.deepEqual({ message, detail }, EMPTY);
});

test('the composition is TOTAL: a null or malformed report never throws', () => {
  for (const report of [null, undefined, {}, 'nonsense', { createdEntities: 'nope', renames: 7 }]) {
    assert.doesNotThrow(() => buildWorldScopeEntityNotice(report, noLocalizer));
  }
  assert.doesNotThrow(() =>
    buildWorldScopeEntityNotice(fullReport(), () => {
      throw new Error('a broken localizer');
    })
  );
});

test('a real localizer is USED, and a missing key falls back to the composed sentence', () => {
  const localized = buildWorldScopeEntityNotice(fullReport(), (key, data) =>
    key === 'FABRICATE.Migration.WorldScopeEntities.Created'
      ? `LOCALIZED ${data.components}/${data.essences}/${data.tools}`
      : undefined
  );
  assert.match(localized.message, /LOCALIZED 3\/2\/1/);
  assert.match(localized.message, /1 definition\(s\)/, 'the un-localized clauses still fall back');
});

test('the shipped Created toast keeps its View Lab anchor, and the detail keeps the reassurance', () => {
  const { message, detail } = buildWorldScopeEntityNotice(fullReport(), localizeLang);
  assert.ok(
    message.startsWith('Fabricate gave this world one shared record per component, essence and tool: 3 component(s)'),
    '`TOLERATED_WARNINGS` in scripts/view-lab-screenshots.mjs anchors on this opening clause'
  );
  assert.match(message, /Details are in the console \(F12\)\.$/);
  assert.match(detail, /Every crafting system keeps exactly the behaviour it had\./);
  assert.match(detail, /c9 → c1 \(sys-b ← sys-a\)/);
});

// The REMAP notice — criterion 11's locked-pack and unsafe-systemId counts

test('the remap notice counts the unsafe systemId skips and the detail names them', () => {
  const { message, detail } = buildWorldScopeIdentityRemapNotice(
    { unsafeSystemIdSkips: ['sys.dotted', 'other.id'], lockedSkips: 4 },
    noLocalizer
  );
  assert.match(message, /2 crafting system id\(s\)/);
  assert.match(message, /4 item\(s\) refused the update/);
  assert.doesNotMatch(message, /sys\.dotted/, 'the id list is console detail');
  assert.ok(detail.includes('sys.dotted') && detail.includes('other.id'));
  assert.match(detail, /4 item\(s\) refused the update/, 'the detail stands on its own');
});

test('the remap notice is SILENT on a clean pass', () => {
  for (const summary of [
    { unsafeSystemIdSkips: [], lockedSkips: 0 },
    {},
    null,
    { unsafeSystemIdSkips: 'nonsense', lockedSkips: 'nonsense' },
  ]) {
    assert.deepEqual(buildWorldScopeIdentityRemapNotice(summary, noLocalizer), EMPTY);
  }
});

test('each half of the remap notice appears independently of the other', () => {
  const unsafeOnly = buildWorldScopeIdentityRemapNotice(
    { unsafeSystemIdSkips: ['sys.dotted'], lockedSkips: 0 },
    noLocalizer
  ).message;
  assert.match(unsafeOnly, /1 crafting system id\(s\)/);
  assert.doesNotMatch(unsafeOnly, /refused the update/);

  const lockedOnly = buildWorldScopeIdentityRemapNotice(
    { unsafeSystemIdSkips: [], lockedSkips: 1 },
    noLocalizer
  );
  assert.match(lockedOnly.message, /1 item\(s\) refused the update/);
  assert.doesNotMatch(lockedOnly.message, /crafting system id|in the console/);
  assert.equal(lockedOnly.detail, '', 'a toast with nothing more to say points nowhere');
});

test('a failed remap document says INCOMPLETE and names the re-run command in the detail', () => {
  const { message, detail } = buildWorldScopeIdentityRemapNotice({ skippedErrors: 3 }, noLocalizer);
  assert.match(message, /3 document\(s\) could not be updated, so the repair is incomplete/);
  assert.match(detail, /INCOMPLETE/);
  assert.match(detail, /game\.fabricate\.remapWorldScopeIdentityFlags\(\)/);
});

// The `1.34.0` remap notice — the essence half's GM channel

test('the essence remap notice counts the refused groups and both skips, and the detail names the ids', () => {
  // `partitionSafeEssencePairs` refuses a whole group whose survivor or any loser is not a safe
  // flag-path segment, which leaves the world merged in its settings and un-merged in its actor
  // flags — a reachable state the GM is told about rather than left to find.
  const { message, detail } = buildWorldEssenceMergeRemapNotice(
    {
      unsafeEssenceIdSkips: ['fire.dotted', 'ash id'],
      refusedGroups: 1,
      lockedSkips: 4,
      skippedErrors: 2,
    },
    noLocalizer
  );
  assert.match(message, /1 merged essence set\(s\)/);
  assert.match(message, /4 item\(s\) refused the update/);
  assert.match(message, /2 document\(s\) could not be updated/);
  assert.doesNotMatch(message, /fire\.dotted/, 'the offending ids are console detail');
  assert.ok(detail.includes('fire.dotted') && detail.includes('ash id'));
  assert.match(detail, /2 document\(s\) could not be updated at all/);
  assert.match(detail, /INCOMPLETE/, 'a transient failure withholds the clear and says so');
});

test('the essence remap notice is SILENT on a clean pass and TOTAL on junk', () => {
  for (const summary of [
    { unsafeEssenceIdSkips: [], refusedGroups: 0, lockedSkips: 0, skippedErrors: 0 },
    {},
    null,
    undefined,
    { unsafeEssenceIdSkips: 'nonsense', refusedGroups: 'nonsense', lockedSkips: 'nonsense' },
  ]) {
    assert.deepEqual(buildWorldEssenceMergeRemapNotice(summary, noLocalizer), EMPTY);
  }
});

test('each clause of the essence remap notice appears independently of the others', () => {
  const clauseOf = (summary) => buildWorldEssenceMergeRemapNotice(summary, noLocalizer).message;
  const refusedOnly = clauseOf({ unsafeEssenceIdSkips: ['fire.dotted'], refusedGroups: 1 });
  assert.match(refusedOnly, /merged essence set\(s\)/);
  assert.doesNotMatch(refusedOnly, /refused the update|could not be updated/);

  const lockedOnly = clauseOf({ lockedSkips: 1 });
  assert.match(lockedOnly, /1 item\(s\) refused the update/);
  assert.doesNotMatch(lockedOnly, /merged essence set|could not be updated/);

  const failedOnly = clauseOf({ skippedErrors: 1 });
  assert.match(failedOnly, /1 document\(s\) could not be updated/);
  assert.doesNotMatch(failedOnly, /merged essence set|refused the update/);
});

// The two DISPATCH legs in src/main.js

test('src/main.js dispatches BOTH notices, each on the right channel', () => {
  // An omitted dispatch fails SILENT — the consumer is guarded and the notice simply never
  // appears — which is why its PRESENCE is asserted rather than inferred.
  const composeIndex = MAIN.indexOf('buildWorldScopeEntityNotice(worldScopeEntityReport');
  assert.ok(composeIndex > 0, 'the migration notice is composed from the transient report');
  // ANCHORED TO THIS BLOCK, and the anchoring is the whole point.
  const worldScopeBlock = MAIN.slice(composeIndex, composeIndex + 700);
  assert.match(
    worldScopeBlock,
    /notice\.severity === 'warn'/,
    'the severity the composer derived must actually select the channel'
  );
  assert.match(
    worldScopeBlock,
    /ui\.notifications\?\.warn\?\.\(notice\.message, \{ permanent: true \}\)/,
    'a warning notice is PERMANENT, because the GM has to act on a rename or a prune'
  );
  assert.match(worldScopeBlock, /ui\.notifications\?\.info\?\.\(notice\.message\)/);
  assert.match(
    worldScopeBlock,
    /logMigrationNoticeDetail\('1\.30\.0 world-scope entities', notice\.detail\)/,
    'the names the toast only counts must reach the console'
  );
  assert.match(
    MAIN,
    /const notice = buildWorldScopeIdentityRemapNotice\(summary,/,
    'the remap notice is composed from the pass summary'
  );
  assert.match(
    MAIN,
    /if \(notice\.message && game\.user\?\.isGM\) \{\s*logMigrationNoticeDetail\('1\.30\.0 world-scope identity flag remap', notice\.detail\);\s*ui\.notifications\?\.warn\?\.\(notice\.message, \{ permanent: true \}\);/,
    'and posted, GM-only and permanent, with its detail logged'
  );
});

test('every localization key the two notices reference exists in lang/en.json', () => {
  const source = readFileSync(
    resolve(HERE, '..', 'src', 'systems', 'worldScopeEntityNotice.js'),
    'utf8'
  );
  const keys = [...source.matchAll(/'(FABRICATE\.Migration\.WorldScopeEntities\.[A-Za-z]+)'/g)].map(
    (match) => match[1]
  );
  assert.ok(
    keys.length >= 8,
    `the premise: the module really does reference keys (${keys.length})`
  );
  for (const key of new Set(keys)) {
    assert.equal(typeof localizeLang(key), 'string', `${key} must exist in lang/en.json`);
  }
});

// The `1.34.0` equivalent-essence merge notice (issue 1654). `adminStore.addEssence` mints an
// essence id with `crypto.randomUUID()`, so these assertions hold the toast to readable names: no
// id enumeration, and no `oldId → newId` arrow of the kind the `Renames` clause prints.

/** A merge report with one of everything, in the shape `buildWorldEssenceEquivalence` emits. */
function mergeReport(overrides = {}) {
  return {
    mergedGroups: [
      { survivorId: 'iron', loserIds: ['b1c2d3e4-f5a6'], systemIds: ['sys-a', 'sys-b'] },
    ],
    refusals: [
      {
        survivorId: 'ash',
        loserIds: ['99887766-5544'],
        systemIds: ['sys-c'],
        reason: 'outputIdCollision',
      },
    ],
    declined: [{ essenceId: 'water', sections: ['macro'], reason: 'memberDisagreement' }],
    orphaned: [{ essenceId: 'ghost', name: 'Ghost' }],
    retired: {
      'b1c2d3e4-f5a6': { name: 'Iron', icon: 'icons/iron.webp', systems: ['sys-b'] },
      '99887766-5544': { name: 'Ash', systems: ['sys-c'] },
    },
    ...overrides,
  };
}

test('one merged set reads as two short sentences plus the console pointer', () => {
  const { message, detail } = buildWorldEssenceMergeNotice(
    { ...mergeReport(), refusals: [], declined: [] },
    localizeLang
  );
  assert.equal(
    message,
    'Fabricate merged 1 set(s) of duplicate essences into one shared essence each: Iron. ' +
      'This cannot be undone. Details are in the console (F12).'
  );
  assert.match(detail, /same name, same macro and same active-effect source/);
  assert.match(detail, /world item, a compendium item or an unlinked token actor/);
  assert.match(detail, /merged b1c2d3e4-f5a6 into iron across sys-a, sys-b/);
});

test('the merge notice names every group BY NAME and never enumerates a retired id', () => {
  const { message, detail } = buildWorldEssenceMergeNotice(mergeReport(), noLocalizer);
  assert.match(message, /one shared essence each: Iron\./, 'the tombstone carries the readable name');
  assert.match(message, /left unchanged: Ash\./);
  assert.match(message, /disagree about them: water\./);
  assert.match(detail, /Ash \(outputIdCollision\)/, 'the refusal REASON is console detail');
  assert.match(detail, /water \(macro\)/);
  // The equivalence key case-folds the name, so a readable name always exists and a raw UUID
  // never reaches the toast as the only thing a GM gets.
  assert.doesNotMatch(message, /b1c2d3e4-f5a6|99887766-5544/, 'no id pair reaches the toast');
  assert.doesNotMatch(message, /outputIdCollision/);
  assert.doesNotMatch(
    message,
    /→/,
    "and no `oldId → newId` arrow, which is the Renames clause's shape"
  );
});

test('the notice is SILENT when nothing merged, was refused or was declined', () => {
  assert.deepEqual(buildWorldEssenceMergeNotice(null, noLocalizer), EMPTY);
  assert.deepEqual(buildWorldEssenceMergeNotice({}, noLocalizer), EMPTY);
  assert.deepEqual(
    buildWorldEssenceMergeNotice({ mergedGroups: [], refusals: [], declined: [] }, noLocalizer),
    EMPTY
  );
  assert.deepEqual(
    buildWorldEssenceMergeNotice({ orphaned: [{ essenceId: 'ghost' }] }, noLocalizer),
    EMPTY,
    'an ORPHAN changed nothing: a world essence with no live member is left exactly as it is'
  );
});

test('each clause appears independently of the others', () => {
  const only = (key, value) =>
    buildWorldEssenceMergeNotice(
      { ...mergeReport(), mergedGroups: [], refusals: [], declined: [], [key]: value },
      noLocalizer
    );
  const mergedOnly = only('mergedGroups', mergeReport().mergedGroups).message;
  assert.match(mergedOnly, /1 set\(s\) of duplicate essences/);
  assert.doesNotMatch(mergedOnly, /could not be merged safely/);
  const refusedOnly = only('refusals', mergeReport().refusals);
  assert.match(refusedOnly.message, /1 essence set\(s\) could not be merged safely/);
  assert.match(refusedOnly.detail, /will not be retried/, 'the remedy is console detail');
  assert.doesNotMatch(refusedOnly.message, /one shared essence/);
  const declinedOnly = only('declined', mergeReport().declined).message;
  assert.match(declinedOnly, /1 essence\(s\) were left alone/);
  assert.doesNotMatch(declinedOnly, /could not be merged safely/);
});

test('the detail DISCLOSES that the item-override remap reaches owned actor items only', () => {
  // A world Item, a compendium Item and an unlinked synthetic token actor are never walked, so
  // their `flags.fabricate.essences` override stays stale permanently; only the GM can find those
  // documents, so the console detail the toast points at states the scope rather than implying it.
  const merged = buildWorldEssenceMergeNotice(mergeReport(), noLocalizer);
  assert.match(merged.detail, /world item, a compendium item or an unlinked token actor/);
  assert.match(
    merged.detail,
    /retired id is never reused/,
    'and why that is safe rather than merely known'
  );
  assert.doesNotMatch(merged.message, /compendium item/, 'the scope bound is not toast copy');
  // Only a merge retires an id, so a refusal-only pass has no stale override to disclose.
  const refusedOnly = buildWorldEssenceMergeNotice(
    { ...mergeReport(), mergedGroups: [] },
    noLocalizer
  );
  assert.doesNotMatch(refusedOnly.detail, /compendium item/);
});

test('the toast CAPS its enumeration and the console keeps every name and id', () => {
  const many = Array.from({ length: 8 }, (unused, index) => ({
    survivorId: `survivor-${index}`,
    loserIds: [`loser-${index}`],
    systemIds: ['sys-a'],
    name: `Essence ${index}`,
  }));
  const { message, detail } = buildWorldEssenceMergeNotice({ mergedGroups: many }, noLocalizer);
  assert.match(message, /Essence 4/);
  assert.doesNotMatch(message, /Essence 5/, 'capped at the first 5');
  assert.match(message, /…and 3 more\./);
  assert.match(message, /8 set\(s\)/, 'while the COUNT in the sentence stays exact');
  assert.match(detail, /Essence 7/, 'the detail names every group');
  assert.match(detail, /merged loser-7 into survivor-7/, 'and ends with every id');

  const enumeration = describeWorldEssenceMerge(mergeReport());
  assert.match(enumeration, /merged b1c2d3e4-f5a6 into iron across sys-a, sys-b/);
  assert.match(enumeration, /refused 99887766-5544 -> ash \(outputIdCollision\)/);
  assert.match(enumeration, /declined water \(macro\)/);
  assert.match(enumeration, /orphaned ghost/);
  assert.equal(describeWorldEssenceMerge(null), '');
});

test('the entry name wins, and a MALFORMED report still degrades readably', () => {
  // `buildWorldEssenceEquivalence` carries a `name` on every merged, refused and declined entry,
  // so the rest of the chain is a guard, not a path: the report arrives on a transient field no
  // schema validates, and a malformed one must still read as a sentence, not `undefined`.
  const { message } = buildWorldEssenceMergeNotice(
    { mergedGroups: [{ survivorId: 'nameless', loserIds: ['gone'] }] },
    noLocalizer
  );
  assert.match(message, /one shared essence each: nameless\./);
  assert.doesNotMatch(message, /undefined/);
  const preferred = buildWorldEssenceMergeNotice(
    {
      mergedGroups: [{ survivorId: 'iron', loserIds: ['x'], name: 'From the entry' }],
      retired: { x: { name: 'From the tombstone' } },
    },
    noLocalizer
  ).message;
  assert.match(preferred, /From the entry/, "the producer's own `name` is what the GM reads");
  assert.doesNotMatch(preferred, /From the tombstone/);
});

test('the shipped report shape — a `name` on every entry — needs no fallback at all', () => {
  // `buildWorldEssenceEquivalence` carries an absence-preserving `name` on each of the three entry
  // types, so a regression that dropped it from the producer surfaces here as a wall of UUIDs.
  const { message, detail } = buildWorldEssenceMergeNotice(
    {
      mergedGroups: [{ survivorId: 'd3adb33f-1111', loserIds: ['c0ffee-2222'], name: 'Iron' }],
      refusals: [
        {
          survivorId: 'feedface-3333',
          loserIds: ['badc0de-4444'],
          name: 'Ash',
          reason: 'outputIdCollision',
        },
      ],
      declined: [{ essenceId: 'deadbeef-5555', name: 'Water', sections: ['macro'] }],
    },
    noLocalizer
  );
  assert.match(message, /one shared essence each: Iron\./);
  assert.match(message, /left unchanged: Ash\./);
  assert.match(message, /disagree about them: Water\./);
  assert.match(detail, /Ash \(outputIdCollision\)/);
  assert.match(detail, /Water \(macro\)/);
  assert.doesNotMatch(
    message,
    /[0-9a-f]{6,}-\d{4}/,
    'not one id reaches the toast when the producer supplies every name'
  );
});

test('src/main.js dispatches the merge notice from the migration-summary handler', () => {
  // An omitted dispatch fails silently: the consumer is guarded on a report that is `null` unless
  // the migration ran, so its presence is asserted rather than inferred.
  const composeIndex = MAIN.indexOf('buildWorldEssenceMergeNotice(worldEssenceMergeReport');
  assert.ok(composeIndex > 0, 'the notice is composed from the transient report');
  assert.match(MAIN, /const worldEssenceMergeReport = summary\?\.\w+ \?\? null;/);
  const block = MAIN.slice(composeIndex, composeIndex + 700);
  assert.match(
    block,
    /ui\.notifications\?\.warn\?\.\(essenceNotice\.message, \{ permanent: true \}\)/,
    'ALWAYS permanent and ALWAYS a warning: an irreversible merge, an un-retried refusal and an ' +
      'unsettled disagreement are all things the GM must see'
  );
  assert.doesNotMatch(block, /notifications\?\.info\?\.\(essenceNotice/);
  assert.match(
    block,
    /logMigrationNoticeDetail\('1\.34\.0 equivalent essence merge', essenceNotice\.detail\)/,
    'the detail goes through the one helper whose `info` write survives the release build'
  );
  assert.doesNotMatch(
    block,
    /console\.(info|debug|log)\(/,
    'a bare `console.info(...)` statement is deleted from dist/main.js by the minifier'
  );
  // The GM gate is the same one every sibling notice in this handler carries.
  assert.match(MAIN.slice(composeIndex - 200, composeIndex), /game\.user\?\.isGM/);
});

test('the summary key main.js reads for the merge report is a key the runner actually emits', async () => {
  // A source-text pin cannot close this gap (issue 1654): `main.js` shipped reading the underscore
  // field while `MigrationRunner.run()` emits `worldEssenceMergeReport`, so the grep matched while
  // the notice was dead code. The claim here is that the identifier read exists on the object read.
  const read = MAIN.match(/const worldEssenceMergeReport = summary\?\.(\w+) \?\? null;/);
  assert.ok(read, 'main.js reads the merge report off the migration summary');

  const store = new Map([['migrationVersion', getHighestRegisteredMigrationVersion()]]);
  const summary = await new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => store.set(key, value),
  }).run();

  assert.ok(
    Object.hasOwn(summary, read[1]),
    `main.js reads summary.${read[1]}, which MigrationRunner.run() does not emit — the notice ` +
      `would be dead code. Emitted keys: ${Object.keys(summary).join(', ')}`
  );
});

test('src/main.js composes and posts the essence remap notice from the pass summary', () => {
  // An omitted dispatch fails silently: the notice would never appear and every assertion above
  // it would stay green.
  const composeIndex = MAIN.indexOf('buildWorldEssenceMergeRemapNotice(summary,');
  assert.ok(composeIndex > 0, 'the essence remap notice is composed from the pass summary');
  const block = MAIN.slice(composeIndex, composeIndex + 400);
  assert.match(
    block,
    /if \(notice\.message && game\.user\?\.isGM\) \{\s*logMigrationNoticeDetail\('1\.34\.0 essence flag remap', notice\.detail\);\s*ui\.notifications\?\.warn\?\.\(notice\.message, \{ permanent: true \}\);/,
    'GM-only and PERMANENT, exactly as the 1.30.0 sibling posts its own'
  );
  assert.doesNotMatch(
    MAIN,
    /MIRRORS `runWorldScopeIdentityFlagRemap` DELIBERATELY AND COMPLETELY/,
    'the mirror is partial and the docblock must not overstate it'
  );
});

test('the 1.34.0 and 1.30.0 remap fallbacks and their lang/en.json strings compose the SAME notices', () => {
  // Existence is not agreement: the key-exists guards stayed green while an inline English fallback
  // kept a sentence `lang/en.json` had already been corrected away from.
  const many = Array.from({ length: 7 }, (unused, index) => ({
    survivorId: `s-${index}`,
    loserIds: [`l-${index}`],
    name: `Essence ${index}`,
    reason: 'outputIdCollision',
    sections: ['macro'],
  }));
  for (const report of [mergeReport(), { mergedGroups: many, refusals: many, declined: many }]) {
    assert.deepEqual(
      buildWorldEssenceMergeNotice(report, noLocalizer),
      buildWorldEssenceMergeNotice(report, localizeLang)
    );
  }
  const summary = { unsafeEssenceIdSkips: ['a.b'], refusedGroups: 1, lockedSkips: 2, skippedErrors: 3 };
  assert.deepEqual(
    buildWorldEssenceMergeRemapNotice(summary, noLocalizer),
    buildWorldEssenceMergeRemapNotice(summary, localizeLang)
  );
  // Not `buildWorldScopeEntityNotice`: its Created fallback differs from lang on purpose, for the
  // View Lab anchor `tests/view-lab-world-migration.test.js` guards.
  const remapSummary = { unsafeSystemIdSkips: ['a.b'], lockedSkips: 2, skippedErrors: 3 };
  assert.deepEqual(
    buildWorldScopeIdentityRemapNotice(remapSummary, noLocalizer),
    buildWorldScopeIdentityRemapNotice(remapSummary, localizeLang)
  );
});

test('every WorldEssenceMerge key the REMAP notice references exists in lang/en.json', () => {
  const source = readFileSync(
    resolve(HERE, '..', 'src', 'systems', 'remapWorldScopeIdentityFlags.js'),
    'utf8'
  );
  const keys = [...source.matchAll(/'(FABRICATE\.Migration\.WorldEssenceMerge\.[A-Za-z]+)'/g)].map(
    (match) => match[1]
  );
  assert.equal(
    keys.length,
    5,
    `the premise: the module really does reference keys (${keys.length})`
  );
  for (const key of new Set(keys)) {
    assert.equal(typeof localizeLang(key), 'string', `${key} must exist in lang/en.json`);
  }
});

test('every WorldEssenceMerge localization key the notice references exists in lang/en.json', () => {
  const source = readFileSync(
    resolve(HERE, '..', 'src', 'systems', 'worldScopeEntityNotice.js'),
    'utf8'
  );
  const keys = [...source.matchAll(/'(FABRICATE\.Migration\.WorldEssenceMerge\.[A-Za-z]+)'/g)].map(
    (match) => match[1]
  );
  assert.equal(
    keys.length,
    8,
    `the premise: the module really does reference keys (${keys.length})`
  );
  for (const key of new Set(keys)) {
    assert.equal(typeof localizeLang(key), 'string', `${key} must exist in lang/en.json`);
  }
});

test('the shipped English strings carry the same substitutions the fallbacks do', () => {
  // `localizeWith` refuses a missing key but never an incomplete one, so a localized string that
  // drops a placeholder renders worse than the fallback, with nothing else to catch it.
  const block = LANG.FABRICATE.Migration.WorldEssenceMerge;
  for (const [key, placeholders] of [
    ['Merged', ['{count}', '{names}']],
    ['MergedDetail', ['{count}', '{names}']],
    ['Refusals', ['{count}', '{refusals}']],
    ['RefusalsDetail', ['{count}', '{refusals}']],
    ['Declined', ['{count}', '{essences}']],
    ['DeclinedDetail', ['{count}', '{essences}']],
    ['Overflow', ['{count}']],
    ['UnsafeEssenceIds', ['{count}']],
    ['UnsafeEssenceIdsDetail', ['{count}', '{essences}']],
    ['RemapLockedSkips', ['{count}']],
    ['RemapSkippedErrors', ['{count}']],
    ['RemapSkippedErrorsDetail', ['{count}']],
  ]) {
    for (const placeholder of placeholders) {
      assert.ok(block[key].includes(placeholder), `${key} must interpolate ${placeholder}`);
    }
  }
  assert.doesNotMatch(
    block.ItemOverrideScopeDetail,
    /\{/,
    'the scope disclosure interpolates nothing'
  );
  assert.match(block.Merged, /cannot be undone/, 'the merge is IRREVERSIBLE and the toast says so');
  assert.match(block.RefusalsDetail, /will not be retried/);
  // Requirement 8a: the loser's world identity is deleted and its in-system rows keep theirs, so
  // the explanation must not tell a GM the icon is gone.
  assert.match(
    block.MergedDetail,
    /own essence row keeps the name, icon and description it was authored with/,
    'the notice must scope the identity loss to the WORLD record'
  );
});
