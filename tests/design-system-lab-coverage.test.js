/**
 * The coverage gate over the Primitive Lab's catalogue.
 *
 * `tests/design-system-coverage.test.js` answers "do the library and the manifest describe the same
 * vocabulary". This file answers the next question down: does the LAB drive every member of it, and
 * does it drive them through props those components actually declare.
 *
 * WHY A THIRD ARTIFACT NEEDS ITS OWN GATE
 * ---------------------------------------
 * The catalogue is the only part of the lab that is written rather than derived. Its section, its
 * prose, its evidence and its caller count all come from `library.html` and
 * `designSystemPrimitives.json` at load time. What a row says is how to DRIVE the component — which
 * props to put a control on, which to waive, which values to fix — and that is a claim about a
 * FILE. A knob naming `varaint` renders nothing, logs nothing and looks exactly like a prop with no
 * visible effect; a row that quietly stopped covering a component looks exactly like a component
 * with nothing to show.
 *
 * WHY THE RULES BELOW CARRY THEIR OWN ANTI-VACUITY ANCHOR
 * -------------------------------------------------------
 * Every correspondence here is a set comparison, and every set comparison passes over two empty
 * sets. An empty catalogue satisfies "no knob names a prop that does not exist", "every declared
 * prop is knobbed or waived" and "no two rows claim one path" simultaneously and perfectly. So the
 * catalogue's own size is pinned against the manifest's, the library corpus is checked for a pulse,
 * and the prop-name shape rule quantifies over the WHOLE component tree rather than over the
 * catalogued subset — which is also what makes it the rule that would have caught the parser defect
 * this change repairs.
 *
 * WHAT IT MAY NOT IMPORT, AND WHY
 * -------------------------------
 * `knobs.js` and `fillers.js`. `knobs.js` imports nothing at all and `fillers.js` imports only
 * `createRawSnippet`, which builds a snippet from a render function and touches no DOM until
 * something renders it — so both load under `node --test` with no window in reach, and this gate
 * compares the SAME objects the lab resolves against rather than a reading of their source.
 * `model.js` needs a JSON import attribute and `importers.js` needs `import.meta.glob`, so both are
 * Vite-only. Everything else this gate needs is read through `node:fs`, which is the same set of
 * bytes the lab reads and therefore not a second record of it.
 *
 * THE FILLER RULE USED TO SCRAPE `fillers.js` AS TEXT, and it is the reason that paragraph is
 * worth stating precisely: the ids were read out of a named object literal, so renaming that
 * literal made the reader answer with an empty set — under which "every filler a catalogue row
 * selects exists" is true of every catalogue. The aliveness assertion is what turned that into a
 * named failure, and it is why the import is the repair rather than a better regular expression.
 *
 * `parseDesignLibrary` is called ONCE, at module scope. It builds and closes a happy-dom `Window`
 * per call, and this file would otherwise make one per test — the shape `npm test` runs out of heap
 * on here.
 *
 * WHY THE `$props()` PARSER'S OWN FIXTURE PROOF LIVES IN THIS FILE
 * ----------------------------------------------------------------
 * `tests/helpers/` is outside the `npm test` glob, so a proof written beside the helper would never
 * run. This gate is the parser's newest consumer and the first one the defect could reach — the two
 * older consumers pin eight essence and scoped screens and none of the five components that
 * mis-parsed — so the proof lives with the consumer that needs it.
 */
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CATALOGUE_DIRECTORY,
  CATALOGUE_README,
  ERROR_ATTRIBUTE,
  MOUNTED_ATTRIBUTE,
  MOUNT_ALL_QUERY,
  READY_ATTRIBUTE,
  SPECIMEN_ATTRIBUTE,
  catalogueEntries,
  catalogueFiles,
  cataloguePaths,
  describeMountFailure,
  emptyCatalogueMessage,
  expectedSpecimenCount,
} from '../scripts/lib/primitiveLabSmoke.js';
import { listSvelteComponents, toRepositoryPaths } from '../scripts/lib/svelteComponentFiles.js';

import {
  parseDesignLibrary,
  primitiveNamesIn,
  readDesignLibrary,
} from './helpers/designLibrary.js';
import { declaredPropNames } from './helpers/sveltePropsDeclaration.js';
import {
  COMPONENT_FILLER_IDS,
  FILLER_IDS,
  FILLER_MARKUP,
  RAW_FILLERS,
  describeFiller,
  fillerIds,
} from './view-lab/primitives/fillers.js';
import {
  accountedProps,
  buildProps,
  defaultValues,
  expandMatrix,
  renderInvocation,
  tagFor,
} from './view-lab/primitives/knobs.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The library, parsed once. See the docblock: a `Window` per call is what OOMs `npm test`. */
const LIBRARY = parseDesignLibrary(readDesignLibrary());

/** The manifest, read as bytes rather than through its `.js` wrapper — the lab reads the JSON. */
const MANIFEST = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'scripts/lib/designSystemPrimitives.json'), 'utf8')
);

/** Both manifest tables. The lab mounts near-members too; the register is why, not whether. */
const MANIFEST_ROWS = [...MANIFEST.designSystemPrimitives, ...MANIFEST.notAPrimitive];

/** Every catalogue row, each carrying the file and index it was written at. */
const CATALOGUE = catalogueEntries(REPO_ROOT);

/** Every shipped component, as the repository-relative POSIX path a manifest row names. */
const SHIPPED_COMPONENTS = toRepositoryPaths(
  REPO_ROOT,
  listSvelteComponents(path.join(REPO_ROOT, 'src'))
);

