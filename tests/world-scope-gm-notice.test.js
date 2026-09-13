/**
 * THE GM NOTICES (issue 1363, criterion 11).
 *
 * `worldScopeEntityNotice.js` was extracted from `src/main.js` for a stated reason: nothing in
 * that file can be executed by a unit test, and "a source-text grep can pin a DISPATCH but never
 * a SUM — three semantic mutations to the `1.21.0` notice's arithmetic survived a green suite
 * while it lived inline". The extraction then shipped with no assertion on any clause, so every
 * one of those mutations was available again: omitting the created counts, the merged clause, the
 * transitive-group clause and the refusals clause all survived, and
 * `buildWorldScopeIdentityRemapNotice` — which carries criterion 11's locked-pack and
 * unsafe-`systemId` counts — had none at all.
 *
 * This file asserts the SUMS and the CLAUSES. The two `src/main.js` DISPATCH legs are pinned by
 * source contract at the bottom, on the pattern the `ready`-body call site already uses: an
 * `Array.isArray`-guarded consumer fails SILENT, so the notice simply never appears.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  getHighestRegisteredMigrationVersion,
  MigrationRunner,
} from '../src/migration/MigrationRunner.js';
import { buildWorldEssenceMergeRemapNotice } from '../src/migration/remapWorldScopeIdentityFlags.js';
import {
  buildWorldEssenceMergeNotice,
  buildWorldScopeEntityNotice,
  buildWorldScopeIdentityRemapNotice,
  describeWorldEssenceMerge,
} from '../src/migration/worldScopeEntityNotice.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAIN = readFileSync(resolve(HERE, '..', 'src', 'main.js'), 'utf8');

/** No localizer, so every assertion below reads the FALLBACK sentence the module composes. */
const noLocalizer = () => undefined;

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

test('the CREATED counts are the numbers the report carries, per entity type', () => {
  // A SUM, which is exactly what a source-text grep cannot pin.
  const { message } = buildWorldScopeEntityNotice(fullReport(), noLocalizer);
  assert.match(message, /3 world component\(s\)/);
  assert.match(message, /2 world essence\(s\)/);
  assert.match(message, /1 world tool\(s\)/);
});

test('each optional clause appears only when its list is non-empty, and names its count', () => {
  const full = buildWorldScopeEntityNotice(fullReport(), noLocalizer).message;
  assert.match(full, /2 group\(s\)/, 'the MERGED clause counts groups');
  assert.match(full, /1 group\(s\) were formed transitively/, 'the TRANSITIVE clause');
  assert.match(full, /1 definition\(s\)/, 'the RENAMES clause');
  assert.match(full, /1 system\/entity pair\(s\)/, 'the REFUSALS clause');
  assert.match(full, /1 reference\(s\)/, 'the FLAGGED clause');

  const bare = buildWorldScopeEntityNotice(
    fullReport({
      mergedGroups: [],
      transitiveGroups: [],
      renames: [],
      refusals: [],
      flaggedForReview: [],
    }),
    noLocalizer
  );
  assert.match(bare.message, /world component\(s\)/, 'the created clause always appears');
  for (const absent of [/group\(s\)/, /definition\(s\)/, /pair\(s\)/, /reference\(s\)/]) {
    assert.doesNotMatch(bare.message, absent, 'an empty list contributes NO clause');
  }
});

test('EVERY rename is named, with both systems and both ids', () => {
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
  const { message } = buildWorldScopeEntityNotice(report, noLocalizer);
  for (const rename of report.renames) {
    assert.ok(message.includes(rename.oldId), `${rename.oldId} must be named`);
    assert.ok(message.includes(rename.newId), `${rename.newId} must be named`);
    assert.ok(message.includes(rename.systemId));
    assert.ok(message.includes(rename.donorSystemId));
  }
  assert.match(message, /2 definition\(s\)/);
});

test('every refusal is named with its system and its REASON', () => {
  const { message } = buildWorldScopeEntityNotice(
    fullReport({
      refusals: [
        { systemId: 'sys-c', entityType: 'components', reason: 'outputIdCollision' },
        { systemId: 'sys-d', entityType: 'tools', reason: 'nonDisjointMap' },
      ],
    }),
    noLocalizer
  );
  assert.match(message, /sys-c \(components: outputIdCollision\)/);
  assert.match(message, /sys-d \(tools: nonDisjointMap\)/);
});

