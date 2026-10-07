/**
 * Issue 1778 — the player's selectable list items render through `<ListRow>`. A template scan:
 * which files adopt the row, what their `openProps` may carry, and the census of player controls
 * still drawn as a `role="button"` or carrying their own `aria-pressed`, each pinned so a
 * conversion moves it on purpose and a regression reds it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parse } from 'svelte/compiler';

import { LIST_ROW_ADOPTERS } from './helpers/listRowContract.js';
import { attributeNamed, parsedTemplates, walkElements } from './helpers/svelteTemplateScan.js';

const LIST_ROW = 'src/ui/svelte/components/ListRow.svelte';

/** Player templates with an element carrying `role="button"`, after this change (not prose). */
const ROLE_BUTTON_SITES = Object.freeze([
  'src/ui/svelte/apps/alchemy/Workbench.svelte',
  'src/ui/svelte/components/LogList.svelte',
]);

/** Player app templates writing an `aria-pressed`, or handing one to a primitive, after this change. */
const OWN_PRESSED_SITES = Object.freeze([
  'src/ui/svelte/apps/InteractableConfigRoot.svelte',
  'src/ui/svelte/apps/crafting/RecipeBrowser.svelte',
  'src/ui/svelte/apps/crafting/RecipeListRow.svelte',
]);

const MANAGER = 'src/ui/svelte/apps/manager/';
const TEMPLATES = parsedTemplates();
const PLAYER = TEMPLATES.filter(({ file }) => !file.startsWith(MANAGER));

const synthetic = (file, source) => ({ file, source, ast: parse(source, { modern: true }) });

/** The keys ListRow drops from `openProps`, read from its own script, less the two it merges. */
function droppedKeys() {
  const { ast } = TEMPLATES.find(({ file }) => file === LIST_ROW);
  const owned = ast.instance.content.body
    .flatMap((node) => (node.type === 'VariableDeclaration' ? node.declarations : []))
    .find((node) => node.id.name === 'OWNED_KEYS');
  return owned.init.arguments[0].elements
    .map((element) => element.value)
    .filter((key) => !['class', 'aria-describedby'].includes(key));
}

const FORBIDDEN_KEYS = droppedKeys();
const isForbidden = (key) => FORBIDDEN_KEYS.includes(key) || /^onclick/i.test(key);

/** Each file in `corpus` holding an element that matches `test`, once, in corpus order. */
function filesWith(corpus, test) {
  return corpus
    .filter(({ ast }) => {
      let found = false;
      walkElements(ast.fragment, (element) => {
        found ||= test(element);
      });
      return found;
    })
    .map(({ file }) => file);
}

/** `role="button"`, written as text or as a string literal in braces. */
const isRoleButton = (element) =>
  [attributeNamed(element, 'role')?.value ?? []]
    .flat()
    .some((part) =>
      part.type === 'Text'
        ? part.data === 'button'
        : part.expression?.type === 'Literal' && part.expression.value === 'button'
    );
const ownsPressed = (element) => Boolean(attributeNamed(element, 'aria-pressed'));

/** Whether the template's script imports `ListRow.svelte` as `ListRow`. */
const importsListRow = ({ ast }) =>
  (ast.instance?.content.body ?? []).some(
    (node) =>
      node.type === 'ImportDeclaration' &&
      /(?:^|\/)ListRow\.svelte$/u.test(node.source.value) &&
      node.specifiers.some(
        (specifier) =>
          specifier.type === 'ImportDefaultSpecifier' && specifier.local.name === 'ListRow'
      )
  );

/** A literal's keys, or null when a spread or a computed key hides one. */
function literalKeys(expression) {
  if (expression.type !== 'ObjectExpression') return null;
  const keys = expression.properties.map((property) =>
    property.type === 'Property' && !property.computed
      ? (property.key.value ?? property.key.name)
      : null
  );
  return keys.includes(null) ? null : keys;
}

