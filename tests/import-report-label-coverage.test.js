/**
 * Issue 877 — the import report must never render a raw localization key.
 *
 * It did: `FABRICATE.Admin.ImportReport.OwnerType.recipeItem` appeared verbatim in the
 * GM's report, because the resolver emits an owner type (`recipeItem`, for recipe-book
 * membership) that `lang/en.json` never declared. Nothing failed — `buildImportReportContent`
 * simply passes the un-translated key through as the label.
 *
 * A literal grep for owner types UNDERCOUNTS, because several reach the report through
 * dynamic pass-through: `collectMacroDescriptors(records, ownerType, …)` takes its owner
 * type from the CALL SITE, and the internal `push(kind, ownerType, …)` helper takes both
 * from its callers. So this guard is a UNION of two views, neither of which is trusted
 * alone:
 *
 *   1. BEHAVIOURAL — drive the real `resolveImportReferences` over a payload that trips
 *      every emitting site, and read the `(kind, ownerType)` pairs it actually produced.
 *      This is what catches the dynamic pass-through.
 *   2. STATIC — sweep `src/systems/**` for owner types written as string LITERALS, which
 *      catches producers outside the resolver (`CompendiumImporter._foldComponentReferences`
 *      emits the `sourceItem` / `component` pair, and no pure payload can reach it).
 *
 * Kinds are additionally checked against the declared `REFERENCE_KINDS` enum, which is the
 * complete kind vocabulary by construction.
 *
 * The headline assertion is deliberately end-to-end: build the real report content with a
 * real `lang/en.json`-backed localizer and assert that no rendered label still equals the
 * key it was looked up by. That is the user-visible defect, stated once.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REFERENCE_KINDS,
  resolveImportReferences,
} from '../src/systems/importReferenceResolver.js';
import { buildImportReportContent } from '../src/systems/importReportContent.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LANG = JSON.parse(readFileSync(join(ROOT, 'lang', 'en.json'), 'utf8'));
const REPORT_STRINGS = LANG.FABRICATE.Admin.ImportReport;

/** Real localizer over `lang/en.json`, with the `{token}` interpolation Foundry does. */
function localize(key, data) {
  const value = key
    .split('.')
    .reduce((node, segment) => (node && typeof node === 'object' ? node[segment] : undefined), {
      FABRICATE: LANG.FABRICATE,
    });
  if (typeof value !== 'string') return key;
  return Object.entries(data || {}).reduce(
    (text, [token, replacement]) => text.replaceAll(`{${token}}`, String(replacement)),
    value
  );
}

/**
 * A payload rigged so EVERY reference site in `importReferenceResolver.js` emits: both
 * external descriptor classes and every internal broken-reference push. Every `ghost-*`
 * id and `*.missing*` uuid is deliberately unresolvable.
 */
function everyReferencePayload() {
  return {
    system: {
      components: [
        {
          id: 'c1',
          name: 'Iron Ore',
          salvage: {
            resultGroups: [{ id: 'g1', results: [{ componentId: 'ghost-salvage-result' }] }],
            catalysts: [{ componentId: 'ghost-salvage-catalyst' }],
          },
        },
      ],
      tools: [
        {
          id: 't1',
          name: 'Hammer',
          componentId: 'ghost-tool',
          onBreak: { replacementComponentId: 'ghost-tool-replacement' },
        },
      ],
      essenceDefinitions: [{ id: 'e1', name: 'Fire', sourceComponentId: 'ghost-essence' }],
      recipeItemDefinitions: [
        { id: 'b1', name: 'Tome of Brewing', recipeIds: ['ghost-membership'] },
      ],
      gatheringRealms: [
        {
          id: 'r1',
          name: 'Verdant',
          sceneMappings: [
            { sceneUuid: 'Scene.missing0001', sceneRegionUuid: 'Scene.missing0001.Region.missing' },
          ],
        },
      ],
    },
    recipes: [
      {
        id: 'rec1',
        name: 'Brew',
        macroUuid: 'Macro.missing0001',
        recipeItemId: 'ghost-book',
        ingredientSets: [
          { ingredientGroups: [{ options: [{ componentId: 'ghost-ingredient' }] }] },
        ],
        resultGroups: [{ results: [{ componentId: 'ghost-result' }] }],
      },
    ],
    gatheringEnvironments: [
      {
        id: 'env1',
        name: 'Grove',
        sceneUuid: 'Scene.missing0002',
        enabledTaskIds: ['ghost-task'],
        enabledEventIds: ['ghost-event'],
      },
    ],
    gatheringConfig: {
      system: {
        tasks: [
          {
            id: 'task1',
            name: 'Forage',
            macroUuid: 'Macro.missing0002',
            // Carries an itemUuid, so it emits the EXTERNAL drop-row item reference.
            dropRows: [{ itemUuid: 'Item.missing0001' }],
          },
        ],
        events: [
          {
            id: 'ev1',
            name: 'Storm',
            macroUuid: 'Macro.missing0003',
            // No itemUuid, so it emits the INTERNAL drop-row component link instead.
            dropRows: [{ componentId: 'ghost-drop-row' }],
          },
        ],
        tools: [],
      },
    },
  };
}

