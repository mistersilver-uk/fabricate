/**
 * Issue 1778 — the player's selectable list items render through `<ListRow>`. A template scan:
 * which files adopt the row, what their `openProps` may carry, and the census of player controls
 * still drawn as a `role="button"` or carrying their own `aria-pressed`, each pinned so a
 * conversion moves it on purpose and a regression reds it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parse } from 'svelte/compiler';

import { attributeNamed, parsedTemplates, walkElements } from './helpers/svelteTemplateScan.js';

/** The sites converted so far; issue 1778's later pull requests each append theirs (nine in all). */
const ADOPTERS = Object.freeze(['src/ui/svelte/apps/journal/RunCard.svelte']);

/** What the row's control writes itself; an `openProps` key naming one would be dropped. */
const FORBIDDEN_KEYS = Object.freeze([
  'type',
  'role',
  'tabindex',
  'aria-pressed',
  'disabled',
  'data-keyboard-focus',
  'onclick',
]);

/** Player templates with an element carrying `role="button"`, after this change (not prose). */
const ROLE_BUTTON_SITES = Object.freeze([
  'src/ui/svelte/apps/alchemy/Workbench.svelte',
  'src/ui/svelte/apps/crafting/RecipeListRow.svelte',
  'src/ui/svelte/apps/gathering/GatheringEventRow.svelte',
  'src/ui/svelte/apps/gathering/GatheringTaskRow.svelte',
  'src/ui/svelte/components/LogList.svelte',
]);

/** Player app templates writing an `aria-pressed`, or handing one to a primitive, after this change. */
const OWN_PRESSED_SITES = Object.freeze([
  'src/ui/svelte/apps/InteractableConfigRoot.svelte',
  'src/ui/svelte/apps/crafting/RecipeBrowser.svelte',
  'src/ui/svelte/apps/crafting/RecipeListRow.svelte',
  'src/ui/svelte/apps/crafting/detail/IngredientSetSelector.svelte',
  'src/ui/svelte/apps/gathering/EnvironmentCard.svelte',
  'src/ui/svelte/apps/inventory/InventoryItemCard.svelte',
]);

const MANAGER = 'src/ui/svelte/apps/manager/';
const TEMPLATES = parsedTemplates();
const PLAYER = TEMPLATES.filter(({ file }) => !file.startsWith(MANAGER));

const synthetic = (file, source) => ({ file, source, ast: parse(source, { modern: true }) });

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

const isRoleButton = (element) => {
  const role = attributeNamed(element, 'role');
  return Array.isArray(role?.value) && role.value.some((part) => part.data === 'button');
};
const ownsPressed = (element) => Boolean(attributeNamed(element, 'aria-pressed'));

/** Every `<ListRow openProps={…}>` in `corpus`, as `{ file, keys }`; `keys` is null off a literal. */
function openPropsSites(corpus) {
  const sites = [];
  for (const { file, ast } of corpus) {
    walkElements(ast.fragment, (element) => {
      if (element.type !== 'Component' || element.name !== 'ListRow') return;
      const expression = attributeNamed(element, 'openProps')?.value?.expression;
      if (!expression) return;
      const keys =
        expression.type === 'ObjectExpression'
          ? expression.properties.map((property) => property.key?.value ?? property.key?.name)
          : null;
      sites.push({ file, keys });
    });
  }
  return sites;
}

describe('ListRow adoption (issue 1778)', () => {
  it('is imported and rendered as the selectable form by every converted site', () => {
    for (const file of ADOPTERS) {
      const template = TEMPLATES.find((entry) => entry.file === file);
      assert.ok(template, `${file} is not a template`);
      assert.match(template.source, /import ListRow from '[^']*\/components\/ListRow\.svelte';/u);
      assert.ok(
        openPropsSites([template]).length > 0,
        `${file} renders no ListRow with openProps, so its row is not the selectable form`
      );
    }
  });

  it('passes openProps as a literal, carrying none of the keys the control owns', () => {
    const probe = synthetic(
      'src/ui/svelte/Probe.svelte',
      "<ListRow openProps={{ 'aria-pressed': 'true', class: 'x' }} /><ListRow openProps={bag} />"
    );
    assert.deepEqual(
      openPropsSites([probe]).map(({ keys }) => keys),
      [['aria-pressed', 'class'], null],
      'the scan reads a literal’s keys and recognises a non-literal'
    );
    const sites = openPropsSites(TEMPLATES);
    assert.ok(sites.length >= ADOPTERS.length, 'every adopter is reached');
    assert.deepEqual(
      sites.filter(({ keys }) => keys === null).map(({ file }) => file),
      [],
      'an openProps the scan cannot read is a forbidden key it cannot see'
    );
    const forbidden = sites.flatMap(({ file, keys }) =>
      keys.filter((key) => FORBIDDEN_KEYS.includes(key)).map((key) => `${file}: ${key}`)
    );
    assert.deepEqual(forbidden, [], 'ListRow writes these itself, so the caller’s are dropped');
  });

  it('pins the player role="button" census', () => {
    const probe = synthetic('src/ui/svelte/Probe.svelte', '<div role="button" tabindex="0"></div>');
    assert.deepEqual(filesWith([probe], isRoleButton), [probe.file], 'the scan sees one');
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