/**
 * A prop name as JavaScript spells one, plus the `...rest` form the parser reports verbatim.
 *
 * THIS IS THE RULE THAT WOULD HAVE CAUGHT THE PARSER DEFECT. Against `ThresholdBandStrip.svelte`
 * the old reader returned three names for fifteen props, and one of the three was a JSDoc comment
 * glued to `previewDc`. Nothing rejected it, so the only visible symptom was the coverage rule
 * below reporting `step`, `min`, `max` and `onChange` as knobs on props that "do not exist" — which
 * makes deleting those knobs the cheapest repair, and a gate whose cheapest repair REMOVES coverage
 * is worse than no gate.
 */
const PROP_NAME = /^(\.\.\.)?[A-Za-z_$][\w$]*$/;

/** The largest matrix a story may expand to. `expandMatrix` builds an uncapped cartesian product. */
const MAX_STORY_CELLS = 24;

/** Knob types that carry a value the user edits. `event` is the only other one. */
const VALUE_KNOB_TYPES = new Set([
  'select',
  'boolean',
  'text',
  'number',
  'colour',
  'json',
  'snippet',
]);

/**
 * Where a row was written, for a message that names a position rather than a component.
 *
 * `catalogue/controls.json[3]` is a place someone can open. "the row for ManagerButton" is a search
 * across eight files, and the search is ambiguous exactly when the fault is a DUPLICATE row.
 *
 * @param {{file: string, index: number}} entry A catalogue entry.
 * @returns {string} A citation.
 */
function where(entry) {
  return `catalogue/${entry.file}[${entry.index}]`;
}

/**
 * Order two strings by code point, ascending.
 *
 * Explicit rather than a bare `sort()`, for the reason `scripts/lib/svelteComponentFiles.js` and
 * `tests/design-system-coverage.test.js` both record beside their own copies: `localeCompare` is
 * locale-dependent, so two machines could order a reported set differently and disagree about a
 * difference they both measured correctly.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number} negative, zero or positive per the `Array#sort` contract
 */
const byCodePoint = (left, right) => (left < right ? -1 : Number(left > right));

/**
 * One side of a set equality: what `expected` holds that `present` does not.
 *
 * Returned as an array rather than asserted on, so the failure names the ids that DIVERGE instead
 * of printing two whole sets and leaving the reader to diff them — and so the same comparison can
 * be run in both directions, which is the only way a message can say which side is short.
 *
 * @param {Iterable<string>} present The side being checked.
 * @param {Iterable<string>} expected The side it is checked against.
 * @returns {string[]} The difference, deduplicated, in code-point order.
 */
function missingFrom(present, expected) {
  const have = new Set(present);
  return [...new Set(expected)].filter((id) => !have.has(id)).sort(byCodePoint);
}

/** Component source text, read at most once per path. */
const sourceCache = new Map();

/**
 * The prop names a catalogue row's component declares.
 *
 * @param {string} componentPath Repository-relative POSIX path.
 * @returns {string[]|null} Declared names, or null when the file does not exist.
 */
function declaredFor(componentPath) {
  if (!sourceCache.has(componentPath)) {
    const absolute = path.join(REPO_ROOT, componentPath);
    sourceCache.set(componentPath, existsSync(absolute) ? readFileSync(absolute, 'utf8') : null);
  }
  const source = sourceCache.get(componentPath);
  return source === null ? null : declaredPropNames(source);
}

/**
 * The keys of an object literal, at its own outermost indentation only.
 *
 * A brace-balancing parser would be more precise and is not worth it: every literal read this way
 * is Prettier-formatted, so its top-level keys are exactly the key-shaped lines at the SMALLEST
 * indentation in the slice. Taking the minimum rather than a fixed width is what keeps this working
 * across the three literals it reads, which sit at three different depths.
 *
 * @param {string} slice Source text containing one object literal and nothing above it.
 * @returns {string[]} Key names, in source order.
 */
