/**
 * The link field's HOOK BAG, pinned in source (issue 1509).
 *
 * ── WHAT THIS FILE REPLACED, AND WHY IT NEEDED A GATE AT ALL ────────────────────────────
 * `ItemDropZone` carried THIRTEEN `kind === '…' ? … : undefined` attribute branches — seven on its
 * root, one on its hint line, two on the copy action and three on the unlink action. Every one of
 * them was a caller's DOM contract written inside the shared primitive, which is the shape
 * `essence-studio-fidelity.test.js` bans by name: a primitive that grows a branch per caller is a
 * union of its callers. Issue 1509 replaced all thirteen with ONE `hookAttrs` bag, in the shape
 * `EditorValidationSurface` already ships, keyed by a CLOSED region set.
 *
 * ── AND WHY A BAG NEEDS A GATE THAT A BRANCH DID NOT ────────────────────────────────────
 * A `kind ===` branch is wrong LOUDLY: mistype the kind and the attribute is simply absent, and
 * the primitive's own source is the one place a reader looks. A bag keyed by NAME is SILENT about
 * a name it does not recognise. `hookAttrs={{ rooot: { 'data-x': true } }}` spreads nothing,
 * renders identically to a site that passed no bag at all, and takes that site's whole DOM
 * contract with it — issue 1116's defect class exactly, unreachable configuration that looks
 * identical to working configuration. Three of these thirteen attributes are selected on by
 * mounted suites, one by a View Lab case and ONE BY THE STYLESHEET, so a silent miss is a test
 * that stops testing or a prompt that visibly narrows.
 *
 * The region names are read out of the PRIMITIVE's own `hooksFor('…')` call sites rather than
 * re-typed here, so widening the surface widens the gate and a call site cannot be greened by
 * editing this file. That is `editor-validation-surface-source-contract.test.js`'s discipline,
 * applied to the second bag in the repository.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'svelte/compiler';

import { SOURCES, walkTemplate } from '../helpers/primitiveAdoptionContract.js';

/** The primitive whose bag this file pins. */
const ZONE_PATH = 'src/ui/svelte/apps/manager/ItemDropZone.svelte';

const TAG = 'ItemDropZone';

/**
 * The region names the primitive actually spreads, read out of its own `hooksFor('…')` calls.
 *
 * @returns {string[]} The declared regions, de-duplicated, in source order.
 */
function declaredRegions() {
  const source = SOURCES[ZONE_PATH];
  assert.ok(source, `${ZONE_PATH} is no longer in the component corpus this gate reads`);
  const found = [...source.matchAll(/hooksFor\('([a-zA-Z]+)'\)/g)].map((match) => match[1]);
  assert.ok(
    found.length > 0,
    `${ZONE_PATH} no longer calls \`hooksFor('…')\`, so the region set cannot be read from it`
  );
  return [...new Set(found)];
}

/**
 * The top-level keys of the object literal a call site passes to `hookAttrs`.
 *
 * Parsed from the AST rather than from the attribute's source text, for the reason the validation
 * surface's own contract records: a brace-counting scan over `hookAttrs={{ root: { 'data-x': true
 * } }}` has to know which `{` opens a nested object and which closes a string, and getting that
 * subtly wrong yields an EMPTY key list, which makes every clause below pass over nothing.
 *
 * A site whose bag is an IDENTIFIER rather than a literal — `hookAttrs={linkHooks}`, which the
 * recipe-item overview passes because its bag is `$derived` on its own link state — is reported
 * separately rather than as zero keys, because "this site names no region" and "this site names
 * its regions somewhere this reader cannot see" are different facts and only the first is a
 * defect.
 *
 * @param {string} file repo-relative component path
 * @returns {{keys: string[]|null, indirect: boolean}} the literal's keys, or an indirect marker
 */
function bagKeys(file) {
  const source = SOURCES[file];
  let keys = null;
  let indirect = false;
  walkTemplate(parse(source, { modern: true, filename: file }).fragment, (node) => {
    if (node.type !== 'Component' || node.name !== TAG) return;
    const attribute = (node.attributes ?? []).find(
      (candidate) => candidate.type === 'Attribute' && candidate.name === 'hookAttrs'
    );
    if (!attribute) return;
    const value = Array.isArray(attribute.value) ? attribute.value[0] : attribute.value;
    const expression = value?.expression;
    if (expression?.type === 'ObjectExpression') {
      keys = [
        ...(keys ?? []),
        ...expression.properties.map(
          (property) => property.key?.name ?? String(property.key?.value ?? '')
        ),
      ];
      return;
    }
    indirect = true;
  });
  return { keys, indirect };
}

/** Every file rendering the tag at all, which is what the corpus floors below are stated over. */
function callSites() {
  return Object.entries(SOURCES)
    .filter(([, source]) => new RegExp(String.raw`<${TAG}[\s/>]`).test(source))
    .map(([file]) => file);
}

test('the hook region set is the closed four, in the order the zone spreads them', () => {
  assert.deepEqual(
    declaredRegions(),
    ['root', 'hint', 'copy', 'unlink'],
    'the region set changed. It is CLOSED on purpose: these are the four places this primitive ' +
      'spreads a caller`s attributes — the drop target itself, the hint line under the name, the ' +
      'copy action and the unlink action — and a fifth means the zone grew a region, which is a ' +
      'deliberate widening rather than something a reviewer should have to notice. The order is ' +
      'the order the template reaches them, so a reader can follow the file.'
  );
});