async function emittedReferences() {
  const { unresolvedReferences } = await resolveImportReferences(everyReferencePayload(), {
    resolveUuid: async () => null,
  });
  return unresolvedReferences;
}

/** Owner types written as string literals anywhere under `src/systems/`. */
function literalOwnerTypesInSystems() {
  const directory = join(ROOT, 'src', 'systems');
  const found = new Set();
  const patterns = [
    /ownerType:\s*'([A-Za-z]+)'/g,
    /push\(\s*REFERENCE_KINDS\.[A-Z_]+,\s*'([A-Za-z]+)'/g,
  ];
  for (const relativePath of readdirSync(directory, { recursive: true })) {
    if (!String(relativePath).endsWith('.js')) continue;
    const source = readFileSync(join(directory, String(relativePath)), 'utf8');
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) found.add(match[1]);
    }
  }
  return found;
}

test('the resolver payload trips every declared reference kind except the importer-only one', async () => {
  const kinds = new Set((await emittedReferences()).map((reference) => reference.kind));
  // `sourceItem` is folded in by CompendiumImporter._foldComponentReferences from the
  // component source-item resolution, which no pure payload can reach; it is covered by
  // the enum-completeness assertion below instead.
  const expected = Object.values(REFERENCE_KINDS)
    .filter((kind) => kind !== REFERENCE_KINDS.SOURCE_ITEM)
    .sort();
  assert.deepEqual(
    [...kinds].sort(),
    expected,
    'the fixture stopped covering a reference kind — extend it rather than narrowing this list'
  );
});

test('every reference kind the report can group has a Kind label', () => {
  // The enum is the complete kind vocabulary, plus the `unknown` fallback
  // `buildImportReportContent` substitutes for a kind-less reference.
  const required = [...Object.values(REFERENCE_KINDS), 'unknown'].sort();
  const missing = required.filter((kind) => typeof REPORT_STRINGS.Kind[kind] !== 'string');
  assert.deepEqual(missing, [], `FABRICATE.Admin.ImportReport.Kind is missing: ${missing}`);
});

test('every owner type the import can emit has an OwnerType label', async () => {
  const emitted = new Set((await emittedReferences()).map((reference) => reference.ownerType));
  for (const ownerType of literalOwnerTypesInSystems()) emitted.add(ownerType);
  // `unknown` is the fallback for an owner-type-less reference.
  emitted.add('unknown');

  const missing = [...emitted]
    .filter((ownerType) => typeof REPORT_STRINGS.OwnerType[ownerType] !== 'string')
    .sort();
  assert.deepEqual(
    missing,
    [],
    `FABRICATE.Admin.ImportReport.OwnerType is missing: ${missing.join(', ')}`
  );
});

test('the assembled report renders no raw localization key', async () => {
  const references = await emittedReferences();
  assert.ok(references.length > 0, 'expected the fixture to produce references');

  const content = buildImportReportContent({ unresolvedReferences: references }, localize);

  const rendered = [
    content.title,
    content.headline,
    content.emptyStateLabel,
    content.handledLine,
    ...content.groups.flatMap((group) => [
      group.kindLabel,
      ...group.rows.map((row) => row.ownerTypeLabel),
    ]),
  ];
  const raw = rendered.filter((label) => String(label).startsWith('FABRICATE.'));
  assert.deepEqual(raw, [], `the report rendered raw keys: ${raw.join(', ')}`);
});

test('a component salvage reference is owned by the component, not by a recipe', async () => {
  const salvage = (await emittedReferences()).filter((reference) =>
    String(reference.referenceValue).startsWith('ghost-salvage')
  );
  assert.equal(salvage.length, 2, 'expected the salvage result AND catalyst refs');
  for (const reference of salvage) {
    assert.equal(reference.ownerType, 'component');
    assert.equal(reference.ownerName, 'Iron Ore');
  }
});