function objectLiteralKeys(slice) {
  const found = [
    ...slice.matchAll(/^([\t ]+)(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*[:,]/gm),
  ].map((match) => ({
    indent: match[1].length,
    key: match[2] ?? match[3] ?? match[4],
  }));
  if (found.length === 0) return [];
  const outermost = Math.min(...found.map((entry) => entry.indent));
  return found.filter((entry) => entry.indent === outermost).map((entry) => entry.key);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The corpora
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('the corpora every property below quantifies over are alive', () => {
  assert.ok(LIBRARY.blockCount > 0, 'the library parser found no spec-head block; the anchor died');
  assert.ok(
    LIBRARY.headingSections.length === LIBRARY.headings.length,
    'headingSections is positional against headings; a length mismatch reassigns every entry ' +
      'after the gap to another section'
  );
  assert.ok(MANIFEST_ROWS.length > 50, `the manifest holds ${MANIFEST_ROWS.length} rows`);
  assert.ok(
    SHIPPED_COMPONENTS.length > 100,
    `the component walk found ${SHIPPED_COMPONENTS.length} files, so it is not walking`
  );
});

test('the catalogue is alive and covers exactly the two manifest tables', () => {
  // THE ANTI-VACUITY ANCHOR for this whole file. Every other rule here is a set comparison, and a
  // set comparison over an empty catalogue passes perfectly while the lab shows nothing.
  const files = catalogueFiles(REPO_ROOT);
  assert.ok(
    files.length > 1,
    `the catalogue holds ${files.length} file(s). One file per group is what makes two people ` +
      'cataloguing different sections disjoint, and zero files makes every rule below vacuous.'
  );
  assert.equal(
    CATALOGUE.length,
    MANIFEST_ROWS.length,
    `the catalogue holds ${CATALOGUE.length} rows and the manifest holds ${MANIFEST_ROWS.length}`
  );
  assert.ok(CATALOGUE.length > 50, `${CATALOGUE.length} catalogued rows is not the whole set`);

  const catalogued = new Set(CATALOGUE.map((entry) => entry.row.path));
  const recorded = new Set(MANIFEST_ROWS.map((row) => row.path));
  assert.deepEqual(
    [...recorded].filter((entry) => !catalogued.has(entry)).sort(byCodePoint),
    [],
    'a manifest row has no catalogue row, so the lab does not mount it. Every member and every ' +
      'recorded near-member is driveable or the lab is a partial picture presented as a whole one.'
  );
  assert.deepEqual(
    [...catalogued].filter((entry) => !recorded.has(entry)).sort(byCodePoint),
    [],
    'a catalogue row names a component the manifest does not record. The lab draws its name, its ' +
      'section and its prose from the manifest and the library, so an uncorded row renders as a ' +
      'specimen with no identity.'
  );

  for (const entry of CATALOGUE) {
    assert.ok(
      accountedProps(entry.row).all.length > 0,
      `${where(entry)}: ${entry.row.path} accounts for no props at all. A row that knobs nothing ` +
        'and waives nothing satisfies every correspondence below without driving anything.'
    );
  }
});

test('every catalogue row names a component that exists', () => {
  for (const entry of CATALOGUE) {
    assert.ok(
      existsSync(path.join(REPO_ROOT, entry.row.path)),
      `${where(entry)}: no component at ${entry.row.path}. The importer glob would answer "no ` +
        'component at" and the specimen would render as a mount failure, which reads as a broken ' +
        'component rather than as a row naming a file that is not there.'
    );
  }
});

test('no two catalogue rows claim one path', () => {
  const seen = new Map();
  for (const entry of CATALOGUE) {
    const first = seen.get(entry.row.path);
    assert.ok(
      first === undefined,
      `${entry.row.path} is catalogued twice: ${where(first ?? entry)} and ${where(entry)}. ` +
        '`model.js` keys the catalogue by path into a Map, so the LAST row silently wins and the ' +
        'other one is invisible — including its knobs, which is coverage that reads as present.'
    );
    seen.set(entry.row.path, entry);
  }
});

test('the catalogue directory holds nothing the lab cannot see', () => {
  const entries = readdirSync(path.join(REPO_ROOT, CATALOGUE_DIRECTORY), { withFileTypes: true });
  assert.ok(entries.length > 0, 'the catalogue directory is gone');
  for (const entry of entries) {
    assert.ok(
      entry.isFile(),
      `${CATALOGUE_DIRECTORY}/${entry.name} is a directory. \`import.meta.glob\` is NOT ` +
        'recursive here, so every row under it is invisible to the lab AND to the reader this ' +
        'gate uses — identically, and with no error from either.'
    );
    assert.ok(
      entry.name.endsWith('.json') || entry.name === CATALOGUE_README,
      `${CATALOGUE_DIRECTORY}/${entry.name} is neither a catalogue file nor the README. The lab ` +
        'globs `*.json` and reads nothing else.'
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The props correspondence
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * How `...rest` is accounted for, decided ONCE here rather than row by row.
 *
 * Eleven of the fifty-seven catalogued components destructure `...rest`, and
 * `declaredPropNames` reports the literal `...rest` — deliberately, so a component that opened
 * itself to arbitrary keys fails a set equality instead of passing under the name it collected them
 * into. Two things follow, and they are different questions:
 *
 *   - The NAME is accounted for like any other, as an `unknobbed` waiver written `"...rest"` with
 *     a `why`. It is not special-cased away, because "this component forwards everything else" is
 *     a fact about its API that a reader of the row should see stated.
 *   - A knob may additionally opt in with `via: "rest"`, which says the prop it drives is one of
 *     the arbitrary keys rather than a declared one. A `ManagerButton` `title` or `aria-label` knob
 *     is the case: those reach the element through the spread and there is no declaration to name.
 *     Permitted ONLY on a row whose component actually declares `...rest` — otherwise it is a
 *     blanket exemption from the rule below, available to any row that types two words.
 */
const REST_PROP = '...rest';

test('every declared prop is either knobbed or waived with a reason', () => {
  for (const entry of CATALOGUE) {
    const declared = declaredFor(entry.row.path);
    if (declared === null) continue; // reported by the row-names-a-real-component rule above
    const accounted = new Set(accountedProps(entry.row).all);
    for (const name of declared) {
      assert.ok(
        accounted.has(name),
        `${where(entry)}: ${tagFor(entry.row)} declares \`${name}\` and the row neither knobs it ` +
          'nor waives it. A prop nothing drives is a prop the lab cannot show, and the lab is the ' +
          'artifact that claims to show them.'
      );
    }
    for (const waiver of entry.row.unknobbed ?? []) {
      assert.ok(
        typeof waiver.why === 'string' && waiver.why.trim().length > 0,
        `${where(entry)}: \`${waiver.prop}\` is waived with no \`why\`. A waiver with no reason ` +
          'is indistinguishable from an oversight, and is the cheapest way to green this rule.'
      );
    }
  }
});

test('no knob names a prop the component does not declare', () => {
  for (const entry of CATALOGUE) {
    const declared = declaredFor(entry.row.path);
    if (declared === null) continue;
    const declaredSet = new Set(declared);
    const spreads = declaredSet.has(REST_PROP);
    for (const knob of entry.row.knobs ?? []) {
      if (knob.via === 'rest') {
        assert.ok(
          spreads,
          `${where(entry)}: knob \`${knob.prop}\` declares \`via: "rest"\` and ` +
            `${tagFor(entry.row)} destructures no \`...rest\`. There is no spread for it to reach ` +
            'the element through, so the prop is dropped and the knob is inert.'
        );
        continue;
      }
      assert.ok(
        declaredSet.has(knob.prop),
        `${where(entry)}: knob \`${knob.prop}\` names a prop ${tagFor(entry.row)} does not ` +
          `declare. Its props are: ${declared.join(', ')}. Svelte drops an undeclared prop ` +
          'silently, so the control renders, moves, and changes nothing.'
      );
    }
    for (const waiver of entry.row.unknobbed ?? []) {
      assert.ok(
        declaredSet.has(waiver.prop),
        `${where(entry)}: \`${waiver.prop}\` is waived and ${tagFor(entry.row)} does not declare ` +
          'it. A waiver for a prop that does not exist hides a real prop going unaccounted for, ' +
          'because the two lists are compared by size nowhere.'
      );
    }
  }
});

test('every prop name every shipped component declares is a name', () => {
  // OVER THE WHOLE TREE, not over the catalogued subset. This is the rule the repaired parser
  // exists for, and scoping it to the catalogue would mean the reader could go back to returning
  // JSDoc comments as prop names the moment a component left the lab.
  let parsed = 0;
  for (const componentPath of SHIPPED_COMPONENTS) {
    let declared;
    try {
      declared = declaredPropNames(readFileSync(path.join(REPO_ROOT, componentPath), 'utf8'));
    } catch {
      continue; // a component with no `$props()` destructure at all
    }
    parsed += 1;
    assert.ok(
      declared.length > 0,
      `${componentPath} has a \`$props()\` destructure that yielded NO names, which is a parse ` +
        'failure wearing the same shape as a component with no props'
    );
    for (const name of declared) {
      assert.ok(
        PROP_NAME.test(name),
        `${componentPath} declares ${JSON.stringify(name)}, which is not an identifier. The ` +
          '`$props()` reader produced it, so the reader is wrong about this file — and every ' +
          'consumer of it is now comparing sets against a name no call site can pass.'
      );
    }
  }
  assert.ok(parsed > 100, `only ${parsed} components parsed, so this rule has almost no domain`);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The knob declarations
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('a fixed prop and a knob never name the same prop', () => {
  for (const entry of CATALOGUE) {
    const knobbed = new Set((entry.row.knobs ?? []).map((knob) => knob.prop));
    for (const fixed of Object.keys(entry.row.fixedProps ?? {})) {
      assert.ok(
        !knobbed.has(fixed),
        `${where(entry)}: \`${fixed}\` is both a knob and a fixedProp. \`buildProps\` spreads ` +
          '`fixedProps` LAST, so the fixed value wins on every render and the control is inert — ' +
          'it moves, the invocation updates, and the specimen never changes.'
      );
    }
  }
});

test('every event knob writes back into a value knob on its own row', () => {
  for (const entry of CATALOGUE) {
    const valueKnobs = new Set(
      (entry.row.knobs ?? [])
        .filter((knob) => VALUE_KNOB_TYPES.has(knob.type))
        .map((knob) => knob.prop)
    );
    for (const knob of entry.row.knobs ?? []) {
      if (knob.writes !== undefined) {
        assert.ok(
          valueKnobs.has(knob.writes),
          `${where(entry)}: \`${knob.prop}\` writes back into \`${knob.writes}\`, which is no ` +
            'value knob on this row. `applyWriteBack` writes the key anyway, nothing renders it, ' +
            'and the controlled primitive stays inert — the exact failure `writes` exists to fix.'
        );
      }
      if (knob.arg !== undefined) {
        assert.ok(
          Number.isInteger(knob.arg) && knob.arg >= 0,
          `${where(entry)}: \`${knob.prop}\` declares \`arg: ${JSON.stringify(knob.arg)}\`. It ` +
            "indexes the callback's arguments, so a non-integer reads `undefined` and writes it."
        );
      }
    }
  }
});

test('every wildcard matrix axis names a knob with an option set', () => {
  for (const entry of CATALOGUE) {
    const knobs = new Map((entry.row.knobs ?? []).map((knob) => [knob.prop, knob]));
    for (const story of entry.row.stories ?? []) {
      for (const [prop, spec] of Object.entries(story.matrix ?? {})) {
        const knob = knobs.get(prop);
        assert.ok(
          knob,
          `${where(entry)}: story "${story.title}" varies \`${prop}\`, which is no knob on this row`
        );
        if (spec !== '*') continue;
        assert.ok(
          knob.type === 'boolean' || (knob.options?.length ?? 0) > 0,
          `${where(entry)}: story "${story.title}" varies \`${prop}\` by \`'*'\` and that knob ` +
            'declares no options. `expandMatrix` reads `knob.options ?? []`, so the axis expands ' +
            'to ZERO cells and the whole story renders empty rather than failing.'
        );
      }
    }
  }
});

test('no story expands to more cells than anybody would read', () => {
  for (const entry of CATALOGUE) {
    const base = defaultValues(entry.row);
    for (const story of entry.row.stories ?? []) {
      const cells = expandMatrix(entry.row, story, base);
      assert.ok(
        cells.length > 0,
        `${where(entry)}: story "${story.title}" expands to no cells at all, so it renders as an ` +
          'empty heading'
      );
      assert.ok(
        cells.length <= MAX_STORY_CELLS,
        `${where(entry)}: story "${story.title}" expands to ${cells.length} cells. ` +
          '`expandMatrix` builds an UNCAPPED cartesian product, so a third axis multiplies rather ' +
          `than adds; ${MAX_STORY_CELLS} is the point past which the page is slower to read than ` +
          'the component it is showing.'
      );
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The engine itself, exercised rather than described
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One row carrying every knob type, so the engine rules have a domain the catalogue cannot empty.
 *
 * Deliberately NOT a real catalogue row. A rule exercised only over the catalogue is a rule that
 * goes quiet the moment the catalogue does, and `accountedProps` — the one function the rest of
 * this file leans on — is also the only one a set comparison touches. `buildProps`,
 * `renderInvocation` and `expandMatrix` are what the page actually runs.
 */
const ENGINE_FIXTURE = {
  path: 'src/ui/svelte/components/Stepper.svelte',
  knobs: [
    { prop: 'value', type: 'number', value: 3 },
    { prop: 'label', type: 'text', value: 'Quantity' },
    { prop: 'disabled', type: 'boolean' },
    { prop: 'tone', type: 'select', options: ['neutral', 'danger'] },
    { prop: 'tint', type: 'colour', value: '#8b6f47' },
    { prop: 'bands', type: 'json', value: [{ id: 'a' }] },
    { prop: 'children', type: 'snippet', value: 'text' },
    { prop: 'trailing', type: 'snippet', value: '' },
    { prop: 'onChange', type: 'event', writes: 'value' },
  ],
  fixedProps: { id: 'engine-fixture' },
  stories: [{ title: 'tones', matrix: { tone: '*', disabled: [false, true] } }],
};

test('buildProps yields a key for every value knob and every event knob', () => {
  const values = defaultValues(ENGINE_FIXTURE);
  const props = buildProps({
    entry: ENGINE_FIXTURE,
    values,
    resolveSnippet: (id) => ({ filler: id }),
  });
  const expected = ENGINE_FIXTURE.knobs
    .filter((knob) => knob.type !== 'snippet' || values[knob.prop])
    .map((knob) => knob.prop);
  assert.deepEqual(
    Object.keys(props).sort(byCodePoint),
    [...expected, ...Object.keys(ENGINE_FIXTURE.fixedProps)].sort(byCodePoint),
    'a knob that contributes no key is a control with nothing behind it'
  );
  assert.equal(typeof props.onChange, 'function', 'an event knob must contribute a callback');
  assert.equal(props.id, 'engine-fixture', 'fixedProps must reach the component');
  assert.ok(
    !Object.hasOwn(props, 'trailing'),
    'an unset snippet knob must OMIT its prop — several primitives branch on `=== undefined` to ' +
      'decide whether to render a slot at all, and an empty snippet takes the other branch'
  );
});

test('the generated invocation is Svelte a call site could paste', () => {
  const values = { ...defaultValues(ENGINE_FIXTURE), value: 7, tone: 'danger', trailing: 'icon' };
  const markup = renderInvocation(ENGINE_FIXTURE, values);
  assert.ok(
    markup.startsWith(`<${tagFor(ENGINE_FIXTURE)}`),
    `the invocation opens with ${JSON.stringify(markup.slice(0, 40))} rather than the component's ` +
      'own tag; the library NAME and the importable file name are different strings and only one ' +
      'of them can be pasted'
  );
  // THE OPENING-TAG REGION, which is everything up to the `>` that closes it. A `{#snippet}` block
  // is a CHILD of a component, never one of its attributes: written inside the opening tag it does
  // not compile, so the one thing the generated snippet promises — that it can be pasted — is
  // false exactly for the rows that pass a non-`children` snippet.
  const openingTag = markup.slice(0, markup.indexOf('>') + 1);
  assert.ok(
    !openingTag.includes('{#snippet'),
    'the invocation renders a non-`children` snippet as an ATTRIBUTE:\n' +
      `${openingTag}\nA snippet prop is passed as a child block, not inside the opening tag.`
  );
});

test('expandMatrix returns at least one cell per story and varies what it names', () => {
  const base = defaultValues(ENGINE_FIXTURE);
  const cells = expandMatrix(ENGINE_FIXTURE, ENGINE_FIXTURE.stories[0], base);
  assert.equal(cells.length, 4, 'two options crossed with two booleans is four cells');
  assert.deepEqual(
    [...new Set(cells.map((cell) => cell.values.tone))].sort(byCodePoint),
    ['danger', 'neutral'],
    "a `*` axis must expand to the knob's own option list"
  );
  assert.equal(
    expandMatrix(ENGINE_FIXTURE, { title: 'default' }, base).length,
    1,
    'a story with no matrix is one cell, not zero — zero renders an empty heading'
  );
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The fillers
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('the filler ids and the ids the invocation describes are one set', () => {
  // THE ANTI-VACUITY ANCHOR for both filler rules. Each assertion below is a set comparison and a
  // set comparison passes over two empty sets — including the rule underneath this one, which
  // would call every catalogue row correct if the ids read as nothing. That is not hypothetical:
  // the reader this replaces scraped the ids out of `fillers.js` by name, and answered with an
  // empty set the moment the literal was renamed.
  assert.ok(FILLER_IDS.length > 3, `read ${FILLER_IDS.length} filler ids, so the reader is broken`);
  assert.equal(new Set(FILLER_IDS).size, FILLER_IDS.length, 'a filler id is declared twice');

  // `FILLER_IDS` is the one place the set is enumerated, so it is the side every other half is
  // compared against rather than a fourth record to keep in step with three others.
  const supplied = [...Object.keys(RAW_FILLERS), ...COMPONENT_FILLER_IDS];
  assert.deepEqual(
    missingFrom(supplied, FILLER_IDS),
    [],
    '`FILLER_IDS` enumerates a filler that neither `RAW_FILLERS` nor `COMPONENT_FILLER_IDS` ' +
      'supplies. `fillerIds()` offers it as a knob option, `assembleFillers` resolves it to ' +
      'nothing, and `buildProps` OMITS the snippet prop — so the slot renders empty and reads as ' +
      'a component that draws nothing there.'
  );
  assert.deepEqual(
    missingFrom(FILLER_IDS, supplied),
    [],
    '`RAW_FILLERS` declares a snippet `FILLER_IDS` does not enumerate. It is unreachable: no ' +
      'knob offers it, `assembleFillers` never checks for it, and `COMPONENT_FILLER_IDS` is ' +
      'derived by SUBTRACTING the raw half, so an id only the raw half knows about is silently ' +
      'excluded from the half `Fillers.svelte` is required to cover.'
  );

  const described = Object.keys(FILLER_MARKUP);
  assert.deepEqual(
    missingFrom(described, FILLER_IDS),
    [],
    '`FILLER_MARKUP` describes no markup for a filler the lab offers. `describeFiller` falls ' +
      'through to the id itself, so the generated invocation — whose whole promise is that it ' +
      'can be pasted and compile — prints a bare id where the call site would write markup.'
  );
  assert.deepEqual(
    missingFrom(FILLER_IDS, described),
    [],
    '`FILLER_MARKUP` describes a filler that does not exist. Nothing resolves it, so the entry ' +
      'is either a rename that was applied to one half of the file, or markup for a snippet the ' +
      'lab cannot render.'
  );

  // The seam itself, not just the map behind it. `renderInvocation` takes `describeFiller` as a
  // parameter defaulting to the identity function, so the browser's answer and this gate's are the
  // same function only if this one is exercised.
  for (const id of FILLER_IDS) {
    assert.equal(describeFiller(id), FILLER_MARKUP[id], `describeFiller(${id})`);
  }
  assert.equal(
    describeFiller('no-such-filler'),
    'no-such-filler',
    "an unknown id must come back as ITSELF. Returning another filler's markup would report the " +
      'fault as a different filler, in the one output on the page meant to be pasted somewhere.'
  );
  assert.deepEqual(
    fillerIds(),
    [...FILLER_IDS],
    '`fillerIds()` is what a snippet knob with no explicit option list offers, so it is the set ' +
      'the page actually presents'
  );
});

test('every filler a catalogue row selects exists', () => {
  for (const entry of CATALOGUE) {
    for (const knob of entry.row.knobs ?? []) {
      if (knob.type !== 'snippet') continue;
      const ids = [knob.value, ...(knob.options ?? [])].filter(Boolean);
      for (const id of ids) {
        assert.ok(
          FILLER_IDS.includes(id),
          `${where(entry)}: knob \`${knob.prop}\` offers the filler \`${id}\`, which does not ` +
            'exist. `buildProps` resolves it to nothing and OMITS the prop, so the slot renders ' +
            'empty and looks like a component that draws nothing there.'
        );
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The Foundry shim's world
// ─────────────────────────────────────────────────────────────────────────────────────────────

const SHIM_PATH = 'tests/view-lab/foundry/installFoundryShim.js';
const SHIM_SOURCE = readFileSync(path.join(REPO_ROOT, SHIM_PATH), 'utf8');

/**
 * The world the shim is installed with, preferring its own minimal one.
 *
 * The delta gives `installFoundryShim.js` an exported `createMinimalLabWorld()` so the Primitive
 * Lab does not need the View Lab's whole fixture. Until that lands the only world the shim is ever
 * given is the literal in `tests/view-lab/world/labWorld.js`, and the property is the same over
 * either: a field the shim READS that no world SUPPLIES fails late — inside a closure, or never —
 * which is exactly why a literal with no gate was worth replacing.
 *
 * Preference, not a union: once the minimal world exists it is the one the Primitive Lab boots
 * against, so checking the shim against the OTHER world would be checking a page nobody opens.
 *
 * @returns {{label: string, keys: string[]}} Where the world came from and what it declares.
 */
function minimalWorldKeys() {
  const marker = 'createMinimalLabWorld';
  if (SHIM_SOURCE.includes(marker)) {
    const slice = SHIM_SOURCE.slice(SHIM_SOURCE.indexOf(marker));
    return { label: `${SHIM_PATH} ${marker}()`, keys: objectLiteralKeys(slice) };
  }
  const worldSource = readFileSync(
    path.join(REPO_ROOT, 'tests/view-lab/world/labWorld.js'),
    'utf8'
  );
  const slice = worldSource.slice(worldSource.indexOf('const world = {'));
  return {
    label: 'tests/view-lab/world/labWorld.js `const world`',
    keys: objectLiteralKeys(slice),
  };
}

test('every world field the Foundry shim reads is supplied by the world it is given', () => {
  const world = minimalWorldKeys();
  const reads = [
    ...new Set([...SHIM_SOURCE.matchAll(/\bworld\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1])),
  ];
  assert.ok(
    reads.length > 3,
    `the shim scan found ${reads.length} \`world.\` reads, so the scanner is broken and this ` +
      'property has almost no domain'
  );
  assert.ok(
    world.keys.length > 3,
    `${world.label} yielded ${world.keys.length} keys, so the literal reader is broken and every ` +
      'read below would be reported as unsupplied'
  );
  for (const field of reads.sort(byCodePoint)) {
    assert.ok(
      world.keys.includes(field),
      `${SHIM_PATH} reads \`world.${field}\` and ${world.label} declares no such key. Its keys ` +
        `are: ${world.keys.join(', ')}. An absent one fails LATE — \`settings\`, \`documents\` ` +
        'and `worldTime` are all read inside closures, so the boot succeeds and the failure ' +
        'arrives at whichever specimen happens to touch it first.'
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The library's sections, which is what the lab groups its rail by
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('every manifest library name resolves to a library section', () => {
  const sectionOf = new Map();
  for (const [index, heading] of LIBRARY.headings.entries()) {
    for (const name of primitiveNamesIn(heading))
      sectionOf.set(name, LIBRARY.headingSections[index]);
  }
  const named = MANIFEST_ROWS.filter((row) => row.library !== null);
  assert.ok(named.length > 20, `${named.length} rows name a library entry, so this has no domain`);
  for (const row of named) {
    const name = row.library.slice(1, -1);
    assert.ok(
      sectionOf.get(name),
      `${row.path} records library entry ${row.library}, which resolves to no \`section[id]\`. ` +
        '`model.js` groups a row by its entry\'s section and falls back to "Shipped, ' +
        'undocumented" — so a documented primitive would be filed under the group whose whole ' +
        'meaning is that the library does not name it.'
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The `$props()` reader, proved against a fixture rather than against the corpus
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A destructure carrying each of the three hazards that broke the old reader, and one that would
 * break a naive repair.
 *
 * Each is a DIFFERENT wrong answer, deliberately, so no single mistake produces the right list by
 * coincidence:
 *
 *   - The JSDoc block above `documented` was left in the body by the old reader and reported as
 *     part of that prop's name.
 *   - `label`'s default carries a template literal whose closing backtick the old depth walk read
 *     as an OPENER, so every prop after it was swallowed.
 *   - `separated`'s default holds a comma inside a string, which a splitter that ignores quotes
 *     reads as the end of the entry.
 *   - `slashes`'s default holds `//` inside a string, which the old strip-line-comments-first pass
 *     would have eaten along with the rest of the line — the one hazard the two-pass form could
 *     never have got right, because neither pass knew what the other was looking at.
 */
const PARSER_FIXTURE = [
  '<script>',
  '  let {',
  '    binding = "relative",',
  '    /** The previewed record. Only `relative` reads it, to convert absolute, offset. */',
  '    documented = 0,',
  '    label = (a, b) => `${a?.name || ""} / ${b?.name || ""}`,',
  '    separated = "one, two, three",',
  '    slashes = "https://example.test/a",',
  '    // a line comment naming scope, actions and systemId',
  '    onChange = () => {},',
  '    ...rest',
  '  } = $props();',
  '</script>',
].join('\n');

test('the $props() reader survives comments, template literals and commas in strings', () => {
  // `localeCompare` puts `...rest` first, which is the reader's own documented ordering rather
  // than an accident: the names come back sorted so a caller can compare a set without sorting.
  assert.deepEqual(declaredPropNames(PARSER_FIXTURE), [
    '...rest',
    'binding',
    'documented',
    'label',
    'onChange',
    'separated',
    'slashes',
  ]);
});

test('the $props() reader reports a name for every prop of the components that broke it', () => {
  // The five components the old reader mis-parsed, by name, with the count each one declares.
  // Counted rather than listed: the point is that the reader answers with FIFTEEN names for a
  // fifteen-prop destructure, not which fifteen.
  const measured = [
    ['src/ui/svelte/components/ThresholdBandStrip.svelte', 15],
    ['src/ui/svelte/apps/manager/checks/CheckOddsPanel.svelte', 1],
    ['src/ui/svelte/apps/manager/checks/CheckOutcomePreview.svelte', 2],
    ['src/ui/svelte/apps/manager/environment/CharacterModifierBoundsRow.svelte', 3],
    ['src/ui/svelte/apps/manager/environment/GatheringRuleLimitStepper.svelte', 3],
  ];
  for (const [componentPath, count] of measured) {
    const declared = declaredPropNames(readFileSync(path.join(REPO_ROOT, componentPath), 'utf8'));
    assert.equal(declared.length, count, `${componentPath} prop count`);
    for (const name of declared) assert.ok(PROP_NAME.test(name), `${componentPath}: ${name}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The smoke's derivations, which no browser is needed to check
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build a throwaway repository root holding a catalogue, and run something against it.
 *
 * A FIXTURE ROOT rather than the real one, because these functions have to be checkable when the
 * real catalogue is empty, when it is full, and when it holds something it should not — three
 * states the repository can only be in one of at a time.
 *
 * @param {Record<string, string>} files File name to contents, under the catalogue directory.
 * @param {(root: string) => void} run The body.
 */
function withCatalogueFixture(files, run) {
  const root = mkdtempSync(path.join(tmpdir(), 'fabricate-primitive-lab-'));
  try {
    const directory = path.join(root, CATALOGUE_DIRECTORY);
    mkdirSync(directory, { recursive: true });
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(path.join(directory, name), contents, 'utf8');
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the catalogue reader reads every JSON file and nothing else', () => {
  withCatalogueFixture(
    {
      'controls.json': JSON.stringify([{ path: 'a.svelte' }, { path: 'b.svelte' }]),
      'marks.json': JSON.stringify([{ path: 'c.svelte' }]),
      [CATALOGUE_README]: '# not a catalogue file',
    },
    (root) => {
      assert.deepEqual(catalogueFiles(root), ['controls.json', 'marks.json']);
      assert.equal(expectedSpecimenCount(root), 3);
      assert.deepEqual(cataloguePaths(root), ['a.svelte', 'b.svelte', 'c.svelte']);
      assert.deepEqual(
        catalogueEntries(root).map((entry) => `${entry.file}[${entry.index}]`),
        ['controls.json[0]', 'controls.json[1]', 'marks.json[0]'],
        'every row must carry where it came from, or a failure names a component instead of a place'
      );
    }
  );
});

test('the catalogue reader refuses a file that is not an array of rows', () => {
  withCatalogueFixture({ 'controls.json': JSON.stringify({ path: 'a.svelte' }) }, (root) => {
    assert.throws(
      () => catalogueEntries(root),
      /is not an array of catalogue rows/,
      'a single row written without its enclosing array would otherwise flatten to nothing and ' +
        'read as an empty file'
    );
  });
});

test('an empty catalogue is refused rather than run', () => {
  withCatalogueFixture({}, (root) => {
    assert.equal(expectedSpecimenCount(root), 0);
    assert.match(
      emptyCatalogueMessage(root),
      /would make it pass over a page that mounted nothing/
    );
  });
});

test('the mounted-set comparison catches a count and an identity disagreement', () => {
  const expected = ['a.svelte', 'b.svelte'];
  assert.equal(
    describeMountFailure({ expected, mounted: [...expected], reported: 2 }),
    null,
    'an agreeing page must produce no failure'
  );
  assert.match(
    describeMountFailure({ expected, mounted: ['a.svelte'], reported: 1 }),
    /never mounted: b\.svelte/,
    'a smaller mounted set must be reported as the rows that are missing'
  );
  assert.match(
    describeMountFailure({ expected, mounted: ['a.svelte', 'z.svelte'], reported: 2 }),
    /mounted but not catalogued: z\.svelte/,
    'THE INTERESTING FAILURE: the count agrees and the identity does not. A smoke that compared ' +
      'only the number would call this page correct.'
  );
  assert.match(
    describeMountFailure({ expected, mounted: [...expected], reported: 0 }),
    /the page reported 0 mounted/,
    'a page that carries the specimen roots and reports zero has a broken counter, which is the ' +
      'attribute the whole smoke is decided on'
  );
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The attribute contract, which is the whole interface between the page and the smoke
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The half of the contract the smoke owns. Its attribute names are what the run is decided on. */
const SMOKE_PATH = 'scripts/lib/primitiveLabSmoke.js';

/**
 * The half the PAGE owns: the two files that write the attributes, read as text.
 *
 * Read rather than imported, and that is not a preference. `mount.js` boots the lab on import and
 * `Plinth.svelte` needs compiling, so neither can be loaded here — which is exactly the condition
 * under which a hand-maintained mirror of strings goes unchecked. The bytes are the same bytes
 * Vite serves, so reading them is not a second record of the contract.
 */
const PAGE_SOURCES = new Map(
  ['tests/view-lab/primitives/mount.js', 'tests/view-lab/primitives/Plinth.svelte'].map((file) => [
    file,
    readFileSync(path.join(REPO_ROOT, file), 'utf8'),
  ])
);

/**
 * The page files that WRITE an attribute, as opposed to the ones that merely mention it.
 *
 * THE DISTINCTION IS MEASURED, not fastidious. The first draft of this rule asked whether the
 * source `includes` the name at all — and renaming `READY_ATTRIBUTE` in `mount.js` left it passing,
 * because both files document these attributes in prose and the docblock still spelled the old
 * name. A rule that a stale comment can satisfy is a rule that reports the rename it exists to
 * catch as agreement.
 *
 * So only the two forms that actually set an attribute count: a quoted string literal, which is how
 * `mount.js` names the three it puts on `<body>`, and `name={…}`, which is how `Plinth.svelte`
 * writes the specimen path onto the plinth. Prose says `` `name` `` or `name=""`, and neither of
 * those is either of these.
 *
 * @param {string} attribute An attribute name.
 * @returns {string[]} The page files that set it.
 */
function writersOf(attribute) {
  return [...PAGE_SOURCES]
    .filter(([, source]) => source.includes(`'${attribute}'`) || source.includes(`${attribute}={`))
    .map(([file]) => file);
}

test('every attribute the smoke decides on is written by the page', () => {
  // WITHOUT THIS RULE nothing under `tests/` names these attributes at all, and the only thing
  // that compares the two halves is `npm run lab:check` — which is not a CI gate. A rename of
  // either side then reads as a lab that never becomes ready: the smoke waits for an attribute
  // nobody sets, times out, and reports it as a page that failed to mount.
  const smokeSource = readFileSync(path.join(REPO_ROOT, SMOKE_PATH), 'utf8');
  const declared = [
    ...new Set([...smokeSource.matchAll(/'(data-primitive-lab-[a-z-]+)'/g)].map((m) => m[1])),
  ].sort(byCodePoint);
  // The scan is DERIVED rather than typed, so a fifth attribute is covered the day it is added —
  // but a derived scan that matches nothing passes the loop below perfectly, so it is anchored
  // against the four names this file imports by name and would fail to link without.
  assert.deepEqual(
    missingFrom(declared, [
      ERROR_ATTRIBUTE,
      MOUNTED_ATTRIBUTE,
      READY_ATTRIBUTE,
      SPECIMEN_ATTRIBUTE,
    ]),
    [],
    `the scan over ${SMOKE_PATH} found ${declared.length} attribute literal(s) and missed one the ` +
      'module exports, so the scanner is broken and the rule below has almost no domain'
  );

  for (const attribute of declared) {
    assert.ok(
      writersOf(attribute).length > 0,
      `${SMOKE_PATH} decides the run on \`${attribute}\` and neither ` +
        `${[...PAGE_SOURCES.keys()].join(' nor ')} SETS it. The smoke polls for it, the page ` +
        'never writes it, and the timeout is reported as a lab that failed to mount rather than ' +
        'as two halves of one contract that stopped spelling it the same way.'
    );
  }

  // `MOUNT_ALL_QUERY` is the one part of the contract that is not an attribute: the smoke
  // NAVIGATES with it, and `requireSupportedMountMode` REFUSES any value it does not know. So a
  // rename on either side does not degrade — it throws on boot, before a single specimen mounts.
  const [parameter, value, ...extra] = MOUNT_ALL_QUERY.split('=');
  assert.deepEqual(extra, [], `${MOUNT_ALL_QUERY} is not one \`parameter=value\` pair`);
  const mountSource = PAGE_SOURCES.get('tests/view-lab/primitives/mount.js');
  for (const half of [parameter, value]) {
    assert.ok(
      mountSource.includes(`'${half}'`),
      `the smoke navigates with \`?${MOUNT_ALL_QUERY}\` and \`mount.js\` declares no ` +
        `\`'${half}'\`. Its mount-mode check refuses every value but the one it names, so the ` +
        'page throws on boot and the whole run fails as a page error.'
    );
  }
});