/** Every `<ListRow openProps={…}>` in `corpus`, as `{ file, keys }`; `keys` is null when unread. */
function openPropsSites(corpus) {
  const sites = [];
  for (const { file, ast } of corpus) {
    walkElements(ast.fragment, (element) => {
      if (element.type !== 'Component' || element.name !== 'ListRow') return;
      const expression = attributeNamed(element, 'openProps')?.value?.expression;
      if (expression) sites.push({ file, keys: literalKeys(expression) });
    });
  }
  return sites;
}

describe('ListRow adoption (issue 1778)', () => {
  it('is imported and rendered as the selectable form by every converted site', () => {
    const imported = synthetic(
      'src/ui/svelte/Probe.svelte',
      "<script>import ListRow from '../components/ListRow.svelte';</script><ListRow />"
    );
    const mentioned = synthetic(
      'src/ui/svelte/Probe.svelte',
      "<script>// import ListRow from '../components/ListRow.svelte';\n</script><ListRow />"
    );
    assert.deepEqual([importsListRow(imported), importsListRow(mentioned)], [true, false]);
    for (const { file } of LIST_ROW_ADOPTERS) {
      const template = TEMPLATES.find((entry) => entry.file === file);
      assert.ok(template, `${file} is not a template`);
      assert.ok(importsListRow(template), `${file} does not import ListRow`);
      assert.ok(
        openPropsSites([template]).length > 0,
        `${file} renders no ListRow with openProps, so its row is not the selectable form`
      );
    }
  });

  it('passes openProps as a literal, carrying none of the keys the control owns', () => {
    assert.ok(FORBIDDEN_KEYS.includes('aria-pressed'), "the keys are read from ListRow's script");
    assert.ok(!FORBIDDEN_KEYS.includes('class'), 'less the ones it merges');
    const probe = synthetic(
      'src/ui/svelte/Probe.svelte',
      "<ListRow openProps={{ 'aria-pressed': 'true', class: 'x' }} /><ListRow openProps={bag} />" +
        "<ListRow openProps={{ ...bag, class: 'x' }} /><ListRow openProps={{ [key]: 'x' }} />"
    );
    assert.deepEqual(
      openPropsSites([probe]).map(({ keys }) => keys),
      [['aria-pressed', 'class'], null, null, null],
      'the scan reads a literal’s keys, and treats a non-literal, a spread or a computed key as unread'
    );
    assert.ok(isForbidden('onclickcapture'), 'every click handler is the row’s');
    const sites = openPropsSites(TEMPLATES);
    assert.ok(sites.length >= LIST_ROW_ADOPTERS.length, 'every adopter is reached');
    assert.deepEqual(
      sites.filter(({ keys }) => keys === null).map(({ file }) => file),
      [],
      'an openProps the scan cannot read is a forbidden key it cannot see'
    );
    const forbidden = sites.flatMap(({ file, keys }) =>
      keys.filter(isForbidden).map((key) => `${file}: ${key}`)
    );
    assert.deepEqual(forbidden, [], 'ListRow writes these itself, so the caller’s are dropped');
  });

  it('pins the player role="button" census', () => {
    const probe = synthetic('src/ui/svelte/Probe.svelte', '<div role="button" tabindex="0"></div>');
    const braced = synthetic('src/ui/svelte/Braced.svelte', "<div role={'button'}></div>");
    assert.deepEqual(
      filesWith([probe, braced], isRoleButton),
      [probe.file, braced.file],
      'the scan sees one, quoted or braced'
    );
    assert.deepEqual(
      filesWith(PLAYER, isRoleButton),
      ROLE_BUTTON_SITES,
      'a player control drawn as a div wearing role="button" appeared or left; a selectable row ' +
        'renders through ListRow, whose control is a native button'
    );
  });

  it('pins the player apps writing their own aria-pressed', () => {
    const probe = synthetic(
      'src/ui/svelte/apps/Probe.svelte',
      '<button aria-pressed="true"></button>'
    );
    assert.deepEqual(filesWith([probe], ownsPressed), [probe.file], 'the scan sees one');
    const apps = PLAYER.filter(({ file }) => file.startsWith('src/ui/svelte/apps/'));
    assert.deepEqual(
      filesWith(apps, ownsPressed),
      OWN_PRESSED_SITES,
      'a player app wrote or dropped its own pressed state; a selectable row takes it from ListRow'
    );
  });
});