test('SEVERITY is derived: a rename, a refusal or a prune makes it a permanent warning', () => {
  const created = buildWorldScopeEntityNotice(
    fullReport({
      mergedGroups: [],
      transitiveGroups: [],
      renames: [],
      refusals: [],
      flaggedForReview: [],
    }),
    noLocalizer
  );
  assert.equal(created.severity, 'info', 'a pass that merely created entities is informational');

  for (const key of ['renames', 'refusals', 'flaggedForReview']) {
    const only = buildWorldScopeEntityNotice(
      fullReport({
        mergedGroups: [],
        transitiveGroups: [],
        renames: [],
        refusals: [],
        flaggedForReview: [],
        [key]: fullReport()[key],
      }),
      noLocalizer
    );
    assert.equal(only.severity, 'warn', `${key} alone must make the notice a warning`);
  }
});

test('a pass that changed NOTHING produces no message at all', () => {
  // A notice that always fires is a notice nobody reads.
  const { message } = buildWorldScopeEntityNotice(
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
  assert.equal(message, '');
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
  assert.match(localized.message, /2 group\(s\)/, 'the un-localized clauses still fall back');
});

// ---------------------------------------------------------------------------
// The REMAP notice — criterion 11's locked-pack and unsafe-systemId counts
// ---------------------------------------------------------------------------

test('the remap notice names the unsafe systemId skips and the locked-pack skips', () => {
  const message = buildWorldScopeIdentityRemapNotice(
    { unsafeSystemIdSkips: ['sys.dotted', 'other.id'], lockedSkips: 4 },
    noLocalizer
  );
  assert.match(message, /2 crafting system id\(s\)/);
  assert.ok(message.includes('sys.dotted') && message.includes('other.id'));
  assert.match(message, /4 item\(s\) refused the update/);
});

test('the remap notice is SILENT on a clean pass', () => {
  for (const summary of [
    { unsafeSystemIdSkips: [], lockedSkips: 0 },
    {},
    null,
    { unsafeSystemIdSkips: 'nonsense', lockedSkips: 'nonsense' },
  ]) {
    assert.equal(buildWorldScopeIdentityRemapNotice(summary, noLocalizer), '');
  }
});

test('each half of the remap notice appears independently of the other', () => {
  const unsafeOnly = buildWorldScopeIdentityRemapNotice(
    { unsafeSystemIdSkips: ['sys.dotted'], lockedSkips: 0 },
    noLocalizer
  );
  assert.match(unsafeOnly, /1 crafting system id\(s\)/);
  assert.doesNotMatch(unsafeOnly, /refused the update/);

  const lockedOnly = buildWorldScopeIdentityRemapNotice(
    { unsafeSystemIdSkips: [], lockedSkips: 1 },
    noLocalizer
  );
  assert.match(lockedOnly, /1 item\(s\) refused the update/);
  assert.doesNotMatch(lockedOnly, /crafting system id/);
});

// ---------------------------------------------------------------------------
// The `1.34.0` remap notice — the essence half's GM channel
// ---------------------------------------------------------------------------

test('the essence remap notice names the refused groups, the offending ids and both skip counts', () => {
  // `partitionSafeEssencePairs` refuses a whole group whose survivor or any loser is not a safe
  // flag-path segment, which leaves the world merged in its settings and un-merged in its actor
  // flags — a reachable state the GM is told about rather than left to find.
  const message = buildWorldEssenceMergeRemapNotice(
    {
      unsafeEssenceIdSkips: ['fire.dotted', 'ash id'],
      refusedGroups: 1,
      lockedSkips: 4,
      skippedErrors: 2,
    },
    noLocalizer
  );
  assert.match(message, /1 merged essence set\(s\)/);
  assert.ok(message.includes('fire.dotted') && message.includes('ash id'));
  assert.match(message, /4 item\(s\) refused the update/);
  assert.match(message, /2 document\(s\) could not be updated at all/);
  assert.match(message, /INCOMPLETE/, 'a transient failure withholds the clear and says so');
});

test('the essence remap notice is SILENT on a clean pass and TOTAL on junk', () => {
  for (const summary of [
    { unsafeEssenceIdSkips: [], refusedGroups: 0, lockedSkips: 0, skippedErrors: 0 },
    {},
    null,
    undefined,
    { unsafeEssenceIdSkips: 'nonsense', refusedGroups: 'nonsense', lockedSkips: 'nonsense' },
  ]) {
    assert.equal(buildWorldEssenceMergeRemapNotice(summary, noLocalizer), '');
  }
});

test('each clause of the essence remap notice appears independently of the others', () => {
  const clauseOf = (summary) => buildWorldEssenceMergeRemapNotice(summary, noLocalizer);
  const refusedOnly = clauseOf({ unsafeEssenceIdSkips: ['fire.dotted'], refusedGroups: 1 });
  assert.match(refusedOnly, /merged essence set\(s\)/);
  assert.doesNotMatch(refusedOnly, /refused the update|could not be updated/);

  const lockedOnly = clauseOf({ lockedSkips: 1 });
  assert.match(lockedOnly, /1 item\(s\) refused the update/);
  assert.doesNotMatch(lockedOnly, /merged essence set|could not be updated/);

  const failedOnly = clauseOf({ skippedErrors: 1 });
  assert.match(failedOnly, /1 document\(s\) could not be updated at all/);
  assert.doesNotMatch(failedOnly, /merged essence set|refused the update/);
});

// ---------------------------------------------------------------------------
// The two DISPATCH legs in src/main.js
// ---------------------------------------------------------------------------

test('src/main.js dispatches BOTH notices, each on the right channel', () => {
  // An omitted dispatch fails SILENT — the consumer is guarded and the notice simply never
  // appears — which is why its PRESENCE is asserted rather than inferred.
  const composeIndex = MAIN.indexOf('buildWorldScopeEntityNotice(worldScopeEntityReport');
  assert.ok(composeIndex > 0, 'the migration notice is composed from the transient report');
  // ANCHORED TO THIS BLOCK, and the anchoring is the whole point. An unanchored `MAIN` match for
  // the severity dispatch is satisfied by the 1.21.0 retired-crafting-mod dispatch, which is
  // byte-identical apart from indentation - so deleting THIS branch, and downgrading every
  // rename, refusal and prune warning from a permanent WARN to a transient info, stayed green.
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
    MAIN,
    /const notice = buildWorldScopeIdentityRemapNotice\(summary,/,
    'the remap notice is composed from the pass summary'
  );
  assert.match(
    MAIN,
    /if \(notice && game\.user\?\.isGM\) ui\.notifications\?\.warn\?\.\(notice, \{ permanent: true \}\);/,
    'and posted, GM-only and permanent'
  );
});

test('every localization key the two notices reference exists in lang/en.json', () => {
  const lang = JSON.parse(readFileSync(resolve(HERE, '..', 'lang', 'en.json'), 'utf8'));
  const source = readFileSync(
    resolve(HERE, '..', 'src', 'migration', 'worldScopeEntityNotice.js'),
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
    const value = key.split('.').reduce((node, segment) => node?.[segment], lang);
    assert.equal(typeof value, 'string', `${key} must exist in lang/en.json`);
  }
});

// ---------------------------------------------------------------------------
// The `1.34.0` equivalent-essence merge notice (issue 1654)
//
// `adminStore.addEssence` mints an essence id with `crypto.randomUUID()`, so these assertions hold
// the notice to readable names: no id enumeration, and no `oldId → newId` arrow of the kind the
// `Renames` clause prints.
// ---------------------------------------------------------------------------

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

test('the merge notice names every group BY NAME and never enumerates a retired id', () => {
  const message = buildWorldEssenceMergeNotice(mergeReport(), noLocalizer);
  assert.match(message, /one shared essence: Iron\./, 'the tombstone carries the readable name');
  assert.match(message, /Ash \(outputIdCollision\)/);
  assert.match(message, /water \(macro\)/);
  // The equivalence key case-folds the name, so a readable name always exists and a raw UUID
  // never reaches the toast as the only thing a GM gets.
  assert.doesNotMatch(message, /b1c2d3e4-f5a6|99887766-5544/, 'no id pair reaches the toast');
  assert.doesNotMatch(
    message,
    /→/,
    "and no `oldId → newId` arrow, which is the Renames clause's shape"
  );
});

test('the notice is SILENT when nothing merged, was refused or was declined', () => {
  assert.equal(buildWorldEssenceMergeNotice(null, noLocalizer), '');
  assert.equal(buildWorldEssenceMergeNotice({}, noLocalizer), '');
  assert.equal(
    buildWorldEssenceMergeNotice({ mergedGroups: [], refusals: [], declined: [] }, noLocalizer),
    ''
  );
  assert.equal(
    buildWorldEssenceMergeNotice({ orphaned: [{ essenceId: 'ghost' }] }, noLocalizer),
    '',
    'an ORPHAN changed nothing: a world essence with no live member is left exactly as it is'
  );
});

test('each clause appears independently of the others', () => {
  const only = (key, value) =>
    buildWorldEssenceMergeNotice(
      { ...mergeReport(), mergedGroups: [], refusals: [], declined: [], [key]: value },
      noLocalizer
    );
  const mergedOnly = only('mergedGroups', mergeReport().mergedGroups);
  assert.match(mergedOnly, /1 set\(s\) of essences/);
  assert.doesNotMatch(mergedOnly, /could not be merged safely/);
  const refusedOnly = only('refusals', mergeReport().refusals);
  assert.match(refusedOnly, /1 set\(s\) could not be merged safely/);
  assert.match(refusedOnly, /will not be retried/);
  assert.doesNotMatch(refusedOnly, /one shared essence/);
  const declinedOnly = only('declined', mergeReport().declined);
  assert.match(declinedOnly, /1 essence\(s\) were left alone/);
  assert.doesNotMatch(declinedOnly, /could not be merged safely/);
});

test('the notice DISCLOSES that the item-override remap reaches owned actor items only', () => {
  // A world Item, a compendium Item and an unlinked synthetic token actor are never walked, so
  // their `flags.fabricate.essences` override stays stale permanently; only the GM can find those
  // documents, so the notice states the scope rather than implying it.
  const merged = buildWorldEssenceMergeNotice(mergeReport(), noLocalizer);
  assert.match(merged, /world item, a compendium item or an unlinked token actor/);
  assert.match(
    merged,
    /retired id is never reused/,
    'and why that is safe rather than merely known'
  );
  // Only a merge retires an id, so a refusal-only pass has no stale override to disclose.
  const refusedOnly = buildWorldEssenceMergeNotice(
    { ...mergeReport(), mergedGroups: [] },
    noLocalizer
  );
  assert.doesNotMatch(refusedOnly, /compendium item/);
});

test('the toast CAPS its enumeration and the console keeps every id', () => {
  const many = Array.from({ length: 8 }, (unused, index) => ({
    survivorId: `survivor-${index}`,
    loserIds: [`loser-${index}`],
    systemIds: ['sys-a'],
    name: `Essence ${index}`,
  }));
  const message = buildWorldEssenceMergeNotice({ mergedGroups: many }, noLocalizer);
  assert.match(message, /Essence 4/);
  assert.doesNotMatch(message, /Essence 5/, 'capped at the first 5');
  assert.match(message, /and 3 more/);
  assert.match(message, /8 set\(s\)/, 'while the COUNT in the sentence stays exact');

  const detail = describeWorldEssenceMerge(mergeReport());
  assert.match(detail, /merged b1c2d3e4-f5a6 into iron across sys-a, sys-b/);
  assert.match(detail, /refused 99887766-5544 -> ash \(outputIdCollision\)/);
  assert.match(detail, /declined water \(macro\)/);
  assert.match(detail, /orphaned ghost/);
  assert.equal(describeWorldEssenceMerge(null), '');
});

test('the entry name wins, and a MALFORMED report still degrades readably', () => {
  // `buildWorldEssenceEquivalence` carries a `name` on every merged, refused and declined entry,
  // so the rest of the chain is a guard, not a path: the report arrives on a transient field no
  // schema validates, and a malformed one must still read as a sentence, not `undefined`.
  const message = buildWorldEssenceMergeNotice(
    { mergedGroups: [{ survivorId: 'nameless', loserIds: ['gone'] }] },
    noLocalizer
  );
  assert.match(message, /one shared essence: nameless\./);
  assert.doesNotMatch(message, /undefined/);
  const preferred = buildWorldEssenceMergeNotice(
    {
      mergedGroups: [{ survivorId: 'iron', loserIds: ['x'], name: 'From the entry' }],
      retired: { x: { name: 'From the tombstone' } },
    },
    noLocalizer
  );
  assert.match(preferred, /From the entry/, "the producer's own `name` is what the GM reads");
  assert.doesNotMatch(preferred, /From the tombstone/);
});

test('the shipped report shape — a `name` on every entry — needs no fallback at all', () => {
  // `buildWorldEssenceEquivalence` carries an absence-preserving `name` on each of the three entry
  // types, so a regression that dropped it from the producer surfaces here as a wall of UUIDs.
  const message = buildWorldEssenceMergeNotice(
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
  assert.match(message, /one shared essence: Iron\./);
  assert.match(message, /Ash \(outputIdCollision\)/);
  assert.match(message, /Water \(macro\)/);
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
    /ui\.notifications\?\.warn\?\.\(essenceNotice, \{ permanent: true \}\)/,
    'ALWAYS permanent and ALWAYS a warning: an irreversible merge, an un-retried refusal and an ' +
      'unsettled disagreement are all things the GM must see'
  );
  assert.doesNotMatch(block, /notifications\?\.info\?\.\(essenceNotice/);
  assert.match(
    block,
    /console\.info\('Fabricate \| 1\.34\.0 equivalent essence merge:', detail\)/,
    "`console.debug` maps to DevTools' VERBOSE level, which Chromium's default filter excludes, " +
      'so the capped toast would point at a dump nobody can see'
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
    /if \(notice && game\.user\?\.isGM\) ui\.notifications\?\.warn\?\.\(notice, \{ permanent: true \}\);/,
    'GM-only and PERMANENT, exactly as the 1.30.0 sibling posts its own'
  );
  assert.doesNotMatch(
    MAIN,
    /MIRRORS `runWorldScopeIdentityFlagRemap` DELIBERATELY AND COMPLETELY/,
    'the mirror is partial and the docblock must not overstate it'
  );
});

test('the Merged clause fallback and its lang/en.json string say the SAME thing', () => {
  // Existence is not agreement: the key-exists guards either side stayed green while the inline
  // English fallback kept a sentence `lang/en.json` had already been corrected away from. The
  // fallback fires whenever `game.i18n` cannot resolve the key, so the two renderings must match.
  const lang = JSON.parse(readFileSync(resolve(HERE, '..', 'lang', 'en.json'), 'utf8'));
  const expected = lang.FABRICATE.Migration.WorldEssenceMerge.Merged;
  const source = readFileSync(
    resolve(HERE, '..', 'src', 'migration', 'worldScopeEntityNotice.js'),
    'utf8'
  );
  const fallback = source.match(/`Fabricate found \$\{merged\.length\}([\s\S]*?)`/);
  assert.ok(fallback, 'the premise: the module really does carry an inline Merged fallback');
  const normalized = `Fabricate found {count}${fallback[1].replaceAll('${names}', '{names}')}`;
  assert.equal(normalized, expected);
});

test('every WorldEssenceMerge key the REMAP notice references exists in lang/en.json', () => {
  const lang = JSON.parse(readFileSync(resolve(HERE, '..', 'lang', 'en.json'), 'utf8'));
  const source = readFileSync(
    resolve(HERE, '..', 'src', 'migration', 'remapWorldScopeIdentityFlags.js'),
    'utf8'
  );
  const keys = [...source.matchAll(/'(FABRICATE\.Migration\.WorldEssenceMerge\.[A-Za-z]+)'/g)].map(
    (match) => match[1]
  );
  assert.equal(
    keys.length,
    3,
    `the premise: the module really does reference keys (${keys.length})`
  );
  for (const key of new Set(keys)) {
    const value = key.split('.').reduce((node, segment) => node?.[segment], lang);
    assert.equal(typeof value, 'string', `${key} must exist in lang/en.json`);
  }
});

test('every WorldEssenceMerge localization key the notice references exists in lang/en.json', () => {
  const lang = JSON.parse(readFileSync(resolve(HERE, '..', 'lang', 'en.json'), 'utf8'));
  const source = readFileSync(
    resolve(HERE, '..', 'src', 'migration', 'worldScopeEntityNotice.js'),
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
    const value = key.split('.').reduce((node, segment) => node?.[segment], lang);
    assert.equal(typeof value, 'string', `${key} must exist in lang/en.json`);
  }
});

test('the shipped English strings carry the same substitutions the fallbacks do', () => {
  // `localizeWith` refuses a missing key but never an incomplete one, so a localized string that
  // drops a placeholder renders worse than the fallback, with nothing else to catch it.
  const lang = JSON.parse(readFileSync(resolve(HERE, '..', 'lang', 'en.json'), 'utf8'));
  const block = lang.FABRICATE.Migration.WorldEssenceMerge;
  for (const [key, placeholders] of [
    ['Merged', ['{count}', '{names}']],
    ['Refusals', ['{count}', '{refusals}']],
    ['Declined', ['{count}', '{essences}']],
    ['Overflow', ['{count}']],
    ['UnsafeEssenceIds', ['{count}', '{essences}']],
    ['RemapLockedSkips', ['{count}']],
    ['RemapSkippedErrors', ['{count}']],
  ]) {
    for (const placeholder of placeholders) {
      assert.ok(block[key].includes(placeholder), `${key} must interpolate ${placeholder}`);
    }
  }
  assert.doesNotMatch(block.ItemOverrideScope, /\{/, 'the scope disclosure interpolates nothing');
  assert.match(block.Merged, /cannot be undone/, 'the merge is IRREVERSIBLE and says so');
  assert.match(block.Refusals, /will not be retried/);
  // Requirement 8a: the loser's world identity is deleted and its in-system rows keep theirs, so
  // the string must not tell a GM the icon is gone.
  assert.match(
    block.Merged,
    /own essence row keeps the name, icon and description it was authored with/,
    'the notice must scope the identity loss to the WORLD record'
  );
});
