import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../../styles/fabricate.css');
const colorPickerPath = resolve(__dirname, '../../src/ui/svelte/components/ManagerV2ColorPicker.svelte');
const css = readFileSync(cssPath, 'utf8');
const colorPickerSource = readFileSync(colorPickerPath, 'utf8');

function blockFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\}`));
  return match?.[0] || '';
}

test('manager-v2 root defines a scoped responsive app container', () => {
  const block = blockFor('.fabricate-manager-v2');

  assert.ok(block.includes('container-type: inline-size;'), 'manager-v2 should use container queries');
  assert.ok(block.includes('container-name: fabricate-manager-v2;'), 'manager-v2 should name its container');
  assert.ok(block.includes('isolation: isolate;'), 'manager-v2 should isolate its shell');
  assert.ok(block.includes('height: 100%;'), 'manager-v2 should fill the ApplicationV2 body');
  assert.ok(block.includes('overflow: hidden;'), 'manager-v2 shell should own overflow');
});

test('Fabricate app shells suppress host click focus outlines while preserving keyboard focus', () => {
  const managerFocusBlock = blockFor('.fabricate-manager-v2 button:focus,\n.fabricate-manager-v2 input:focus,\n.fabricate-manager-v2 select:focus,\n.fabricate-manager-v2 textarea:focus,\n.fabricate-manager-v2 [tabindex]:focus');
  const managerFocusVisibleBlock = blockFor('.fabricate-manager-v2 button:focus-visible,\n.fabricate-manager-v2 input:focus-visible,\n.fabricate-manager-v2 select:focus-visible,\n.fabricate-manager-v2 [tabindex]:focus-visible');
  const adminFocusBlock = blockFor('.fabricate-admin button:focus,\n.fabricate-admin input:focus,\n.fabricate-admin select:focus,\n.fabricate-admin textarea:focus,\n.fabricate-admin [tabindex]:focus');
  const actorFocusBlock = blockFor('.fabricate-actor-app button:focus,\n.fabricate-actor-app input:focus,\n.fabricate-actor-app select:focus,\n.fabricate-actor-app textarea:focus,\n.fabricate-actor-app [tabindex]:focus');

  assert.ok(managerFocusBlock.includes('outline: none;') && managerFocusBlock.includes('box-shadow: none;'), 'manager-v2 controls should clear host click focus outlines');
  assert.ok(adminFocusBlock.includes('outline: none;') && adminFocusBlock.includes('box-shadow: none;'), 'legacy admin controls should clear host click focus outlines');
  assert.ok(actorFocusBlock.includes('outline: none;') && actorFocusBlock.includes('box-shadow: none;'), 'actor app controls should clear host click focus outlines');
  assert.ok(
    css.includes('.fabricate.crafting-app button:focus:not(:focus-visible),\n.fabricate.crafting-app input:focus:not(:focus-visible),\n.fabricate.crafting-app select:focus:not(:focus-visible),\n.fabricate.crafting-app textarea:focus:not(:focus-visible),\n.fabricate.crafting-app [tabindex]:focus:not(:focus-visible) {\n  outline: none;\n  box-shadow: none;'),
    'classic crafting app controls should clear host click focus outlines'
  );
  assert.ok(managerFocusVisibleBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'manager-v2 keyboard focus should remain visible');
});

test('manager-v2 character modifier search suggestions keep icons in row flow', () => {
  const searchIconBlock = blockFor('.fabricate-manager-v2 .manager-v2-search > i');
  const characterModifierSuggestionBlock = blockFor('.fabricate-manager-v2 .manager-v2-tag-suggestion.manager-v2-character-modifier-add-suggestion');
  const characterModifierSuggestionIconBlock = blockFor('.fabricate-manager-v2 .manager-v2-character-modifier-add-suggestion > i');

  assert.ok(
    searchIconBlock.includes('position: absolute;') && searchIconBlock.includes('left: 11px;'),
    'search field leading icon should remain positioned inside the input chrome'
  );
  assert.equal(
    css.includes('.fabricate-manager-v2 .manager-v2-search i {\n  position: absolute;'),
    false,
    'search icon positioning must not catch suggestion icons inside search popovers'
  );
  assert.ok(
    characterModifierSuggestionBlock.includes('grid-template-columns: 22px minmax(0, 1fr);')
      && characterModifierSuggestionBlock.includes('min-height: 32px;')
      && characterModifierSuggestionBlock.includes('padding: 5px 7px;'),
    'character modifier suggestions should use the same icon column and row rhythm as availability menu options'
  );
  assert.ok(
    characterModifierSuggestionIconBlock.includes('text-align: center;'),
    'character modifier suggestion icons should be centered inside the fixed icon column'
  );
});

test('manager-v2 character modifier search suggestions render with availability-style icon geometry', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 760, height: 320 }, deviceScaleFactor: 1 });

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            ${css}
            body {
              margin: 0;
              padding: 24px;
              font-family: Arial, sans-serif;
            }
            .harness-grid {
              display: grid;
              grid-template-columns: 320px 320px;
              gap: 32px;
              align-items: start;
            }
            .harness-availability-anchor {
              position: relative;
              width: 260px;
            }
            .fa-solid::before {
              content: "■";
            }
          </style>
        </head>
        <body>
          <main class="fabricate-manager-v2">
            <div class="harness-grid">
              <section>
                <div class="harness-availability-anchor">
                  <button type="button" class="manager-v2-availability-menu-button">
                    <span>Biomes</span>
                    <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                  </button>
                  <div class="manager-v2-availability-menu" role="listbox" aria-label="Biomes">
                    <button type="button" class="manager-v2-availability-option" role="option">
                      <i class="fa-solid fa-tree" aria-hidden="true"></i>
                      <span>Ancient Forest</span>
                    </button>
                    <button type="button" class="manager-v2-availability-option" role="option">
                      <i class="fa-solid fa-mountain" aria-hidden="true"></i>
                      <span>High Mountain</span>
                    </button>
                  </div>
                </div>
              </section>

              <section>
                <label class="manager-v2-search is-compact manager-v2-character-modifier-add-search">
                  <i class="fa-solid fa-search" aria-hidden="true"></i>
                  <input type="search" value="wis" aria-label="Search character modifiers">
                  <div class="manager-v2-tag-suggestions manager-v2-character-modifier-add-suggestions" role="listbox" aria-label="Character modifiers">
                    <button type="button" class="manager-v2-tag-suggestion manager-v2-character-modifier-add-suggestion" role="option">
                      <i class="fa-solid fa-user" aria-hidden="true"></i>
                      <span>Wisdom modifier</span>
                    </button>
                    <button type="button" class="manager-v2-tag-suggestion manager-v2-character-modifier-add-suggestion" role="option">
                      <i class="fa-solid fa-hand-fist" aria-hidden="true"></i>
                      <span>Strength modifier</span>
                    </button>
                  </div>
                </label>
              </section>
            </div>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const rectFor = element => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
      };
      const rowFor = element => {
        const icon = element.querySelector('i');
        const label = element.querySelector('span');
        const rowStyle = getComputedStyle(element);
        const iconStyle = getComputedStyle(icon);
        return {
          row: rectFor(element),
          icon: rectFor(icon),
          label: rectFor(label),
          rowStyle: {
            display: rowStyle.display,
            gridTemplateColumns: rowStyle.gridTemplateColumns
          },
          iconStyle: {
            position: iconStyle.position,
            textAlign: iconStyle.textAlign,
            transform: iconStyle.transform
          }
        };
      };

      return {
        availabilityRows: Array.from(document.querySelectorAll('.manager-v2-availability-option')).map(rowFor),
        characterRows: Array.from(document.querySelectorAll('.manager-v2-character-modifier-add-suggestion')).map(rowFor)
      };
    });

    const availabilityFirst = report.availabilityRows[0];
    const characterFirst = report.characterRows[0];
    const availabilityInset = availabilityFirst.icon.left - availabilityFirst.row.left;
    const characterInset = characterFirst.icon.left - characterFirst.row.left;
    const availabilityGap = availabilityFirst.label.left - availabilityFirst.icon.right;
    const characterGap = characterFirst.label.left - characterFirst.icon.right;

    assert.equal(characterFirst.iconStyle.position, 'static', 'character suggestion icons should remain in normal row flow');
    assert.equal(characterFirst.iconStyle.textAlign, 'center', 'character suggestion icons should be centered in their icon column');
    assert.equal(characterFirst.rowStyle.gridTemplateColumns.startsWith('22px '), true, 'character suggestion rows should reserve the availability icon column');
    assert.ok(characterFirst.icon.right <= characterFirst.label.left, 'character suggestion icons should sit before labels');
    assert.ok(
      report.characterRows[0].icon.bottom <= report.characterRows[1].icon.top || report.characterRows[1].icon.bottom <= report.characterRows[0].icon.top,
      'character suggestion icons from different rows should not overlap'
    );
    assert.ok(Math.abs(availabilityInset - characterInset) <= 3, 'character suggestion icon inset should match availability rows');
    assert.ok(Math.abs(availabilityGap - characterGap) <= 3, 'character suggestion icon gap should match availability rows');
  } finally {
    await page.close();
    await browser.close();
  }
});

test('manager-v2 body starts as a three-region grid and stacks at narrow width', () => {
  const bodyBlock = blockFor('.fabricate-manager-v2 .manager-v2-body');

  assert.ok(
    bodyBlock.includes('grid-template-columns: 220px minmax(0, 1fr) 300px;'),
    'normal manager-v2 layout should have rail, main region, and inspector'
  );
  assert.ok(
    css.includes('@container fabricate-manager-v2 (max-width: 1120px)'),
    'manager-v2 should stack before the center table becomes unreadable'
  );
  assert.ok(
    css.includes('@container fabricate-manager-v2 (max-width: 680px)'),
    'manager-v2 should define a narrow container query'
  );
  assert.ok(
    css.includes('grid-template-columns: 1fr;'),
    'narrow manager-v2 layout should stack to one column'
  );
  assert.ok(
    css.includes('grid-template-columns: minmax(0, 1.55fr) minmax(92px, 0.42fr) 72px 118px;'),
    'normal systems table should use compact System, Resolution, Status, and Actions columns'
  );
  assert.ok(
    css.includes('min-width: 0;'),
    'manager-v2 table rows should avoid forcing default-width horizontal overflow'
  );
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-table-head') && mediumQuery.includes('display: none;'),
    'medium manager-v2 layout should switch rows to stacked cards before row actions become hidden'
  );
});

test('manager-v2 systems text and action cells are constrained at normal widths', () => {
  const nameBlock = blockFor('.fabricate-manager-v2 .manager-v2-system-name');
  const descriptionBlock = blockFor('.fabricate-manager-v2 .manager-v2-system-description');

  assert.ok(nameBlock.includes('-webkit-line-clamp: 2;'), 'row names should clamp instead of overflowing rows');
  assert.ok(descriptionBlock.includes('-webkit-line-clamp: 1;'), 'row descriptions should stay on one line inside compact rows');
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-inspector-name {\n  display: -webkit-box;')
      && css.includes('-webkit-line-clamp: 3;'),
    'inspector names should stay readable without dominating the inspector'
  );
  assert.ok(!css.includes('.fabricate-manager-v2 .manager-v2-count-cluster'), 'system row counts should not duplicate the inspector counts');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-system-row .manager-v2-action-group'), 'system row actions should have stable width rules');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-system-row:focus-visible'), 'system rows should own the accessible focus state');
  assert.ok(css.includes('overflow-wrap: break-word;'), 'text should avoid single-letter wrapping unless needed for long strings');
});

test('manager-v2 systems status cells use stable interactive on-off toggles', () => {
  const toggleBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle');
  const onBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle.is-on');
  const offBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle.is-off');
  const trackBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle-track');
  const knobBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle-knob');
  const onKnobBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle.is-on .manager-v2-status-toggle-knob');
  const focusBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle:focus');
  const focusVisibleBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle:focus-visible');

  assert.ok(toggleBlock.includes('appearance: none;'), 'system status toggles should normalize host button styles');
  assert.ok(toggleBlock.includes('width: auto;'), 'system status toggles should size to their On/Off label instead of filling the status column');
  assert.ok(toggleBlock.includes('max-width: 64px;'), 'system status toggles should keep compact geometry');
  assert.ok(toggleBlock.includes('border-radius: 999px;'), 'system status toggles should read as toggle buttons');
  assert.ok(focusBlock.includes('outline: none;') && focusBlock.includes('box-shadow: none;'), 'mouse focus should not inherit the host orange focus ring');
  assert.ok(focusVisibleBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'keyboard focus should keep a manager-v2 focus-visible ring');
  assert.ok(onBlock.includes('var(--fab-success'), 'enabled status should use the manager-v2 success accent family');
  assert.ok(offBlock.includes('var(--fab-warning'), 'disabled status should use a distinct muted warning/off color');
  assert.ok(trackBlock.includes('width: 24px;'), 'toggle track should reserve only enough space for the compact state control');
  assert.ok(knobBlock.includes('transition: transform'), 'toggle knob should expose a clear state change');
  assert.ok(onKnobBlock.includes('transform: translateX(10px);'), 'enabled status should move the toggle knob on');
});

test('manager-v2 selected system scope is static text with a return-to-library control', () => {
  const scopeBlock = blockFor('.fabricate-manager-v2 .manager-v2-scope-card');
  const scopeTitleBlock = blockFor('.fabricate-manager-v2 .manager-v2-scope-name');
  const returnBlock = blockFor('.fabricate-manager-v2 .manager-v2-scope-return');
  const returnFocusBlock = blockFor('.fabricate-manager-v2 .manager-v2-scope-return:hover,\n.fabricate-manager-v2 .manager-v2-scope-return:focus-visible');
  const focusBlock = blockFor('.fabricate-manager-v2 button:focus-visible,\n.fabricate-manager-v2 input:focus-visible,\n.fabricate-manager-v2 select:focus-visible,\n.fabricate-manager-v2 [tabindex]:focus-visible');

  assert.ok(scopeBlock.includes('display: grid;'), 'selected system scope should reserve space for the return icon');
  assert.ok(scopeBlock.includes('grid-template-columns: minmax(0, 1fr) 28px;'), 'scope card should keep name and return icon aligned');
  assert.ok(scopeBlock.includes('height: 64px;'), 'scope card should keep a stable fixed height');
  assert.ok(scopeBlock.includes('white-space: normal;'), 'scope card should not inherit host nowrap rules');
  assert.ok(scopeBlock.includes('overflow: hidden;'), 'scope card should prevent long names from affecting nav layout');
  assert.ok(scopeBlock.includes('border: 1px solid var(--fab-mv2-border);'), 'scope card should render as a visible rail card');
  assert.ok(scopeTitleBlock.includes('min-width: 0;'), 'scope title should be allowed to shrink inside the grid');
  assert.ok(scopeTitleBlock.includes('max-width: 100%;'), 'scope title should not overflow the scope card');
  assert.ok(scopeTitleBlock.includes('max-height: 2.36em;'), 'scope title should have a hard two-line height cap');
  assert.ok(scopeTitleBlock.includes('font-size: 1.05rem;'), 'scope title should be prominent in the rail card');
  assert.ok(scopeTitleBlock.includes('-webkit-line-clamp: 2;'), 'scope title should clamp long selected system names');
  assert.ok(scopeTitleBlock.includes('overflow: hidden;'), 'scope title should not overflow its parent');
  assert.ok(scopeTitleBlock.includes('overflow-wrap: anywhere;'), 'scope title should break very long system names before overflow');
  assert.ok(scopeTitleBlock.includes('white-space: normal;'), 'scope title should not inherit host nowrap rules');
  assert.ok(returnBlock.includes('width: 28px;'), 'return icon should have a stable hit target inside the scope card');
  assert.ok(returnBlock.includes('color: var(--fab-mv2-text-muted);'), 'return icon should avoid danger styling');
  assert.ok(returnFocusBlock.includes('border-color: var(--fab-mv2-border-strong);'), 'return focus should stay within manager-v2 styling');
  assert.ok(focusBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'manager-v2 focus should remain visible');
  assert.equal(scopeBlock.includes('orange'), false, 'scope card should not use orange focus styling');
  assert.equal(scopeBlock.includes('red'), false, 'scope card should not use red focus styling');
});

test('manager-v2 nav buttons clear host mouse focus and keep green keyboard focus', () => {
  const navFocusBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-button:focus');
  const activeNavFocusBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-button.is-active:focus');
  const navFocusVisibleBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-button:focus-visible');

  assert.ok(navFocusBlock.includes('outline: none;'), 'mouse focus on nav buttons should not inherit the host outline');
  assert.ok(navFocusBlock.includes('box-shadow: none;'), 'mouse focus on nav buttons should not inherit the host orange focus shadow');
  assert.ok(activeNavFocusBlock.includes('box-shadow: inset 3px 0 0 var(--fab-mv2-accent);'), 'active nav focus should keep the active left accent');
  assert.ok(navFocusVisibleBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'keyboard focus on nav buttons should use the manager-v2 accent');
  assert.equal(navFocusBlock.includes('orange'), false, 'nav focus should not use orange');
  assert.equal(navFocusVisibleBlock.includes('orange'), false, 'nav keyboard focus should not use orange');
});

test('manager-v2 gathering rail submenu controls clear host mouse focus and keep green keyboard focus', () => {
  const expandedGroupBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-group.is-expanded');
  const expandedParentBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-group.is-expanded .manager-v2-nav-parent');
  const expandedParentHoverBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-group.is-expanded .manager-v2-nav-parent:hover');
  const submenuBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-submenu');
  const toggleBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-toggle');
  const expandedToggleBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-group.is-expanded .manager-v2-nav-toggle');
  const toggleFocusBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-toggle:focus');
  const toggleFocusVisibleBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-toggle:focus-visible');
  const subitemFocusBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-subitem:focus');
  const activeSubitemBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-subitem.is-active');
  const activeSubitemFocusBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-subitem.is-active:focus');
  const subitemFocusVisibleBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-subitem:focus-visible');

  assert.ok(expandedGroupBlock.includes('border-radius: 8px;'), 'expanded gathering nav should read as one grouped container');
  assert.ok(expandedGroupBlock.includes('background: var(--fab-overlay-light-035);'), 'expanded gathering nav should use a soft background');
  assert.ok(expandedGroupBlock.includes('box-shadow: inset 0 0 0 1px var(--fab-mv2-border);'), 'expanded gathering nav should draw chrome without shifting contents');
  assert.equal(expandedGroupBlock.includes('padding:'), false, 'expanded gathering nav should not add layout padding that shifts the parent row');
  assert.equal(expandedGroupBlock.includes('border:'), false, 'expanded gathering nav should not add layout border that shifts the parent row');
  assert.ok(expandedParentBlock.includes('border-color: transparent;'), 'expanded gathering parent should not use selected border styling');
  assert.ok(expandedParentBlock.includes('background: transparent;'), 'expanded gathering parent should not use selected fill styling');
  assert.ok(expandedParentBlock.includes('box-shadow: none;'), 'expanded gathering parent should not use the selected left accent');
  assert.ok(expandedParentHoverBlock.includes('background: var(--fab-overlay-light-04);'), 'expanded gathering parent may have a subtle hover without becoming selected');
  assert.ok(toggleBlock.includes('top: 4px;') && toggleBlock.includes('right: 4px;'), 'gathering toggle should have stable collapsed geometry');
  assert.equal(expandedToggleBlock, '', 'expanded gathering toggle should not override collapsed geometry');
  assert.ok(submenuBlock.includes('padding-left: 12px;'), 'gathering submenu entries should be nested inside the group');
  assert.ok(activeSubitemBlock.includes('background: var(--fab-success-soft);'), 'only selected gathering submenu entries should use selected fill');
  assert.ok(activeSubitemBlock.includes('box-shadow: inset 3px 0 0 var(--fab-mv2-accent);'), 'selected gathering submenu entries should keep the active left accent');
  assert.ok(toggleFocusBlock.includes('outline: none;'), 'mouse focus on gathering toggle should not inherit the host outline');
  assert.ok(toggleFocusBlock.includes('box-shadow: none;'), 'mouse focus on gathering toggle should not inherit the host orange focus shadow');
  assert.ok(toggleFocusVisibleBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'keyboard focus on gathering toggle should use the manager-v2 accent');
  assert.ok(subitemFocusBlock.includes('outline: none;'), 'mouse focus on gathering submenu entries should not inherit the host outline');
  assert.ok(subitemFocusBlock.includes('box-shadow: none;'), 'mouse focus on gathering submenu entries should not inherit the host orange focus shadow');
  assert.ok(activeSubitemFocusBlock.includes('box-shadow: inset 3px 0 0 var(--fab-mv2-accent);'), 'active gathering submenu focus should keep the active left accent');
  assert.ok(subitemFocusVisibleBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'keyboard focus on gathering submenu entries should use the manager-v2 accent');
  assert.equal(toggleFocusBlock.includes('orange'), false, 'gathering toggle focus should not use orange');
  assert.equal(subitemFocusVisibleBlock.includes('orange'), false, 'gathering submenu keyboard focus should not use orange');
});

test('manager-v2 inspector count labels wrap without truncation', () => {
  const factBlock = blockFor('.fabricate-manager-v2 .manager-v2-fact');
  const factLineBlock = blockFor('.fabricate-manager-v2 .manager-v2-fact-line');
  const factLeadingBlock = blockFor('.fabricate-manager-v2 .manager-v2-fact-leading');
  const featureListBlock = blockFor('.fabricate-manager-v2 .manager-v2-feature-list');
  const conditionShortcutListBlock = blockFor('.fabricate-manager-v2 .manager-v2-condition-shortcut-list');
  const conditionShortcutLabelBlock = blockFor('.fabricate-manager-v2 .manager-v2-condition-shortcut-label');
  const conditionShortcutSelectBlock = blockFor('.fabricate-manager-v2 .manager-v2-condition-shortcut select');

  assert.ok(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'count facts should use a two-column inspector grid');
  assert.ok(factBlock.includes('display: block;'), 'count facts should render one phrase instead of wrapping separate flex children');
  assert.ok(!factBlock.includes('display: flex;'), 'count facts should not split values and labels into separate flex items');
  assert.ok(factLineBlock.includes('display: inline;'), 'count facts should keep value and label in normal inline text flow');
  assert.ok(factLeadingBlock.includes('white-space: nowrap;'), 'count facts should keep the value and first label word together');
  assert.ok(!factBlock.includes('white-space: nowrap;'), 'count fact cards should not force single-line labels');
  assert.ok(factLineBlock.includes('overflow-wrap: break-word;'), 'count fact text should wrap at word boundaries with long-word fallback');
  assert.ok(!factLineBlock.includes('overflow: hidden;'), 'count fact text should not clip full labels');
  assert.ok(!factLineBlock.includes('text-overflow: ellipsis;'), 'count fact text should not ellipsize full labels');
  assert.ok(!factLineBlock.includes('overflow-wrap: anywhere;'), 'count facts should not allow character-level wrapping');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-fact.is-off'), 'disabled count facts should span the count grid');
  assert.ok(css.includes('grid-column: 1 / -1;'), 'disabled count facts should have enough width for label-first text');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-fact strong.is-disabled'), 'disabled count values should preserve emphasis');
  assert.ok(featureListBlock.includes('align-items: flex-start;'), 'feature pills should align to the top of the card');
  assert.ok(featureListBlock.includes('justify-content: flex-start;'), 'feature pills should align to the left of the card');
  assert.ok(conditionShortcutListBlock.includes('grid-template-columns: minmax(0, 1fr);'), 'condition shortcut card should keep compact one-column inspector controls');
  assert.ok(conditionShortcutListBlock.includes('gap: 10px;'), 'condition shortcut controls should have stable spacing');
  assert.ok(conditionShortcutLabelBlock.includes('display: inline-flex;'), 'condition shortcut labels should align icons and text');
  assert.ok(conditionShortcutSelectBlock.includes('font-weight: 400;'), 'condition shortcut select text should not inherit bold label weight');
});

test('manager-v2 empty states use refined heading and setup-panel styling', () => {
  const emptyIconBlock = blockFor('.fabricate-manager-v2 .manager-v2-empty > div > i');
  const emptyLayerIconBlock = blockFor('.fabricate-manager-v2 .manager-v2-empty > div > i.fa-layer-group');
  const emptyHeadingBlock = blockFor('.fabricate-manager-v2 .manager-v2-empty h3');
  const setupCardBlock = blockFor('.fabricate-manager-v2 .manager-v2-setup-card');
  const setupHeaderBlock = blockFor('.fabricate-manager-v2 .manager-v2-setup-card-header');
  const setupListBlock = blockFor('.fabricate-manager-v2 .manager-v2-setup-list');
  const setupLinksBlock = blockFor('.fabricate-manager-v2 .manager-v2-setup-links');

  assert.ok(emptyIconBlock.includes('font-size: 1.55rem;'), 'generic empty-state icons should be larger than body text');
  assert.ok(emptyLayerIconBlock.includes('font-size: 1.9rem;'), 'no-systems empty icon should be more prominent');
  assert.ok(emptyHeadingBlock.includes('font-weight: 600;'), 'empty-state headings should be lighter than heavy admin titles');
  assert.ok(emptyHeadingBlock.includes('font-size: 0.98rem;'), 'empty-state headings should stay compact');
  assert.ok(setupCardBlock.includes('display: grid;'), 'no-systems inspector setup panel should use compact grid layout');
  assert.ok(setupCardBlock.includes('border: 1px solid var(--fab-mv2-border);'), 'setup panel should use manager-v2 flat borders');
  assert.ok(setupHeaderBlock.includes('grid-template-columns: 38px minmax(0, 1fr);'), 'setup panel should reserve icon space');
  assert.ok(setupListBlock.includes('line-height: 1.35;'), 'setup tips should stay dense and readable');
  assert.ok(setupLinksBlock.includes('flex-wrap: wrap;'), 'setup links should wrap in narrow inspectors');
});

test('manager-v2 gathering rules inspector stacks descriptions above normal-weight selects', () => {
  const ruleRowBlock = blockFor('.fabricate-manager-v2 .manager-v2-rule-row');
  const ruleCopyBlock = blockFor('.fabricate-manager-v2 .manager-v2-rule-copy');
  const ruleCopyDescriptionBlock = blockFor('.fabricate-manager-v2 .manager-v2-rule-copy span');
  const ruleFieldBlock = blockFor('.fabricate-manager-v2 .manager-v2-rule-field');
  const ruleInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-rule-field select,\n.fabricate-manager-v2 .manager-v2-rule-stepper input');

  assert.ok(ruleRowBlock.includes('grid-template-columns: 34px minmax(0, 1fr);'), 'rule rows should place icon and description on the same row');
  assert.ok(ruleCopyBlock.includes('display: flex;') && ruleCopyBlock.includes('flex-direction: column;'), 'rule copy should stack label and description beside the icon');
  assert.ok(ruleCopyDescriptionBlock.includes('color: var(--fab-mv2-text-muted);'), 'rule descriptions should read as supporting copy');
  assert.ok(ruleFieldBlock.includes('grid-column: 2;'), 'rule selects should sit underneath the description column');
  assert.ok(ruleFieldBlock.includes('font-weight: 400;'), 'rule field text should not force bold select text');
  assert.ok(ruleInputBlock.includes('font-weight: 400;'), 'rule select and input text should not inherit bold labels');
  assert.equal(css.includes('.fabricate-manager-v2 .manager-v2-gathering-settings-summary'), false, 'settings center panel should not keep the duplicated rules summary');
});

test('manager-v2 gathering settings condition panels use a two-column responsive grid', () => {
  const settingsBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-settings');
  const panelBlock = blockFor('.fabricate-manager-v2 .manager-v2-condition-panel');
  const addBlock = blockFor('.fabricate-manager-v2 .manager-v2-condition-add');
  const regionAddBlock = blockFor('.fabricate-manager-v2 .manager-v2-region-add');
  const biomeAddBlock = blockFor('.fabricate-manager-v2 .manager-v2-biome-add');
  const pillBlock = blockFor('.fabricate-manager-v2 .manager-v2-condition-pill');
  const regionPillBlock = blockFor('.fabricate-manager-v2 .manager-v2-vocabulary-pill.is-region');
  const biomePillBlock = blockFor('.fabricate-manager-v2 .manager-v2-vocabulary-pill.is-biome');
  const biomeCombinedTriggerBlock = blockFor('.fabricate-manager-v2 .manager-v2-condition-pill .essence-icon-picker-trigger.icon-only.manager-v2-biome-combined-trigger');
  const biomeCombinedTriggerIconBlock = blockFor('.fabricate-manager-v2 .manager-v2-condition-pill .essence-icon-picker-trigger.icon-only.manager-v2-biome-combined-trigger i');
  const colorPickerPopoverBlock = blockFor('.fabricate-manager-v2 .manager-v2-color-picker-popover');
  const colorPresetGridBlock = blockFor('.fabricate-manager-v2 .manager-v2-color-preset-grid');
  const colorCustomInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-color-custom input');
  const labelInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-condition-label-input');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));

  assert.ok(settingsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'settings conditions should sit side by side at normal widths');
  assert.ok(settingsBlock.includes('align-items: stretch;'), 'condition panels should stretch to equal height in the two-column layout');
  assert.ok(settingsBlock.includes('padding: 0 12px 12px;'), 'settings panel should remove extra top padding while keeping side and bottom workspace spacing');
  assert.ok(panelBlock.includes('align-content: start;'), 'condition panel content should pack to its natural height');
  assert.ok(panelBlock.includes('height: 100%;'), 'condition panel backgrounds should fill the stretched grid row');
  assert.ok(addBlock.includes('grid-template-columns: 36px minmax(0, 1fr) 48px;'), 'condition add controls should reserve icon picker, label input, and Add button columns');
  assert.ok(regionAddBlock.includes('grid-template-columns: minmax(0, 1fr) 48px;'), 'region add controls should be text input plus Add button');
  assert.ok(biomeAddBlock.includes('grid-template-columns: 36px 36px minmax(0, 1fr) 48px;'), 'biome add controls should align icon, colour, input, and Add columns');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-condition-pill-list {\n  display: grid;'), 'condition pills should use grid rows instead of wrapping as single full-width flex pills');
  assert.ok(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'condition pills should fit two per line');
  assert.ok(pillBlock.includes('grid-template-columns: 30px minmax(0, 1fr) 24px;'), 'condition pills should reserve icon, label, and remove columns');
  assert.ok(regionPillBlock.includes('grid-template-columns: minmax(0, 1fr) 24px;'), 'region pills should expose editable labels and remove controls without icon columns');
  assert.ok(biomePillBlock.includes('grid-template-columns: 30px minmax(0, 1fr) 24px;'), 'biome pills should reserve combined icon/color, label, and remove columns');
  assert.ok(!biomePillBlock.includes('28px 30px minmax(0, 1fr) 30px 24px;'), 'biome pills should not reserve separate swatch and colour columns');
  assert.ok(biomeCombinedTriggerBlock.includes('color: var(--fab-biome-icon-foreground);'), 'biome combined icon trigger should use fixed charcoal foreground across themes');
  assert.ok(biomeCombinedTriggerBlock.includes('background: var(--manager-v2-color-swatch, var(--fab-tag-sage));'), 'biome combined icon trigger should keep token/custom swatch backgrounds');
  assert.ok(biomeCombinedTriggerIconBlock.includes('color: var(--fab-biome-icon-foreground);'), 'biome combined nested icons should not inherit theme button colours');
  assert.ok(css.includes('--fab-biome-icon-foreground: #202124;'), 'biome icon foreground token should stay fixed charcoal in theme declarations');
  assert.ok(colorPickerPopoverBlock.includes('box-sizing: border-box;'), 'biome color picker popover should contain its padding and border in its width');
  assert.ok(colorPickerPopoverBlock.includes('z-index: 120;'), 'biome color picker popover should layer with Manager V2 portaled pickers');
  assert.equal(colorPickerPopoverBlock.includes('top: calc(100% + 6px);'), false, 'biome color picker popover position should come from computed inline placement');
  assert.ok(colorPickerPopoverBlock.includes('width: 220px;'), 'biome color picker popover should be wide enough for presets and custom hex input');
  assert.ok(colorPickerSource.includes('computeIconPickerPopoverLayout'), 'biome color picker should use shared popover positioning');
  assert.ok(colorPickerSource.includes('minWidth: 220') && colorPickerSource.includes('maxWidth: 220'), 'biome color picker layout should keep a fixed compact width');
  assert.ok(colorPickerSource.includes("horizontalAlign: 'left'"), 'biome color picker layout should left-align with the trigger');
  assert.ok(colorPresetGridBlock.includes('grid-template-columns: repeat(4, 1fr);'), 'biome color picker presets should render as a compact grid');
  assert.ok(colorCustomInputBlock.includes('width: 100%;'), 'biome custom hex input should fill the popover without overflowing');
  assert.ok(colorCustomInputBlock.includes('min-width: 0;'), 'biome custom hex input should be allowed to shrink inside the popover grid');
  assert.ok(pillBlock.includes('border-radius: 6px;'), 'condition pills should be rounded rectangles rather than ovals');
  assert.ok(labelInputBlock.includes('align-self: center;'), 'condition label edit inputs should center inside the pill');
  assert.ok(labelInputBlock.includes('min-height: 0;'), 'condition label edit inputs should override inherited input minimum height');
  assert.ok(labelInputBlock.includes('height: 20px;'), 'condition label edit inputs should stay visually shorter than the pill');
  assert.ok(labelInputBlock.includes('max-height: 20px;'), 'condition label edit inputs should not expand to fill the pill on focus');
  assert.equal(labelInputBlock.includes('font-size'), false, 'condition label edit input should not reduce text size to shrink the control');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-condition-pill .essence-icon-picker-trigger.icon-only') && css.includes('justify-content: center;'), 'condition pill icon picker buttons should center icons');
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-gathering-settings')
      && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'condition panels should stack at medium widths'
  );
});

test('manager-v2 recipes browser defines compact responsive table geometry', () => {
  const tableBlock = blockFor('.fabricate-manager-v2 .manager-v2-recipes-table');
  const identityBlock = blockFor('.fabricate-manager-v2 .manager-v2-recipe-identity');
  const statusCellBlock = blockFor('.fabricate-manager-v2 .manager-v2-system-row .manager-v2-status-cell,\n.fabricate-manager-v2 .manager-v2-recipe-row .manager-v2-status-cell,\n.fabricate-manager-v2 .manager-v2-environment-row .manager-v2-status-cell,\n.fabricate-manager-v2 .manager-v2-gathering-task-row .manager-v2-status-cell');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));

  assert.ok(
    tableBlock.includes('--fab-mv2-recipe-grid: minmax(0, 1.35fr)'),
    'recipes table should define shrinkable compact columns for normal Foundry manager widths'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-recipes-table.has-no-category'),
    'recipes table should have a no-category grid variant'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-recipe-row,\n.fabricate-manager-v2 .manager-v2-component-row,\n.fabricate-manager-v2 .manager-v2-environment-row,\n.fabricate-manager-v2 .manager-v2-gathering-task-row,\n.fabricate-manager-v2 .manager-v2-essence-row {\n  width: 100%;\n  min-height: 76px;'),
    'recipe, component, environment, gathering task, and essence rows should have stable row height'
  );
  assert.ok(
    identityBlock.includes('grid-template-columns: 46px minmax(0, 1fr);')
      || css.includes('.fabricate-manager-v2 .manager-v2-recipe-identity,\n.fabricate-manager-v2 .manager-v2-component-identity'),
    'recipe identity should reserve thumbnail space'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-recipe-row .manager-v2-status-cell'),
    'recipe status cells should use the shared compact status-toggle alignment'
  );
  assert.ok(statusCellBlock.includes('justify-self: start;'), 'shared status toggle cells should align compact toggles to the start');
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-recipe-row') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium manager-v2 layout should stack recipe rows before columns become cramped'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-labeled-cell::before') && mediumQuery.includes('content: attr(data-label);'),
    'stacked recipe cells should expose visible labels after table headers are hidden'
  );
});

test('manager-v2 gathering task browser defines bounded toolbar and compact table geometry without reorder controls', () => {
  const toolbarBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-toolbar');
  const panelBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-panel-tasks');
  const tableBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-tasks-table');
  const rowBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-task-table-head,\n.fabricate-manager-v2 .manager-v2-gathering-task-row');
  const identityBlock = blockFor('.fabricate-manager-v2 .manager-v2-recipe-identity,\n.fabricate-manager-v2 .manager-v2-component-identity,\n.fabricate-manager-v2 .manager-v2-environment-identity,\n.fabricate-manager-v2 .manager-v2-gathering-task-identity');
  const toolsIdentityDropZoneBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-identity.is-component-drop-zone');
  const toolsIdentityDropZoneActiveBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-identity.is-component-drop-zone.is-drop-active');
  const toolsRowBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-row');
  const toolsSelectedRowBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-row.is-selected');
  const toolsSelectedRowBodyBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-row.is-selected > .manager-v2-tools-row-body');
  const toolsSelectedExpandedRowBodyBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-row.is-selected.is-expanded > .manager-v2-tools-row-body');
  const toolsRowBodyBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-row-body');
  const toolsIdentityBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-identity');
  const toolsRowSummaryBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-row-summary');
  const toolsRowActionsBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-row-actions');
  const toolsRowDirtySlotBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-row-dirty-slot');
  const toolsDirtyChipBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-dirty-chip');
  const toolsInspectorHeadingBlock = blockFor('.fabricate-manager-v2 .manager-v2-tool-inspector-heading');
  const toolsEmptyStubBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-empty-stub');
  const toolsEmptyStubActiveBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-empty-stub:hover,\n.fabricate-manager-v2 .manager-v2-tools-empty-stub:focus-visible,\n.fabricate-manager-v2 .manager-v2-tools-empty-stub.is-drop-active');
  const editorBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-task-edit-view');
  const editorWithNoticeBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-task-edit-view.has-reward-rule-notice');
  const availabilityBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-availability-row');
  const componentBrowserBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-component-browser-card');
  const componentBrowserControlsBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-component-browser-controls');
  const componentBrowserScrollBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-component-browser-scroll');
  const componentGridBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-component-grid');
  const componentCardBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-component-card');
  const componentCardCopySharedBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-component-card-copy strong,\n.fabricate-manager-v2 .manager-v2-task-component-card-copy > span:not(.manager-v2-task-component-card-tags)');
  const componentCardGripBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-component-card-grip');
  const componentBrowserFooterBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-component-browser-footer');
  const componentBrowserFooterPaginationBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-component-browser-footer .manager-v2-pagination');
  const toolsComponentBrowserBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-component-browser-card');
  const toolInspectorActionsBlock = blockFor('.fabricate-manager-v2 .manager-v2-tool-inspector-actions');
  const toolInspectorActionButtonsBlock = blockFor('.fabricate-manager-v2 .manager-v2-tool-inspector-actions .manager-v2-button');
  const toolInspectorActionButtonLabelBlock = blockFor('.fabricate-manager-v2 .manager-v2-tool-inspector-actions .manager-v2-button span');
  const toolsComponentBrowserHeaderBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-component-browser-header');
  const toolsComponentBrowserSearchBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-component-browser-card .manager-v2-search.is-compact');
  const toolsComponentBrowserSearchInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-component-browser-card .manager-v2-search.is-compact input');
  const toolsComponentBrowserScrollBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-component-browser-scroll');
  const toolsComponentBrowserGridBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-component-grid');
  const toolsComponentBrowserFooterBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-component-browser-footer');
  const toolsComponentBrowserFooterPaginationBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-component-browser-footer .manager-v2-pagination');
  const toolsComponentBrowserFooterSummaryBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-component-browser-footer .manager-v2-pagination-summary');
  const toolsComponentBrowserFooterControlsBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-component-browser-footer .manager-v2-pagination-nav,\n.fabricate-manager-v2 .manager-v2-tools-component-browser-footer .manager-v2-pagination-size');
  const toolsComponentBrowserFooterPageSizeSelectBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-component-browser-footer .manager-v2-pagination-size select');
  const toolsComponentBrowserFooterPageBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-component-browser-footer .manager-v2-pagination-page');
  const toolsInlineFieldBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-inline-field');
  const toolsInlineFieldLabelBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-inline-field > span:first-child');
  const toolsInlineNumberInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-inline-field > input[type="number"]');
  const toolsMaxUsesInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-inline-field > .manager-v2-tools-max-uses-input');
  const toolsReplacementFieldBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-replacement-field');
  const toolsReplacementComponentRowBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-replacement-field > .manager-v2-tool-component-row');
  const toolsRequirementExpressionInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-requirement-expression input');
  const toolsRequirementHelpBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-requirement-help');
  const toolsInlineFieldsBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-inline-fields');
  const toolsEditorInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-row-editor .manager-v2-field input:not([type="range"]),\n.fabricate-manager-v2 .manager-v2-tools-row-editor .manager-v2-field select');
  const toolsEditorPercentInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-tools-row-editor .manager-v2-drop-rate-percent input[type="text"]');
  const componentPillsBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-component-pills');
  const selectedTagPillBlock = blockFor('.fabricate-manager-v2 .manager-v2-selected-tag-pill');
  const dropCardBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-drops-card');
  const dropHeaderBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-drops-card .manager-v2-task-card-header');
  const dropControlsBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-drop-controls');
  const dropSearchBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-drop-controls .manager-v2-search.is-compact');
  const dropSearchInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-drop-controls .manager-v2-search.is-compact input');
  const dropFooterBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-drop-footer');
  const dropFooterPaginationBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-drop-footer .manager-v2-pagination');
  const dropScrollBlock = blockFor('.fabricate-manager-v2 .manager-v2-task-drops-card .manager-v2-table-scroll');
  const dropTableBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-task-drops-table');
  const dropTableRankedBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-task-drops-table.is-ranked-mode');
  const dropRankCellBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rank-cell');
  const dropRankValueBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rank-value');
  const dropRankButtonBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rank-button');
  const dropTableHeadBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-task-drop-table-head');
  const dropRowBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-task-drop-table-head,\n.fabricate-manager-v2 .manager-v2-gathering-task-drop-row');
  const firstDropRowBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-task-drop-table-head + .manager-v2-gathering-task-drop-row');
  const dropCellBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-task-drop-table-head > *,\n.fabricate-manager-v2 .manager-v2-gathering-task-drop-row > *');
  const dropCellSeparatorBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-task-drop-table-head > * + *,\n.fabricate-manager-v2 .manager-v2-gathering-task-drop-row > * + *');
  const selectedDropRowBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-task-drop-row.is-selected');
  const dropComponentButtonBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-component-button,\n.fabricate-manager-v2 .manager-v2-drop-empty-component');
  const dropEmptyComponentBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-empty-component');
  const dropEmptyComponentIconBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-empty-component .manager-v2-inline-drop-zone');
  const dropComponentCopyBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-component-button .manager-v2-system-copy,\n.fabricate-manager-v2 .manager-v2-drop-empty-component .manager-v2-system-copy');
  const dropComponentNameBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-component-button .manager-v2-system-name');
  const dropRateBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-cell');
  const dropRateValueBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-value');
  const dropRatePercentBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-percent');
  const dropRatePercentInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-percent input[type="text"]');
  const dropRatePercentInputOverrideBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-task-edit-view .manager-v2-drop-rate-percent input[type="text"]');
  const dropRatePercentSuffixBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-percent > span[aria-hidden="true"]');
  const dropRateControlBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-control');
  const guaranteedDropRateControlBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-control.is-guaranteed');
  const commonDropRateControlBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-control.is-common');
  const uncommonDropRateControlBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-control.is-uncommon');
  const rareDropRateControlBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-control.is-rare');
  const veryRareDropRateControlBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-control.is-very-rare');
  const legendaryDropRateControlBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-control.is-legendary');
  const noneDropRateControlBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-control.is-none');
  const dropRateTrackBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-track');
  const dropRateFillBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-fill');
  const dropRateRangeBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-control input[type="range"]');
  const dropRateWebkitTrackBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-control input[type="range"]::-webkit-slider-runnable-track');
  const dropRateWebkitThumbBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-control input[type="range"]::-webkit-slider-thumb');
  const dropRateMozProgressBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-control input[type="range"]::-moz-range-progress');
  const dropRateMozThumbBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-control input[type="range"]::-moz-range-thumb');
  const toolBreakageChanceControlBlock = blockFor('.fabricate-manager-v2 .manager-v2-tool-breakage-chance-control');
  const toolBreakageChanceTrackBlock = blockFor('.fabricate-manager-v2 .manager-v2-tool-breakage-chance-control .manager-v2-drop-rate-track');
  const toolBreakageChanceFillBlock = blockFor('.fabricate-manager-v2 .manager-v2-tool-breakage-chance-control .manager-v2-drop-rate-fill');
  const toolBreakageChanceRangeBlock = blockFor('.fabricate-manager-v2 .manager-v2-tool-breakage-chance-control input[type="range"]');
  const toolBreakageChanceWebkitThumbBlock = blockFor('.fabricate-manager-v2 .manager-v2-tool-breakage-chance-control input[type="range"]::-webkit-slider-thumb');
  const toolBreakageChanceMozTrackBlock = blockFor('.fabricate-manager-v2 .manager-v2-tool-breakage-chance-control input[type="range"]::-moz-range-track,\n.fabricate-manager-v2 .manager-v2-tool-breakage-chance-control input[type="range"]::-moz-range-progress');
  const toolBreakageChanceMozThumbBlock = blockFor('.fabricate-manager-v2 .manager-v2-tool-breakage-chance-control input[type="range"]::-moz-range-thumb');
  const dropModifierListBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-modifier-list');
  const dropModifierPillBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-modifier-pill');
  const positiveDropModifierPillBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-modifier-pill.is-positive');
  const negativeDropModifierPillBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-modifier-pill.is-negative');
  const dropModifierOverflowBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-modifier-overflow');
  const dropEditorInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-editor-card :is(select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]))');
  const dropEditorValuesBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-editor-values');
  const dropEditorRatePercentBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-editor-card .manager-v2-drop-rate-percent input[type="text"]');
  const dropEditorRateValueBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-editor-card [data-gathering-drop-inspector-rate] .manager-v2-drop-rate-value');
  const dropEditorRateInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-editor-card [data-gathering-drop-inspector-rate] .manager-v2-drop-rate-percent input[type="text"]');
  const dropEditorRateSuffixBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-editor-card [data-gathering-drop-inspector-rate] .manager-v2-drop-rate-percent > span[aria-hidden="true"]');
  const dropEditorRateControlBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-editor-card [data-gathering-drop-inspector-rate] .manager-v2-drop-rate-control');
  const dropEditorRateTrackBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-editor-card [data-gathering-drop-inspector-rate] .manager-v2-drop-rate-track');
  const dropEditorRateFillBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-editor-card [data-gathering-drop-inspector-rate] .manager-v2-drop-rate-fill');
  const dropEditorRateRangeBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-editor-card [data-gathering-drop-inspector-rate] .manager-v2-drop-rate-control input[type="range"]');
  const dropEditorRateWebkitTrackBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-editor-card [data-gathering-drop-inspector-rate] .manager-v2-drop-rate-control input[type="range"]::-webkit-slider-runnable-track');
  const dropEditorRateMozTrackBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-editor-card [data-gathering-drop-inspector-rate] .manager-v2-drop-rate-control input[type="range"]::-moz-range-track');
  const dropEditorCountBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-count-editor');
  const dropEditorCountInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-count-editor input[type="text"]');
  const dropEditorInspectorCountInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-editor-card .manager-v2-drop-count-editor[data-gathering-drop-inspector-count] input[type="text"]');
  const dropInspectorButtonBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-inspector-stack .manager-v2-button');
  const dropInspectorIconButtonBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-inspector-stack .manager-v2-icon-button');
  const dropInspectorSearchInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-inspector-stack .manager-v2-search input');
  const dropInspectorCharacterFieldBlock = blockFor('.fabricate-manager-v2 .manager-v2-character-modifier-row-card .manager-v2-field :is(select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]))');
  const dropInspectorCharacterOperatorBlock = blockFor('.fabricate-manager-v2 .manager-v2-character-modifier-operator-select select');
  const dropEditorActionsBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-editor-actions');
  const dropInspectorStackBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-inspector-stack');
  const dropInspectorRouteBlock = blockFor('.fabricate-manager-v2[data-manager-v2-view="gathering-task-edit"] .manager-v2-inspector');
  const dropInspectorDividerBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-inspector-divider');
  const dropInspectorScrollBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-inspector-scroll');
  const dropQuantityCellBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-task-drop-row > .manager-v2-drop-quantity-cell');
  const dropQuantityInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-drop-quantity-cell input[type="text"]');
  const dropQuantityInputOverrideBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-task-edit-view .manager-v2-drop-quantity-cell input[type="text"]');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));
  const taskEditorIntermediateQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1320px)'), css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));

  assert.ok(toolbarBlock.includes('max-height: 112px;') && toolbarBlock.includes('overflow-y: auto;'), 'task toolbar should stay bounded when filters wrap or labels are long');
  assert.ok(panelBlock.includes('grid-template-rows: auto minmax(0, 1fr) auto;'), 'task panel should reserve toolbar, table scroll, and pagination rows');
  assert.ok(tableBlock.includes('--fab-mv2-gathering-task-grid:'), 'task browser should define a compact desktop grid');
  assert.ok(!tableBlock.includes('reorder'), 'task browser should not reserve a reorder column');
  assert.ok(rowBlock.includes('grid-template-columns: var(--fab-mv2-gathering-task-grid);'), 'task rows should use the shared task grid');
  assert.ok(identityBlock.includes('grid-template-columns: 46px minmax(0, 1fr);'), 'task identity should reserve thumbnail space');
  assert.ok(toolsRowBlock.includes('position: relative;'), 'tool rows should anchor the dirty pip overlay without involving header flow');
  assert.ok(
    toolsSelectedRowBlock.includes('border-color: var(--fab-mv2-border-strong);')
      && !toolsSelectedRowBlock.includes('border-color: var(--fab-accent);')
      && toolsSelectedRowBlock.includes('box-shadow: none;')
      && !toolsSelectedRowBlock.includes('box-shadow: inset 3px 0 0 var(--fab-accent);'),
    'selected tool rows should not use accent borders or inset line markers'
  );
  assert.ok(
    toolsSelectedRowBodyBlock.includes('background: var(--fab-success-soft);'),
    'selected tool rows should indicate selection through a legible header background'
  );
  assert.ok(
    toolsSelectedExpandedRowBodyBlock.includes('border-bottom-right-radius: 0;')
      && toolsSelectedExpandedRowBodyBlock.includes('border-bottom-left-radius: 0;'),
    'expanded selected tool headers should meet the editor panel cleanly'
  );
  assert.ok(
    toolsRowBodyBlock.includes('grid-template-columns: minmax(260px, 300px) minmax(0, 1fr) max-content;'),
    'tool rows should reserve a stable component column while keeping action width compact'
  );
  assert.ok(toolsIdentityBlock.includes('width: 100%;'), 'tool identity drop zones should fill the stable component column');
  assert.ok(
    toolsRowSummaryBlock.includes('justify-content: flex-start;')
      && toolsRowSummaryBlock.includes('min-width: 0;')
      && toolsRowSummaryBlock.includes('max-height: 58px;')
      && toolsRowSummaryBlock.includes('overflow: hidden;'),
    'tool row summary chips should align from a consistent summary column and never spill into a third line'
  );
  assert.ok(
    toolsRowActionsBlock.includes('grid-template-columns: 34px;')
      && toolsRowActionsBlock.includes('justify-self: end;')
      && toolsRowActionsBlock.includes('max-width: 34px;'),
    'tool row actions should reserve only the chevron column'
  );
  assert.ok(
    toolsRowDirtySlotBlock.includes('position: absolute;')
      && toolsRowDirtySlotBlock.includes('top: 0;')
      && toolsRowDirtySlotBlock.includes('left: 10px;')
      && toolsRowDirtySlotBlock.includes('z-index: 4;')
      && toolsRowDirtySlotBlock.includes('transform: translateY(-50%);')
      && toolsDirtyChipBlock.includes('white-space: nowrap;')
      && toolsDirtyChipBlock.includes('background: var(--fab-mv2-surface-1);')
      && toolsDirtyChipBlock.includes('inset 0 0 0 999px var(--fab-warning-soft),'),
    'tool row dirty pip should overlay the top-left row corner with an opaque readable surface'
  );
  assert.ok(
    toolsInspectorHeadingBlock.includes('display: flex;') && toolsInspectorHeadingBlock.includes('flex-wrap: wrap;'),
    'selected tool inspector heading should hold the selected-tool dirty pip'
  );
  assert.ok(
    toolsIdentityDropZoneBlock.includes('border: 1px dashed var(--fab-mv2-border-strong);')
      && toolsIdentityDropZoneBlock.includes('border-radius: 8px;')
      && toolsIdentityDropZoneBlock.includes('background: var(--fab-overlay-light-03);'),
    'mapped tool row identities should present a subtle dashed component drop zone'
  );
  assert.ok(
    toolsIdentityDropZoneActiveBlock.includes('border-color: var(--fab-mv2-accent);')
      && toolsIdentityDropZoneActiveBlock.includes('background: var(--fab-success-soft);'),
    'mapped tool row component drop zones should show an active drag-over state'
  );
  assert.ok(
    toolsEmptyStubBlock.includes('min-height: 58px;')
      && toolsEmptyStubBlock.includes('padding: 18px 14px;'),
    'tools add stub should be tall enough to work as a drop target'
  );
  assert.ok(
    toolsEmptyStubActiveBlock.includes('.manager-v2-tools-empty-stub.is-drop-active')
      && toolsEmptyStubActiveBlock.includes('border-color: var(--fab-accent);'),
    'tools add stub should share hover/focus styling with active drag-over state'
  );
  assert.ok(
    toolsInlineFieldBlock.includes('grid-template-columns: max-content minmax(0, 1fr);')
      && toolsInlineFieldBlock.includes('align-items: center;'),
    'tools breakage and on-break controls should keep labels and inputs on one row'
  );
  assert.ok(toolsInlineFieldLabelBlock.includes('white-space: nowrap;'), 'tools inline labels should not wrap above their inputs');
  assert.ok(toolsInlineNumberInputBlock.includes('max-width: 122px;'), 'tools inline number inputs should remain compact without clipping placeholders');
  assert.ok(toolsMaxUsesInputBlock.includes('max-width: 190px;'), 'tools maximum-uses input should be wide enough for its placeholder');
  assert.ok(
    toolsReplacementFieldBlock.includes('grid-template-columns: minmax(0, 1fr);')
      && !toolsReplacementFieldBlock.includes('max-content')
      && toolsReplacementFieldBlock.includes('align-items: stretch;')
      && toolsReplacementFieldBlock.includes('width: 100%;'),
    'tools replacement component field should fill the editor row without the inline label grid'
  );
  assert.ok(
    toolsReplacementComponentRowBlock.includes('width: 100%;') && toolsReplacementComponentRowBlock.includes('min-width: 0;'),
    'tools replacement component drop zone should span the full replacement field width'
  );
  assert.ok(toolsRequirementExpressionInputBlock.includes('width: 100%;'), 'tools requirement expression should use the full row width');
  assert.ok(
    toolsRequirementHelpBlock.includes('font-size: 0.8rem;') && toolsRequirementHelpBlock.includes('line-height: 1.35;'),
    'tools requirement instructions should be compact helper copy'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-tools-requirement-help ul {\n  display: grid;'),
    'tools requirement examples should be listed compactly'
  );
  assert.ok(
    toolsInlineFieldsBlock.includes('grid-template-columns: minmax(260px, 1fr) minmax(180px, 0.55fr);'),
    'tools two-input breakage controls should remain side-by-side'
  );
  assert.ok(
    toolsEditorInputBlock.includes('height: 28px;')
      && toolsEditorInputBlock.includes('min-height: 28px;')
      && !toolsEditorInputBlock.includes('padding:'),
    'tools editor broad input sizing should not force specialized padding onto every field'
  );
  assert.ok(
    toolsEditorPercentInputBlock.includes('padding: 0 10px 0 0;'),
    'tools breakage chance percent input should keep its specialized compact padding'
  );
  assert.ok(editorBlock.includes('grid-template-rows: auto auto 340px minmax(410px, 1fr) auto;'), 'task edit route should reserve taller component browser and exact three-row drop-rule rows for drag/drop');
  assert.ok(editorWithNoticeBlock.includes('grid-template-rows: auto auto 340px auto minmax(410px, 1fr) auto;'), 'task edit route should give the duplicate-drop warning a compact auto row before drop rules');
  assert.ok(editorBlock.includes('overflow: auto;'), 'task editor should allow vertical scrolling without horizontal overflow');
  assert.ok(availabilityBlock.includes('grid-template-columns: repeat(2, minmax(160px, 1fr));'), 'task availability controls should form a stable two-column grid');
  assert.ok(componentBrowserBlock.includes('height: 340px;') && componentBrowserBlock.includes('max-height: 340px;') && componentBrowserBlock.includes('overflow: hidden;'), 'component browser should own a fixed bounded height that keeps the footer visible');
  assert.ok(componentBrowserBlock.includes('grid-template-rows: auto auto minmax(0, 1fr) auto;'), 'component browser should reserve header, optional pills, card scroll, and footer rows');
  assert.ok(componentPillsBlock.includes('border-top: 1px solid var(--fab-mv2-border);'), 'component browser selected tags should occupy a distinct pill row');
  assert.ok(selectedTagPillBlock.includes('background: var(--fab-success-soft);'), 'selected component tag filters should use removable selected-tag pill styling');
  assert.ok(componentBrowserControlsBlock.includes('grid-template-columns: minmax(180px, 0.9fr) minmax(180px, 0.9fr);'), 'component browser should keep name and tag search in a compact control grid');
  assert.ok(componentBrowserScrollBlock.includes('overflow-x: hidden;') && componentBrowserScrollBlock.includes('overflow-y: auto;'), 'component browser card area should scroll internally without horizontal overflow');
  assert.ok(componentGridBlock.includes('grid-template-columns: repeat(3, minmax(0, 1fr));'), 'component browser should use a three-column card grid');
  assert.ok(componentCardBlock.includes('grid-template-columns: 38px minmax(0, 1fr) 18px;') && componentCardBlock.includes('min-height: 72px;'), 'component browser cards should reserve image, copy, and grip columns');
  assert.ok(componentCardCopySharedBlock.includes('text-overflow: ellipsis;'), 'component card shared copy should truncate within the card');
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-task-component-card-copy strong {\n  -webkit-line-clamp: 1;')
      && css.includes('.fabricate-manager-v2 .manager-v2-task-component-card-copy > span:not(.manager-v2-task-component-card-tags) {\n  -webkit-line-clamp: 1;'),
    'component card name and description should clamp to one line'
  );
  assert.ok(componentCardGripBlock.includes('letter-spacing: 0;'), 'component grip should avoid viewport-scaled or negative tracking');
  assert.ok(componentBrowserFooterBlock.includes('border-top: 1px solid var(--fab-mv2-border);'), 'component browser should own a pagination footer');
  assert.ok(componentBrowserFooterPaginationBlock.includes('background: transparent;'), 'component browser footer should not nest pagination chrome');
  assert.ok(
    toolInspectorActionsBlock.includes('display: grid;')
      && toolInspectorActionsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));')
      && toolInspectorActionsBlock.includes('gap: 8px;'),
    'selected tool inspector actions should sit in a stable two-column action row inside the header card'
  );
  assert.ok(toolInspectorActionButtonsBlock.includes('width: 100%;') && toolInspectorActionButtonsBlock.includes('padding: 0 8px;'), 'selected tool inspector action buttons should fill their grid columns without overflowing the right rail');
  assert.ok(toolInspectorActionButtonLabelBlock.includes('overflow-wrap: anywhere;'), 'selected tool inspector action labels should be allowed to wrap in narrow localized layouts');
  assert.ok(
    toolsComponentBrowserBlock.includes('grid-template-rows: auto minmax(96px, 1fr) auto;')
      && toolsComponentBrowserBlock.includes('gap: 0;')
      && toolsComponentBrowserBlock.includes('height: clamp(300px, 54vh, 440px);')
      && toolsComponentBrowserBlock.includes('min-height: 0;')
      && toolsComponentBrowserBlock.includes('max-height: none;')
      && toolsComponentBrowserBlock.includes('overflow: hidden;'),
    'tools component browser should reserve deterministic header, result scroll, and footer rows without forcing a tall inspector card'
  );
  assert.ok(toolsComponentBrowserHeaderBlock.includes('padding: 0 0 10px;'), 'tools component browser header should own spacing without creating a large blank scroll gap');
  assert.ok(
    toolsComponentBrowserSearchBlock.includes('position: relative;')
      && toolsComponentBrowserSearchBlock.includes('display: block;')
      && toolsComponentBrowserSearchBlock.includes('flex: 0 0 auto;')
      && toolsComponentBrowserSearchBlock.includes('width: 100%;'),
    'tools component browser search should anchor its icon inside a full-width input box without inheriting the global 260px flex basis as height'
  );
  assert.ok(toolsComponentBrowserSearchInputBlock.includes('padding-left: 36px;'), 'tools component browser search input should reserve text inset for the leading search icon');
  assert.ok(toolsComponentBrowserScrollBlock.includes('padding: 10px 0 12px;') && toolsComponentBrowserScrollBlock.includes('overflow-x: hidden;') && toolsComponentBrowserScrollBlock.includes('overflow-y: auto;'), 'tools component browser results should show complete cards before scrolling without horizontal overflow');
  assert.ok(toolsComponentBrowserGridBlock.includes('grid-template-columns: minmax(0, 1fr);'), 'tools component browser should keep a one-column card grid in the narrow inspector');
  assert.ok(toolsComponentBrowserFooterBlock.includes('border-top: 1px solid var(--fab-mv2-border);') && toolsComponentBrowserFooterBlock.includes('background: transparent;'), 'tools component browser footer should separate pagination without adding nested card chrome');
  assert.ok(
    toolsComponentBrowserFooterPaginationBlock.includes('display: grid;')
      && toolsComponentBrowserFooterPaginationBlock.includes('grid-template-columns: minmax(0, 1fr);')
      && toolsComponentBrowserFooterPaginationBlock.includes('justify-items: center;')
      && toolsComponentBrowserFooterPaginationBlock.includes('width: 100%;')
      && toolsComponentBrowserFooterPaginationBlock.includes('border-top: 0;')
      && toolsComponentBrowserFooterPaginationBlock.includes('background: transparent;'),
    'tools component browser pagination should fill the footer and center its narrow-card controls'
  );
  assert.ok(
    toolsComponentBrowserFooterSummaryBlock.includes('width: 100%;')
      && toolsComponentBrowserFooterSummaryBlock.includes('max-width: 100%;')
      && toolsComponentBrowserFooterSummaryBlock.includes('text-align: center;')
      && toolsComponentBrowserFooterSummaryBlock.includes('white-space: normal;')
      && toolsComponentBrowserFooterSummaryBlock.includes('overflow-wrap: anywhere;'),
    'tools component browser pagination summary should center and wrap within the narrow footer'
  );
  assert.ok(toolsComponentBrowserFooterControlsBlock.includes('justify-content: center;') && toolsComponentBrowserFooterControlsBlock.includes('width: 100%;'), 'tools component browser pagination nav and page-size controls should be centered full-width rows');
  assert.ok(toolsComponentBrowserFooterPageSizeSelectBlock.includes('width: 52px;') && toolsComponentBrowserFooterPageSizeSelectBlock.includes('min-width: 52px;'), 'tools component browser per-page select should stay narrow in the centered footer');
  assert.ok(toolsComponentBrowserFooterPageBlock.includes('min-width: 0;'), 'tools component browser page label should not force overflow in the narrow inspector');
  assert.ok(dropCardBlock.includes('--fab-mv2-task-drop-table-visible-height: 262px;'), 'drop rules card should define an exact table viewport equal to header plus three rows');
  assert.ok(dropCardBlock.includes('grid-template-rows: auto var(--fab-mv2-task-drop-table-visible-height) auto;'), 'drop rules card should keep the table viewport definite between the card header and footer');
  assert.ok(dropCardBlock.includes('height: 410px;') && dropCardBlock.includes('max-height: 410px;'), 'task editor drop rules card should be exactly tall enough for the three-row table viewport and footer');
  assert.ok(dropHeaderBlock.includes('grid-template-columns: minmax(0, 1fr) auto;'), 'drop rules header should put copy left and controls right');
  assert.ok(dropControlsBlock.includes('display: inline-flex;') && dropControlsBlock.includes('justify-content: flex-end;'), 'drop rules search and add action should share a compact toolbar');
  assert.ok(dropSearchBlock.includes('min-width: min(220px, 100%);'), 'drop rules search should not collapse until its icon overlaps the text area');
  assert.ok(dropSearchInputBlock.includes('padding-left: 36px;'), 'drop rules search input should reserve text inset for the leading search icon');
  assert.ok(dropFooterBlock.includes('border-top: 1px solid var(--fab-mv2-border);'), 'drop rules count should live in a footer area with pagination');
  assert.ok(dropFooterPaginationBlock.includes('background: transparent;'), 'drop rules footer should not nest pagination chrome');
  assert.ok(dropScrollBlock.includes('height: var(--fab-mv2-task-drop-table-visible-height);') && dropScrollBlock.includes('max-height: var(--fab-mv2-task-drop-table-visible-height);'), 'drop rules table scroll region should show exactly three complete rows before scrolling');
  assert.ok(dropScrollBlock.includes('padding: 10px 0 0;'), 'drop rules table scroll region should not add horizontal inset');
  assert.ok(dropScrollBlock.includes('overflow-x: hidden;') && dropScrollBlock.includes('overflow-y: auto;'), 'drop rules table should suppress horizontal scroll while retaining vertical scrolling');
  assert.ok(dropTableBlock.includes('--fab-mv2-task-drop-grid:'), 'task editor drop rows should define compact desktop geometry');
  assert.ok(dropTableBlock.includes('minmax(0, 1.05fr)') && dropTableBlock.includes('minmax(220px, 1.35fr)') && dropTableBlock.includes('56px') && dropTableBlock.includes('minmax(180px, 1.65fr)'), 'drop row desktop grid should keep component/chance/quantity geometry while widening modifiers');
  assert.equal(dropTableBlock.includes('88px'), false, 'drop row desktop grid should not reserve a row actions column');
  assert.ok(dropTableBlock.includes('width: 100%;') && dropTableBlock.includes('max-width: 100%;'), 'drop table should fill the drop rules card without exceeding it');
  assert.ok(dropTableHeadBlock.includes('padding: 0;'), 'drop rules header row should clear generic table-head padding so columns align with value rows');
  assert.ok(dropRowBlock.includes('grid-template-columns: var(--fab-mv2-task-drop-grid);'), 'drop rows should use the shared single-line editor grid');
  assert.ok(dropRowBlock.includes('gap: 0;') && dropRowBlock.includes('max-width: 100%;'), 'drop rows should use separators instead of gap-driven overflow');
  assert.ok(firstDropRowBlock.includes('border-top: 0;'), 'first drop row should not double the header bottom border');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-gathering-task-drop-row {\n  min-height: 72px;'), 'drop rows should be tall enough for two visible modifier chip lines');
  assert.ok(dropCellBlock.includes('padding: 4px 10px;') && dropCellBlock.includes('box-sizing: border-box;'), 'drop cells should keep padding inside full-width rows');
  assert.ok(dropCellSeparatorBlock.includes('border-left: 1px solid var(--fab-mv2-border);'), 'drop cells should use vertical separators');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-gathering-task-drop-row.is-drop-active'), 'drop rows should expose a full-row active drop target state');
  assert.ok(selectedDropRowBlock.includes('background: var(--fab-success-soft);') && selectedDropRowBlock.includes('var(--fab-mv2-accent)'), 'selected drop rows should use the component-browser success/accent family');
  assert.ok(selectedDropRowBlock.includes('inset 0 1px 0 var(--fab-mv2-border-strong)') && selectedDropRowBlock.includes('inset 0 -1px 0 var(--fab-mv2-border-strong)'), 'selected drop row outline should avoid a right edge next to the card border');
  assert.equal(selectedDropRowBlock.includes('inset 0 0 0 1px'), false, 'selected drop row should not draw a full inset border against the card edge');
  assert.equal(selectedDropRowBlock.includes('var(--fab-info'), false, 'selected drop rows should not use the info family');
  assert.equal(selectedDropRowBlock.includes('var(--fab-warning'), false, 'selected drop rows should not use the warning family');
  assert.ok(dropComponentButtonBlock.includes('grid-template-columns: 42px minmax(0, 1fr);') && dropComponentButtonBlock.includes('min-height: 40px;'), 'drop component cells should keep compact thumbnail/name geometry');
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-drop-empty-component {\n  min-height: 52px;\n  padding: 6px 8px;\n  border: 1px dashed var(--fab-mv2-border-strong);'),
    'empty component placeholders should show the full drop-zone boundary'
  );
  assert.ok(dropEmptyComponentIconBlock.includes('border: 0;'), 'empty component placeholders should avoid a nested icon-only dashed border');
  assert.ok(dropComponentCopyBlock.includes('align-content: center;'), 'drop component text should be vertically centered after description removal');
  assert.ok(dropComponentNameBlock.includes('display: -webkit-box;') && dropComponentNameBlock.includes('-webkit-line-clamp: 2;') && dropComponentNameBlock.includes('white-space: normal;'), 'drop component names should wrap to two lines instead of relying on descriptions');
  assert.ok(dropRateBlock.includes('display: block;'), 'drop chance cell should expose one wrapped value');
  assert.ok(dropRateValueBlock.includes('grid-template-columns: 52px minmax(0, 1fr);') && dropRateValueBlock.includes('gap: 4px;'), 'drop chance value should keep the row editable percent close to a wider slider');
  assert.ok(dropRatePercentBlock.includes('position: relative;') && dropRatePercentBlock.includes('display: block;'), 'drop chance percent should overlay the suffix without taking slider width');
  assert.ok(css.includes('--fab-drop-rate-none: #E26F6B;'), 'drop chance slider should define a distinct exact-zero colour token');
  assert.ok(dropRatePercentInputBlock.includes('height: 28px;') && dropRatePercentInputBlock.includes('box-sizing: border-box;') && dropRatePercentInputBlock.includes('padding: 4px 16px 4px 2px;') && dropRatePercentInputBlock.includes('text-align: center;'), 'drop chance row percent should keep its existing compact centered editable numeric field');
  assert.ok(dropRatePercentInputOverrideBlock.includes('min-height: 28px;') && dropRatePercentInputOverrideBlock.includes('padding: 4px 16px 4px 2px;') && dropRatePercentInputOverrideBlock.includes('box-shadow: none;'), 'drop chance row percent should override generic gathering task input chrome without affecting other fields');
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-drop-rate-percent > span[aria-hidden="true"] {\n  position: absolute;\n  right: 6px;')
      && css.includes('pointer-events: none;'),
    'drop chance row percent suffix should keep its existing placement'
  );
  assert.ok(dropRateControlBlock.includes('--fab-drop-rate-value: 1%;') && dropRateControlBlock.includes('--fab-drop-rate-color: var(--fab-drop-rate-very-rare);'), 'drop chance slider should expose value and tier colour variables');
  assert.ok(dropRateTrackBlock.includes('background: var(--fab-overlay-dark-18);') && dropRateTrackBlock.includes('overflow: hidden;'), 'drop chance slider should render a neutral clipped track under the native range input');
  assert.ok(dropRateFillBlock.includes('width: var(--fab-drop-rate-value);') && dropRateFillBlock.includes('background: var(--fab-drop-rate-color);'), 'drop chance slider should fill the active track segment with the current tier colour');
  assert.ok(dropRateRangeBlock.includes('appearance: none;') && dropRateRangeBlock.includes('-webkit-appearance: none;'), 'drop chance range should clear native host slider rendering');
  assert.ok(dropRateRangeBlock.includes('accent-color: var(--fab-drop-rate-color);'), 'drop chance native range should inherit the current tier colour');
  assert.ok(dropRateWebkitTrackBlock.includes('border: 1px solid var(--fab-overlay-light-10);') && dropRateWebkitTrackBlock.includes('background: transparent;'), 'drop chance row WebKit range track should keep its existing native track geometry');
  assert.ok(blockFor('.fabricate-manager-v2 .manager-v2-drop-rate-control input[type="range"]::-moz-range-track').includes('border: 1px solid var(--fab-overlay-light-10);'), 'drop chance row Firefox range track should keep its existing native track geometry');
  assert.ok(dropRateMozProgressBlock.includes('background: var(--fab-drop-rate-color);'), 'drop chance Firefox progress should paint the active segment in the current tier colour');
  assert.ok(dropRateWebkitThumbBlock.includes('background: var(--fab-drop-rate-color);') && dropRateMozThumbBlock.includes('background: var(--fab-drop-rate-color);'), 'drop chance range thumbs should retain current-tier colour');
  assert.ok(
    toolBreakageChanceControlBlock.includes('--fab-tool-breakage-chance-low: var(--fab-success);')
      && toolBreakageChanceControlBlock.includes('--fab-tool-breakage-chance-mid: var(--fab-warning);')
      && toolBreakageChanceControlBlock.includes('--fab-tool-breakage-chance-high: var(--fab-danger);'),
    'tool breakage chance slider should define a semantic green-yellow-red scale from theme tokens'
  );
  assert.ok(
    toolBreakageChanceTrackBlock.includes('linear-gradient(')
      && toolBreakageChanceTrackBlock.includes('90deg')
      && toolBreakageChanceTrackBlock.includes('var(--fab-tool-breakage-chance-low) 0%')
      && toolBreakageChanceTrackBlock.includes('var(--fab-tool-breakage-chance-mid) 50%')
      && toolBreakageChanceTrackBlock.includes('var(--fab-tool-breakage-chance-high) 100%'),
    'tool breakage chance slider should show the full green-yellow-red gradient across the whole rail'
  );
  assert.ok(toolBreakageChanceFillBlock.includes('display: none;'), 'tool breakage chance slider should not render a tier-coloured filled segment over the full gradient');
  assert.ok(toolBreakageChanceRangeBlock.includes('accent-color: var(--fab-tool-breakage-chance-color);'), 'tool breakage chance native range should use the dynamic current-risk colour');
  assert.ok(toolBreakageChanceWebkitThumbBlock.includes('background: var(--fab-tool-breakage-chance-color);') && toolBreakageChanceMozThumbBlock.includes('background: var(--fab-tool-breakage-chance-color);'), 'tool breakage chance slider thumbs should use the dynamic current-risk colour');
  assert.ok(toolBreakageChanceMozTrackBlock.includes('background: transparent;'), 'tool breakage chance Firefox native track/progress should not draw over the custom gradient rail');
  assert.ok(
    guaranteedDropRateControlBlock.includes('var(--fab-drop-rate-guaranteed)')
      && commonDropRateControlBlock.includes('var(--fab-drop-rate-common)')
      && uncommonDropRateControlBlock.includes('var(--fab-drop-rate-uncommon)')
      && rareDropRateControlBlock.includes('var(--fab-drop-rate-rare)')
      && veryRareDropRateControlBlock.includes('var(--fab-drop-rate-very-rare)')
      && legendaryDropRateControlBlock.includes('var(--fab-drop-rate-legendary)')
      && noneDropRateControlBlock.includes('var(--fab-drop-rate-none)'),
    'drop chance control classes should map the selected rarity palette to the current value'
  );
  assert.ok(dropQuantityCellBlock.includes('display: flex;') && dropQuantityCellBlock.includes('justify-content: center;') && dropQuantityCellBlock.includes('padding: 6px;'), 'quantity cells should spend less horizontal space while centering the input');
  assert.ok(dropQuantityInputBlock.includes('max-width: 44px;') && dropQuantityInputBlock.includes('box-sizing: border-box;') && dropQuantityInputBlock.includes('text-align: center;') && dropQuantityInputBlock.includes('font-variant-numeric: tabular-nums;'), 'quantity should remain a compact numeric text input sized for three digits');
  assert.ok(dropQuantityInputOverrideBlock.includes('min-height: 28px;') && dropQuantityInputOverrideBlock.includes('padding: 4px;'), 'quantity should override generic gathering input padding without widening the column');
  assert.ok(dropModifierListBlock.includes('flex-wrap: wrap;') && dropModifierListBlock.includes('align-content: center;'), 'drop modifiers should wrap into a compact two-line chip group');
  assert.ok(dropModifierListBlock.includes('max-height: 58px;') && dropModifierListBlock.includes('overflow: hidden;'), 'drop modifiers should clip after the two-line chip budget');
  assert.ok(dropModifierPillBlock.includes('background: var(--fab-overlay-light-06);'), 'drop modifier pills should use restrained neutral chip backgrounds');
  assert.ok(positiveDropModifierPillBlock.includes('color: var(--fab-mv2-text);') && negativeDropModifierPillBlock.includes('color: var(--fab-mv2-text);'), 'drop modifier chips should avoid saturated text across the whole pill');
  assert.ok(dropModifierOverflowBlock.includes('text-overflow: ellipsis;') && dropModifierOverflowBlock.includes('white-space: nowrap;'), 'overflow modifier hints should stay as one clipped table label');
  assert.ok(dropEditorInputBlock.includes(':not([type="range"])'), 'selected drop inspector generic input chrome should not override row-style range sliders');
  assert.ok(dropEditorInputBlock.includes('height: 28px;') && dropEditorInputBlock.includes('min-height: 28px;') && dropEditorInputBlock.includes('padding: 3px 8px;'), 'selected drop inspector generic inputs and selects should use compact 28px right-sidebar geometry');
  assert.ok(dropEditorValuesBlock.includes('grid-template-columns: minmax(0, 1fr) 72px;') && dropEditorValuesBlock.includes('align-items: end;'), 'selected drop inspector should place chance and count in a compact two-column grid');
  assert.ok(dropEditorRateValueBlock.includes('grid-template-columns: 64px minmax(0, 1fr);'), 'selected drop inspector chance should widen only the right-menu percent column');
  assert.ok(dropEditorRatePercentBlock.includes('height: 28px;') && dropEditorRatePercentBlock.includes('padding: 4px 16px 4px 2px;') && dropEditorRatePercentBlock.includes('background: var(--fab-overlay-dark-18);'), 'selected drop inspector broad chance input rule should not carry the right-menu suffix padding');
  assert.ok(dropEditorRateInputBlock.includes('height: 28px;') && dropEditorRateInputBlock.includes('min-height: 28px;') && dropEditorRateInputBlock.includes('padding: 4px 16px 4px 6px;') && dropEditorRateInputBlock.includes('box-shadow: none;'), 'selected drop inspector chance input should keep compact row-style geometry without extra suffix padding');
  assert.ok(dropEditorRateSuffixBlock.includes('right: 8px;'), 'selected drop inspector percent suffix should sit away from three-digit values');
  assert.ok(dropEditorRateControlBlock.includes('height: 28px;') && dropEditorRateControlBlock.includes('padding: 0 7px;') && dropEditorRateControlBlock.includes('background: var(--fab-overlay-dark-18);') && dropEditorRateControlBlock.includes('overflow: hidden;'), 'selected drop inspector slider should own the dark backing box instead of relying on native range chrome');
  assert.ok(dropEditorRateTrackBlock.includes('left: 7px;') && dropEditorRateTrackBlock.includes('right: 7px;') && dropEditorRateTrackBlock.includes('border: 0;') && dropEditorRateTrackBlock.includes('background: var(--fab-overlay-dark-18);'), 'selected drop inspector custom track should be inset to the thumb radius to avoid endpoint tails');
  assert.ok(dropEditorRateFillBlock.includes('border-radius: 999px;'), 'selected drop inspector fill should be rounded without relying on a wider track border');
  assert.equal(dropRateTrackBlock.includes('linear-gradient'), false, 'drop chance slider styling should keep the flat-ui no-gradient contract');
  assert.equal(dropEditorRateTrackBlock.includes('linear-gradient'), false, 'selected drop inspector slider styling should keep the flat-ui no-gradient contract');
  assert.ok(dropEditorRateRangeBlock.includes('height: 26px;') && dropEditorRateRangeBlock.includes('padding: 0;') && dropEditorRateRangeBlock.includes('background: transparent;') && dropEditorRateRangeBlock.includes('box-shadow: none;'), 'selected drop inspector native range should remain a transparent thumb hit target over the custom track');
  assert.ok(dropEditorRateWebkitTrackBlock.includes('border: 0;') && dropEditorRateWebkitTrackBlock.includes('background: transparent;'), 'selected drop inspector WebKit native range track should not draw over the custom track');
  assert.ok(dropEditorRateMozTrackBlock.includes('border: 0;') && dropEditorRateMozTrackBlock.includes('background: transparent;'), 'selected drop inspector Firefox native range track should not draw over the custom track');
  assert.ok(dropEditorCountBlock.includes('display: grid;') && dropEditorCountBlock.includes('gap: 6px;'), 'selected drop inspector count editor should use a compact labeled field');
  assert.ok(dropEditorCountInputBlock.includes('min-height: 28px;') && dropEditorCountInputBlock.includes('text-align: center;'), 'selected drop inspector count input should match row count input geometry');
  assert.ok(dropEditorInspectorCountInputBlock.includes('height: 28px;') && dropEditorInspectorCountInputBlock.includes('min-height: 28px;') && dropEditorInspectorCountInputBlock.includes('padding: 4px;') && dropEditorInspectorCountInputBlock.includes('box-shadow: none;'), 'selected drop inspector count input should override generic inspector input chrome with chance-field geometry');
  assert.ok(dropInspectorButtonBlock.includes('min-height: 28px;') && dropInspectorButtonBlock.includes('padding: 0 9px;'), 'selected drop inspector text buttons should match the compact 28px sidebar rhythm');
  assert.ok(dropInspectorIconButtonBlock.includes('width: 28px;') && dropInspectorIconButtonBlock.includes('height: 28px;') && dropInspectorIconButtonBlock.includes('flex: 0 0 28px;'), 'selected drop inspector icon buttons should match the compact 28px sidebar rhythm');
  assert.ok(dropInspectorSearchInputBlock.includes('height: 28px;') && dropInspectorSearchInputBlock.includes('min-height: 28px;') && dropInspectorSearchInputBlock.includes('padding-block: 0;'), 'selected drop inspector search input should keep icon padding while using 28px height');
  assert.ok(dropInspectorCharacterFieldBlock.includes('height: 28px;') && dropInspectorCharacterFieldBlock.includes('min-height: 28px;') && dropInspectorCharacterFieldBlock.includes('padding: 3px 8px;'), 'selected drop inspector character modifier fields should override shared 36px field height');
  assert.ok(dropInspectorCharacterOperatorBlock.includes('height: 28px;') && dropInspectorCharacterOperatorBlock.includes('min-height: 28px;') && dropInspectorCharacterOperatorBlock.includes('padding: 0 6px;'), 'selected drop inspector character modifier operator select should keep compact 28px height');
  assert.ok(dropEditorActionsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));') && dropEditorActionsBlock.includes('margin-top: 0;'), 'selected drop rule actions should sit beneath the inspector title row');
  assert.ok(dropInspectorStackBlock.includes('grid-template-rows: auto auto minmax(0, 1fr);'), 'selected drop inspector should reserve fixed header, divider, and lower scroll rows');
  assert.ok(dropInspectorStackBlock.includes('height: 100%;') && dropInspectorStackBlock.includes('overflow: visible;'), 'selected drop inspector stack should allow the divider to span the full right inspector width');
  assert.ok(dropInspectorRouteBlock.includes('overflow: hidden;'), 'gathering task edit inspector should delegate selected-drop scrolling to the lower viewport');
  assert.ok(dropInspectorDividerBlock.includes('width: calc(100% + 24px);') && dropInspectorDividerBlock.includes('margin: 10px -12px 0;'), 'selected drop inspector divider should bleed through the right inspector padding');
  assert.ok(dropInspectorDividerBlock.includes('height: 1px;') && dropInspectorDividerBlock.includes('background: var(--fab-mv2-border);'), 'selected drop inspector should render a visible divider below the header');
  assert.ok(dropInspectorScrollBlock.includes('overflow-y: auto;') && dropInspectorScrollBlock.includes('overflow-x: hidden;'), 'selected drop lower editor content should own vertical scrolling without horizontal overflow');
  assert.ok(dropInspectorScrollBlock.includes('padding-top: 12px;') && dropInspectorScrollBlock.includes('gap: 12px;'), 'selected drop scroll viewport should visually separate lower cards from the divider');
  assert.equal(css.includes('.fabricate-manager-v2 .manager-v2-drop-actions'), false, 'drop row actions should not reserve row layout or styling');
  assert.equal(taskEditorIntermediateQuery.includes('.manager-v2-gathering-task-drop-row {\n    grid-template-columns: minmax(0, 1fr);'), false, 'task editor should not stack drop rows at the intermediate desktop width');
  assert.ok(taskEditorIntermediateQuery.includes('minmax(154px, 1.04fr) 54px minmax(150px, 1.38fr)'), 'intermediate task editor drop grid should preserve drop chance width while widening modifiers');
  assert.ok(dropTableRankedBlock.includes('--fab-mv2-task-drop-grid: 44px minmax(0, 0.92fr) minmax(220px, 1.35fr) 56px minmax(180px, 1.65fr);'), 'ranked-mode drop grid should prepend a narrow 44px rank column and take width from the component column while preserving drop chance and quantity widths');
  assert.ok(taskEditorIntermediateQuery.includes('--fab-mv2-task-drop-grid: 44px minmax(0, 0.96fr) minmax(154px, 1.04fr) 54px minmax(150px, 1.38fr);'), 'intermediate ranked-mode drop grid should keep drop chance and quantity widths while reducing the component column');
  assert.ok(dropRankCellBlock.includes('display: flex;') && dropRankCellBlock.includes('flex-direction: column;'), 'rank cell should stack the up button, label, and down button vertically');
  assert.ok(dropRankValueBlock.includes('text-align: center;') && dropRankValueBlock.includes('line-height: 1;'), 'rank value should sit centered between the buttons with a tight line height');
  assert.ok(dropRankButtonBlock.includes('width: 18px;') && dropRankButtonBlock.includes('height: 18px;'), 'rank reorder buttons should be small enough to stack inside the row');
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-gathering-task-drop-table-head,\n  .fabricate-manager-v2 .manager-v2-gathering-task-drop-row') && mediumQuery.includes('grid-template-columns: var(--fab-mv2-task-drop-grid);'),
    'medium manager-v2 layout should preserve the drop row grid and headers instead of duplicate row labels'
  );
  assert.equal(css.includes('.fabricate-manager-v2 .manager-v2-gathering-task-row .manager-v2-environment-reorder-stack'), false, 'task rows should not render environment reorder controls');
});

test('manager-v2 components browser defines drop target and compact responsive table geometry', () => {
  const tableBlock = blockFor('.fabricate-manager-v2 .manager-v2-components-table');
  const toolbarBlock = Array.from(css.matchAll(/\.fabricate-manager-v2 \.manager-v2-toolbar\s*\{[\s\S]*?\}/g))
    .map(match => match[0])
    .join('\n');
  const toolbarPrimaryBlock = blockFor('.fabricate-manager-v2 .manager-v2-toolbar-primary');
  const toolbarPillsBlock = blockFor('.fabricate-manager-v2 .manager-v2-toolbar-pills');
  const dropBlock = blockFor('.fabricate-manager-v2 .manager-v2-component-drop-zone');
  const tagSearchBlock = blockFor('.fabricate-manager-v2 .manager-v2-tag-search');
  const tagSuggestionsBlock = blockFor('.fabricate-manager-v2 .manager-v2-tag-suggestions');
  const selectedTagPillBlock = blockFor('.fabricate-manager-v2 .manager-v2-selected-tag-pill');
  const identityBlock = blockFor('.fabricate-manager-v2 .manager-v2-component-identity');
  const componentCopyBlock = blockFor('.fabricate-manager-v2 .manager-v2-component-identity .manager-v2-system-copy');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));

  assert.ok(
    css.includes('.fabricate-manager-v2[data-manager-v2-view="components"] .manager-v2-main'),
    'components route should reserve rows for header, drop target, toolbar, and table'
  );
  assert.ok(
    tableBlock.includes('--fab-mv2-component-grid: minmax(0, 1.42fr)'),
    'components table should define shrinkable compact columns for normal Foundry manager widths'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-components-table.has-no-tags.has-no-essences.has-progressive-difficulty'),
    'components table should have a no-tags/no-essences progressive grid variant'
  );
  assert.ok(dropBlock.includes('grid-template-columns: 42px minmax(0, 1fr);'), 'component drop zone should reserve icon and copy space');
  assert.ok(dropBlock.includes('margin: 12px;'), 'component drop zone should keep balanced vertical spacing around the toolbar');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-component-drop-zone.is-drop-active'), 'component drop zone should expose an active drag state');
  assert.ok(toolbarBlock.includes('display: grid;'), 'manager-v2 toolbar should own a grid layout for primary controls and auxiliary rows');
  assert.ok(toolbarBlock.includes('grid-template-columns: minmax(0, 1fr);'), 'manager-v2 toolbar grid should keep rows bounded to the main content width');
  assert.ok(toolbarPrimaryBlock.includes('display: flex;'), 'manager-v2 primary toolbar row should lay out controls as a flex row');
  assert.ok(toolbarPrimaryBlock.includes('flex-wrap: wrap;'), 'manager-v2 primary toolbar row should wrap controls without involving selected pills');
  assert.ok(toolbarPillsBlock.includes('display: flex;'), 'manager-v2 pill row should be its own flex row');
  assert.ok(toolbarPillsBlock.includes('flex-wrap: wrap;'), 'manager-v2 pill row should wrap selected tags independently');
  assert.ok(toolbarPillsBlock.includes('width: 100%;'), 'manager-v2 pill row should occupy a full toolbar row');
  assert.ok(tagSearchBlock.includes('position: relative;'), 'component tag search should anchor its suggestion list to the control');
  assert.ok(tagSearchBlock.includes('max-width: 320px;'), 'component tag search should keep bounded toolbar geometry');
  assert.ok(tagSuggestionsBlock.includes('position: absolute;'), 'component tag suggestions should overlay below the search field without shifting the toolbar');
  assert.ok(tagSuggestionsBlock.includes('max-height: 148px;'), 'component tag suggestions should be scroll bounded');
  assert.ok(selectedTagPillBlock.includes('padding-right: 4px;'), 'selected tag pills should reserve compact space for the remove button');
  assert.ok(
    identityBlock.includes('grid-template-columns: 46px minmax(0, 1fr);')
      || css.includes('.fabricate-manager-v2 .manager-v2-recipe-identity,\n.fabricate-manager-v2 .manager-v2-component-identity,\n.fabricate-manager-v2 .manager-v2-environment-identity'),
    'component identity should reserve thumbnail space'
  );
  assert.ok(
    componentCopyBlock.includes('max-height: 52px;') && componentCopyBlock.includes('overflow: hidden;'),
    'component identity copy should clamp inside the row instead of overflowing below the thumbnail'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-component-row') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium manager-v2 layout should stack component rows before columns become cramped'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-action-group.manager-v2-labeled-cell') && mediumQuery.includes('display: flex;'),
    'stacked component action groups should keep buttons in a compact action cluster'
  );
});

test('manager-v2 essence browser defines compact responsive table geometry', () => {
  const tableBlock = blockFor('.fabricate-manager-v2 .manager-v2-essences-table');
  const noSourceBlock = blockFor('.fabricate-manager-v2 .manager-v2-essences-table.has-no-source');
  const identityBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-identity');
  const sourceImageBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-source-cell-image');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));

  assert.ok(
    css.includes('.fabricate-manager-v2[data-manager-v2-view="essences"] .manager-v2-main'),
    'essences route should define route-specific rows'
  );
  assert.ok(
    blockFor('.fabricate-manager-v2[data-manager-v2-view="essences"] .manager-v2-main').includes('grid-template-rows: auto auto minmax(0, 1fr);'),
    'essences route should reserve rows for header, toolbar, and table'
  );
  assert.ok(
    tableBlock.includes('--fab-mv2-essence-grid: minmax(0, 1.55fr)'),
    'essences table should define shrinkable compact columns for normal Foundry manager widths'
  );
  assert.ok(
    noSourceBlock.includes('--fab-mv2-essence-grid: minmax(0, 1.7fr)'),
    'essences table should have a no-source grid variant when effect transfer is disabled'
  );
  assert.ok(identityBlock.includes('grid-template-columns: 44px minmax(0, 1fr);'), 'essence identity should reserve icon space');
  assert.ok(sourceImageBlock.includes('width: 36px;') && sourceImageBlock.includes('height: 36px;'), 'essence source cells should render stable image-only evidence');
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-essence-row') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium manager-v2 layout should stack essence rows before columns become cramped'
  );
});

test('manager-v2 essence edit route defines picker-based responsive geometry', () => {
  const mainBlock = blockFor('.fabricate-manager-v2[data-manager-v2-view="essence-edit"] .manager-v2-main');
  const editGridBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-edit-grid');
  const sourceSummaryBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-source-summary');
  const inspectorSourceSummaryBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-inspector-source-summary');
  const inspectorSourceActionsBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-inspector-source-actions');
  const warningActionBlock = blockFor('.fabricate-manager-v2 .manager-v2-button.is-warning-action,\n.fabricate-manager-v2 .manager-v2-icon-button.is-warning-action');
  const sourceDropBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-source-drop-zone .essence-source-trigger');
  const usageGridBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-usage-grid');
  const usageItemBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-usage-item');
  const iconTriggerBlock = blockFor('.fabricate-manager-v2 .essence-icon-picker-trigger');
  const sourceTriggerBlock = blockFor('.fabricate-manager-v2 .essence-source-trigger');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 680px)'));

  assert.ok(mainBlock.includes('grid-template-rows: minmax(0, 1fr);'), 'essence edit route should let the identity card be the first main content');
  assert.ok(editGridBlock.includes('grid-template-columns: var(--fab-mv2-essence-icon-column, 156px) minmax(0, 1fr);'), 'essence edit identity fields should reserve stable icon picker space');
  assert.ok(sourceSummaryBlock.includes('grid-template-columns: 54px minmax(0, 1fr) 34px;'), 'essence source summary should reserve source image, evidence, and clear action columns');
  assert.ok(!inspectorSourceSummaryBlock.includes('grid-template-columns: 54px minmax(0, 1fr) auto;'), 'inspector source summary should not crowd evidence and unlink into a three-column row');
  assert.ok(inspectorSourceSummaryBlock.includes('grid-template-columns: 54px minmax(0, 1fr);'), 'inspector source summary should be only the linked item evidence card');
  assert.ok(inspectorSourceActionsBlock.includes('margin-top: 10px;'), 'inspector source action row should sit below the linked item card');
  assert.ok(inspectorSourceActionsBlock.includes('display: grid;'), 'inspector source actions should use stable row geometry');
  assert.ok(inspectorSourceActionsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'inspector source actions should keep copy and unlink on the same row');
  assert.ok(!mediumQuery.includes('.fabricate-manager-v2 .manager-v2-essence-inspector-source-actions .manager-v2-button'), 'narrow manager-v2 layout should not stack the selected essence source actions');
  assert.ok(warningActionBlock.includes('var(--fab-warning'), 'unlink source should have an amber warning-action button style');
  assert.ok(sourceDropBlock.includes('width: 100%;'), 'essence source drop target should use the full source panel width');
  assert.ok(sourceDropBlock.includes('height: 84px;'), 'essence source drop target should have a stable wide drop-zone height');
  assert.ok(iconTriggerBlock.includes('grid-template-columns: 28px minmax(0, 1fr) 16px;'), 'icon picker trigger should be a real picker control, not a raw text field');
  assert.ok(sourceTriggerBlock.includes('aspect-ratio: 1 / 1;'), 'source picker should keep a stable drop target');
  assert.ok(usageGridBlock.includes('max-height: 132px;'), 'essence usage thumbnails should stay scroll-contained in the inspector');
  assert.ok(usageItemBlock.includes('aspect-ratio: 1 / 1;'), 'essence usage thumbnails should be square image-only controls');
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-essence-edit-grid')
      && mediumQuery.includes('.fabricate-manager-v2 .manager-v2-essence-source-summary'),
    'narrow manager-v2 layout should stack essence edit controls'
  );
});

test('manager-v2 environments browser and edit route define compact responsive geometry', () => {
  const toolbarBlock = blockFor('.fabricate-manager-v2 .manager-v2-environments-toolbar');
  const gatheringPanelBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-panel');
  const gatheringEnvironmentsPanelBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-panel-environments');
  const tableScrollBlock = blockFor('.fabricate-manager-v2 .manager-v2-table-scroll');
  const tableBlock = blockFor('.fabricate-manager-v2 .manager-v2-environments-table');
  const taskCountBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-task-count');
  const actionsBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-actions');
  const actionGridBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-action-grid');
  const reorderStackBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-reorder-stack');
  const editorShellBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-editor-shell');
  const editorViewBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-edit-view');
  const detailsGridBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-details-grid');
  const workspaceBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-workspace');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));

  assert.ok(
    toolbarBlock.includes('max-height: 100px;') && toolbarBlock.includes('overflow-y: auto;'),
    'environments toolbar should keep wrapped filters height-bounded instead of pushing the empty state down'
  );
  assert.ok(
    toolbarBlock.includes('align-content: flex-start;'),
    'environments toolbar should keep wrapped filter rows pinned to the top of its bounded scroll area'
  );
  assert.ok(
    gatheringPanelBlock.includes('min-height: 0;') && gatheringPanelBlock.includes('overflow: hidden;'),
    'gathering panels should participate in the manager-v2 bounded grid instead of expanding to content height'
  );
  assert.ok(
    gatheringEnvironmentsPanelBlock.includes('grid-template-rows: auto minmax(0, 1fr) auto;'),
    'environments gathering panel should reserve a bounded scroll row between toolbar and pagination'
  );
  assert.ok(
    tableScrollBlock.includes('overflow: auto;') && tableScrollBlock.includes('min-height: 0;'),
    'environment table scroll region should own internal overflow once bounded by the gathering panel'
  );
  assert.ok(
    tableBlock.includes('--fab-mv2-environment-grid: minmax(0, 1.72fr) minmax(86px, 0.42fr) 46px 72px 72px;'),
    'environments table should define five compact columns without reserving a reorder column'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-row {\n  position: relative;\n  min-height: 88px;\n}'),
    'environment rows should anchor hover overlays while keeping height stable around larger thumbnails'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-identity {\n  grid-template-columns: 120px minmax(0, 1fr);\n  align-self: center;\n  min-height: 68px;'),
    'environment identity should reserve and vertically center the larger scene thumbnail column'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-thumb {\n  display: block;\n  align-self: center;\n  width: 120px;\n  height: 68px;'),
    'environment thumbnails should reserve a larger centered scene-like image area'
  );
  assert.ok(taskCountBlock.includes('font-weight: 800;'), 'environment task count should render as plain emphasized text');
  assert.ok(actionsBlock.includes('grid-template-columns: 72px;'), 'environment row actions should only reserve edit duplicate delete controls');
  assert.ok(actionsBlock.includes('justify-content: end;'), 'environment row actions should stay compact on the right at desktop widths');
  assert.ok(actionsBlock.includes('justify-self: end;'), 'environment row actions should align to the right edge of their cell');
  assert.ok(!actionsBlock.includes('grid-template-columns: 72px 34px;'), 'environment row actions should not reserve a reorder stack column');
  assert.ok(actionGridBlock.includes('grid-template-columns: repeat(2, 34px);'), 'environment edit duplicate delete buttons should sit in a compact grid');
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-action-grid .manager-v2-icon-button.is-danger {\n  grid-column: 2;\n}'),
    'environment delete quick action should sit in the right column below the duplicate action'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-action-group.manager-v2-environment-actions.manager-v2-labeled-cell')
      && mediumQuery.includes('display: grid;')
      && mediumQuery.includes('grid-template-columns: minmax(88px, 0.35fr) 72px;')
      && mediumQuery.includes('justify-content: stretch;')
      && mediumQuery.includes('.fabricate-manager-v2 .manager-v2-environment-actions .manager-v2-environment-action-grid')
      && mediumQuery.includes('justify-self: end;')
      && mediumQuery.includes('margin-left: auto;'),
    'responsive environment row actions should stay right-aligned instead of inheriting the generic left-aligned action group layout'
  );
  assert.ok(
    reorderStackBlock.includes('position: absolute;')
      && reorderStackBlock.includes('inset: 0;')
      && reorderStackBlock.includes('grid-template-rows: 18px 18px;')
      && reorderStackBlock.includes('align-content: space-between;')
      && reorderStackBlock.includes('pointer-events: none;'),
    'environment move up/down hit areas should span hidden full-row top and bottom overlay bands'
  );
  assert.ok(
    !css.includes('.manager-v2-environment-row:hover .manager-v2-environment-reorder-stack')
      && !css.includes('.manager-v2-environment-row:focus-within .manager-v2-environment-reorder-stack'),
    'environment reorder overlay should not become visible from whole-row hover or focus'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-reorder-stack .manager-v2-icon-button {\n  width: 100%;\n  height: 18px;')
      && css.includes('background: var(--fab-overlay-dark-32);')
      && css.includes('opacity: 0;')
      && css.includes('.fabricate-manager-v2 .manager-v2-environment-reorder-stack .manager-v2-icon-button:hover,\n.fabricate-manager-v2 .manager-v2-environment-reorder-stack .manager-v2-icon-button:focus-visible {\n  opacity: 1;'),
    'environment reorder buttons should reveal only their own thin row-width overlay band on hover or keyboard focus'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-reorder-stack .manager-v2-icon-button:disabled {\n  opacity: 0;\n  pointer-events: auto;')
      && css.includes('.fabricate-manager-v2 .manager-v2-environment-reorder-stack .manager-v2-icon-button:disabled:hover,\n.fabricate-manager-v2 .manager-v2-environment-reorder-stack .manager-v2-icon-button:disabled:focus-visible {\n  opacity: 1;'),
    'disabled environment reorder bands should stay hidden until their own hover or keyboard focus'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-reorder-stack .manager-v2-icon-button:focus,\n.fabricate-manager-v2 .manager-v2-environment-reorder-stack .manager-v2-icon-button:focus-visible {\n  outline: none;\n  box-shadow: none;'),
    'environment reorder buttons should not inherit host focus outlines after click'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-row .manager-v2-status-cell'),
    'environment status cells should align the shared compact status toggle'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2[data-manager-v2-view="environment-edit"] .manager-v2-main'),
    'environment edit route should reserve scrollable editor space'
  );
  assert.ok(editorShellBlock.includes('overflow: auto;'), 'environment editor shell should own scroll containment at normal widths');
  assert.ok(
    css.includes('.fabricate-manager-v2[data-manager-v2-view="environment-edit"] .manager-v2-body') && css.includes('grid-template-columns: 220px minmax(0, 1fr);'),
    'environment edit route should replace the browse inspector with a two-region rail/editor grid'
  );
  assert.ok(editorViewBlock.includes('grid-template-rows: auto minmax(0, 1fr);'), 'environment editor should reserve details band plus scrollable workspace');
  assert.ok(
    detailsGridBlock.includes('grid-template-columns: minmax(300px, 1.02fr) minmax(360px, 1.1fr) minmax(230px, 0.58fr);'),
    'environment details band should expose identity, scene linkage, and status/evidence at normal widths'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-status-card {\n  display: flex;'),
    'environment details band should include a compact status/evidence card'
  );
  assert.ok(
    workspaceBlock.includes('grid-template-columns: minmax(220px, 0.45fr) minmax(420px, 1fr);'),
    'environment editor workspace should expose only task rail and selected task editor at normal widths'
  );
  assert.ok(
    !css.includes('manager-v2-environment-evidence-column'),
    'environment editor CSS should no longer reference the removed evidence column'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-validation-band'),
    'environment editor should style the collapsible validation band above the workspace'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-scene-drop-zone'),
    'environment editor should style the scene drag-drop zone'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .image-path-picker.is-button-only .image-path-picker-button'),
    'environment editor should style the button-only ImagePathPicker variant'
  );
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-environment-scene-card'), 'environment editor should define a linked scene card');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-task-tabs'), 'environment editor should define task tabs');
  assert.equal(css.includes('.fabricate-manager-v2 .manager-v2-environment-details-tabs'), false, 'environment editor should not define removed environment advanced tabs');
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-environment-row') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium manager-v2 layout should stack environment rows before columns become cramped'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-environment-editor-shell') && mediumQuery.includes('overflow: visible;'),
    'stacked environment edit layout should release nested scroll containment'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-environment-workspace') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'stacked environment editor should put details, task rail, editor, and evidence in one column'
  );
});

test('manager-v2 system edit view defines scoped stable form and toggle layout', () => {
  const mainBlock = blockFor('.fabricate-manager-v2 .manager-v2-system-edit-main');
  const formBlock = blockFor('.fabricate-manager-v2 .manager-v2-system-edit-form');
  const gridBlock = blockFor('.fabricate-manager-v2 .manager-v2-edit-grid');
  const fieldInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-field input,\n.fabricate-manager-v2 .manager-v2-field select');
  const toggleListBlock = blockFor('.fabricate-manager-v2 .manager-v2-toggle-list');
  const toggleRowBlock = blockFor('.fabricate-manager-v2 .manager-v2-toggle-row');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));
  const narrowQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 680px)'));

  assert.ok(mainBlock.includes('grid-template-rows: auto minmax(0, 1fr);'), 'system edit main should reserve scrollable form space');
  assert.ok(formBlock.includes('overflow: auto;'), 'system edit form should own scroll containment at normal widths');
  assert.ok(gridBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'system edit fields should use a stable two-column grid');
  assert.ok(fieldInputBlock.includes('height: 36px;'), 'system edit inputs and selects should have stable control height');
  assert.ok(toggleListBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'feature toggles should use stable two-column rows');
  assert.ok(toggleRowBlock.includes('grid-template-columns: 20px minmax(0, 1fr);'), 'toggle rows should reserve checkbox width');
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-toggle-list') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium edit layout should collapse feature toggles before text becomes cramped'
  );
  assert.ok(
    narrowQuery.includes('.fabricate-manager-v2 .manager-v2-edit-card-heading') && narrowQuery.includes('flex-direction: column;'),
    'narrow edit card headings should stack actions under titles'
  );
});

test('manager-v2 pagination footer uses scoped chrome with stable summary, nav, and per-page controls', () => {
  const block = blockFor('.fabricate-manager-v2 .manager-v2-pagination');

  assert.ok(block.includes('display: flex;'), 'pagination footer should layout horizontally');
  assert.ok(block.includes('justify-content: space-between;'), 'pagination footer should distribute summary, nav, per-page across the row');
  assert.ok(block.includes('flex-wrap: wrap;'), 'pagination footer should wrap on narrow widths');
  assert.ok(block.includes('border-top: 1px solid var(--fab-mv2-border);'), 'pagination footer should anchor to the table with a manager-v2 border');
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-pagination-page'),
    'pagination should expose a stable Page-of label for keyboard users'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-pagination-size select'),
    'pagination should style the per-page selector inside the manager-v2 scope'
  );
});

test('design-system colour tokens are declared in the theme layer as the agreed source of truth', () => {
  const rootBlock = blockFor(':root');
  const themeBlock = [
    blockFor(':root,\n:root[data-fabricate-theme="fabricate"],\n.fabricate[data-fabricate-theme="fabricate"]'),
    blockFor(':root[data-fabricate-theme="mythwright"],\n.fabricate[data-fabricate-theme="mythwright"]')
  ].join('\n');

  for (const token of [
    '--fab-bg-0:',
    '--fab-bg-1:',
    '--fab-bg-2:',
    '--fab-bg-3:',
    '--fab-surface:',
    '--fab-surface-soft:',
    '--fab-surface-raised:',
    '--fab-border:',
    '--fab-border-strong:',
    '--fab-text:',
    '--fab-text-muted:',
    '--fab-text-subtle:',
    '--fab-accent:',
    '--fab-accent-hover:',
    '--fab-accent-strong:',
    '--fab-accent-soft:',
    '--fab-info:',
    '--fab-info-soft:',
    '--fab-warning:',
    '--fab-warning-soft:',
    '--fab-danger:',
    '--fab-danger-soft:',
    '--fab-purple:',
    '--fab-purple-soft:'
  ]) {
    assert.ok(themeBlock.includes(token), `theme layer should declare design-system colour token ${token.replace(':', '')}`);
  }

  for (const token of [
    '--fab-space-1:',
    '--fab-space-2:',
    '--fab-space-3:',
    '--fab-space-4:',
    '--fab-space-5:',
    '--fab-space-6:'
  ]) {
    assert.ok(rootBlock.includes(token), `root layer should declare design-system layout token ${token.replace(':', '')}`);
  }
});

test('manager-v2 icon buttons normalize host button defaults and keep pointer targets stable', () => {
  const block = blockFor('.fabricate-manager-v2 .manager-v2-button,\n.fabricate-manager-v2 .manager-v2-icon-button');
  const iconBlocks = Array.from(css.matchAll(/\.fabricate-manager-v2 \.manager-v2-icon-button\s*\{[\s\S]*?\}/g));
  const iconBlock = iconBlocks.at(-1)?.[0] || '';

  assert.ok(block.includes('appearance: none;'), 'manager-v2 buttons should clear host appearance');
  assert.ok(block.includes('-webkit-appearance: none;'), 'manager-v2 buttons should clear WebKit host appearance');
  assert.ok(block.includes('box-sizing: border-box;'), 'manager-v2 buttons should use border-box sizing');
  assert.ok(block.includes('display: inline-flex;'), 'manager-v2 buttons should center contents with inline-flex');
  assert.ok(block.includes('min-width: 0;'), 'manager-v2 buttons should clear host min-width defaults');
  assert.ok(iconBlock.includes('width: 34px;'), 'icon buttons should have a stable width of at least 32px');
  assert.ok(iconBlock.includes('height: 34px;'), 'icon buttons should have a stable height of at least 32px');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-button:disabled'), 'disabled manager-v2 buttons should have explicit disabled styling');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-button:not(:disabled):hover'), 'manager-v2 hover styles should not target disabled buttons');
});