test('the thirteen `kind ===` attribute branches are gone and none has come back', () => {
  // THE POINT OF THE CONVERSION, stated as a pin rather than left to review. `kind` survives for
  // `data-item-drop-zone={kind || undefined}`, which is a per-site ID and not a branch; what must
  // not come back is a test of its VALUE, because that is one caller's contract written inside a
  // shared primitive and it is what the bag exists to have replaced.
  const source = SOURCES[ZONE_PATH];
  const branches = [...source.matchAll(/kind\s*===\s*'[\w-]+'/g)].map((match) => match[0]);
  assert.deepEqual(
    branches,
    [],
    'this primitive tests the VALUE of `kind` again. Pass the attribute through `hookAttrs` from ' +
      'the caller that wants it instead: a branch here is a union of callers, and it is also how ' +
      'a caller`s hook comes to depend on a string two files away:\n  ' +
      branches.join('\n  ')
  );
  // NON-VACUITY: the prop is still declared and still ids the zone, so the clause above is a
  // statement about branching rather than about a prop that has been deleted.
  assert.ok(
    /data-item-drop-zone=\{kind \|\| undefined\}/.test(source),
    '`kind` no longer ids the zone, so the clause above is holding over a prop that is gone ' +
      'rather than over one that has stopped branching'
  );
});

test('every hook region a call site names is one the zone actually spreads', () => {
  const regions = declaredRegions();
  const offenders = [];
  let sites = 0;
  for (const file of callSites()) {
    const { keys } = bagKeys(file);
    if (keys === null) continue;
    sites += 1;
    for (const key of keys) {
      if (!regions.includes(key)) offenders.push(`${file}: hookAttrs.${key}`);
    }
  }
  // Non-vacuity. A bag prop nothing passes, or an AST walk that stopped resolving the tag, reads
  // as zero sites and greens this clause over an empty domain.
  assert.ok(sites >= 2, `only ${sites} <${TAG}> call sites pass a literal bag, so this is moot`);
  assert.deepEqual(
    offenders.sort((left, right) => left.localeCompare(right)),
    [],
    `a hook region must be one of ${regions.join(', ')}. An unrecognised key spreads NOTHING and ` +
      'renders exactly like a site that passed no hook at all, so the site`s DOM contract ' +
      'disappears with no error anywhere:\n  ' +
      offenders.join('\n  ')
  );
});

test('the tag scan reaches every caller, so the clauses above hold over the real corpus', () => {
  // The corpus floor. Nine files render this zone and one of them renders it twice; a lower
  // number means the scan stopped resolving the tag and every clause above is examining a subset
  // of the callers while reporting on all of them.
  const files = callSites();
  assert.ok(
    files.length >= 9,
    `only ${files.length} files render <${TAG}>, against a floor of 9: ${files.join(', ')}`
  );
  for (const expected of [
    'src/ui/svelte/apps/manager/checks/CheckDcMacroCard.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemOverviewTab.svelte',
    'src/ui/svelte/apps/manager/scoped/WorldToolCataloguePage.svelte',
    'src/ui/svelte/apps/manager/scoped/WorldToolEntryPage.svelte',
  ]) {
    assert.ok(
      files.includes(expected),
      `${expected} no longer renders <${TAG}>, and it is one of the four sites that pass a bag`
    );
  }
});

test('the one site whose bag is DERIVED passes it by identifier, not as a literal', () => {
  // `data-recipe-item-link` and `data-recipe-item-dropzone` were conditioned on the zone's `item`
  // rather than on its `kind`, so the recipe-item overview's bag is `$derived` on its own link
  // state. That is the one thing a static per-site object could not reproduce — it would render
  // both attributes or neither — and it is why this clause exists rather than a pin that every
  // bag is an object literal.
  const overview = 'src/ui/svelte/apps/manager/recipe-item/RecipeItemOverviewTab.svelte';
  const { keys, indirect } = bagKeys(overview);
  assert.ok(
    indirect && keys === null,
    'the recipe-item overview now passes `hookAttrs` as a literal. Its `data-recipe-item-link` ' +
      'and `data-recipe-item-dropzone` are two faces of ONE state, so a literal renders both or ' +
      'neither — see `recipe-item-overview-tab-mounted.test.js`, which mounts both faces.'
  );
  assert.ok(
    /const linkHooks = \$derived\(\{/.test(SOURCES[overview]),
    'and the identifier it passes must still be a `$derived` bag, or the two faces are static'
  );
});

test('the styled hook is still named by the caller that needs it', () => {
  // `[data-tool-create-card]` IS A STYLING HOOK, not a test hook: `styles/fabricate.css` declares
  // `.fabricate-manager [data-tool-create-card] { flex: 0 0 auto; width: 100% }`, so losing it
  // narrows the Tools catalogue's create prompt from the list's full width. It is the one of the
  // thirteen whose disappearance is VISIBLE rather than only unselectable, and it is the reason
  // this bag's values are spread verbatim rather than normalised to booleans.
  const catalogue = 'src/ui/svelte/apps/manager/scoped/WorldToolCataloguePage.svelte';
  const { keys } = bagKeys(catalogue);
  assert.deepEqual(keys, ['root'], 'the Tools catalogue names exactly the root region');
  assert.ok(
    /'data-tool-create-card': true/.test(SOURCES[catalogue]),
    'the Tools catalogue no longer names `data-tool-create-card`, which is a STYLED hook: the ' +
      'create prompt loses its `flex: 0 0 auto` and its full width'
  );

  // AND THE ONE WHOSE VALUE IS A STRING. `data-tool-source-layout` carries `'compact'` rather
  // than `true`, so a bag that coerced its values would change it.
  const entry = 'src/ui/svelte/apps/manager/scoped/WorldToolEntryPage.svelte';
  assert.ok(
    /'data-tool-source-layout': 'compact'/.test(SOURCES[entry]),
    'the world tool entry no longer names `data-tool-source-layout` with the string `compact`. ' +
      'It is a layout id and not a presence flag, and `true` is not the same attribute.'
  );
});
