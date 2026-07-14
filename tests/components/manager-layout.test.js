import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../../styles/fabricate.css');
const colorPickerPath = resolve(__dirname, '../../src/ui/svelte/components/ManagerColorPicker.svelte');
const css = readFileSync(cssPath, 'utf8');
const colorPickerSource = readFileSync(colorPickerPath, 'utf8');

function blockFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\}`));
  return match?.[0] || '';
}

test('manager root defines a scoped responsive app container', () => {
  const block = blockFor('.fabricate-manager');

  assert.ok(block.includes('container-type: inline-size;'), 'manager should use container queries');
  assert.ok(block.includes('container-name: fabricate-manager;'), 'manager should name its container');
  assert.ok(block.includes('isolation: isolate;'), 'manager should isolate its shell');
  assert.ok(block.includes('height: 100%;'), 'manager should fill the ApplicationV2 body');
  assert.ok(block.includes('overflow: hidden;'), 'manager shell should own overflow');
});

test('Fabricate app shells suppress host click focus outlines while preserving keyboard focus', () => {
  const managerFocusBlock = blockFor('.fabricate-manager button:focus,\n.fabricate-manager input:focus,\n.fabricate-manager select:focus,\n.fabricate-manager textarea:focus,\n.fabricate-manager [tabindex]:focus');
  const managerFocusVisibleBlock = blockFor('.fabricate-manager button:focus-visible,\n.fabricate-manager input:focus-visible,\n.fabricate-manager select:focus-visible,\n.fabricate-manager [tabindex]:focus-visible');
  const shellFocusBlock = blockFor('.fabricate-app button:focus,\n.fabricate-app input:focus,\n.fabricate-app select:focus,\n.fabricate-app textarea:focus,\n.fabricate-app [tabindex]:focus');
  const shellFocusVisibleBlock = blockFor('.fabricate-app button:focus-visible,\n.fabricate-app input:focus-visible,\n.fabricate-app select:focus-visible,\n.fabricate-app textarea:focus-visible,\n.fabricate-app [tabindex]:focus-visible');

  assert.ok(managerFocusBlock.includes('outline: none;') && managerFocusBlock.includes('box-shadow: none;'), 'manager controls should clear host click focus outlines');
  assert.ok(shellFocusBlock.includes('outline: none;') && shellFocusBlock.includes('box-shadow: none;'), 'unified Fabricate shell controls should clear host click focus outlines');
  assert.ok(managerFocusVisibleBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'manager keyboard focus should remain visible');
  assert.ok(shellFocusVisibleBlock.includes('outline: 2px solid var(--fab-accent);'), 'unified shell keyboard focus should remain visible');
});

test('manager character modifier search suggestions keep icons in row flow', () => {
  const searchIconBlock = blockFor('.fabricate-manager .manager-search > i');
  const characterModifierSuggestionBlock = blockFor('.fabricate-manager .manager-tag-suggestion.manager-character-modifier-add-suggestion');
  const characterModifierSuggestionIconBlock = blockFor('.fabricate-manager .manager-character-modifier-add-suggestion > i');

  assert.ok(
    searchIconBlock.includes('position: absolute;') && searchIconBlock.includes('left: 11px;'),
    'search field leading icon should remain positioned inside the input chrome'
  );
  assert.equal(
    css.includes('.fabricate-manager .manager-search i {\n  position: absolute;'),
    false,
    'search icon positioning must not catch suggestion icons inside search popovers'
  );
  assert.ok(
    characterModifierSuggestionBlock.includes('grid-template-columns: 22px minmax(0, 1fr);')
      && characterModifierSuggestionBlock.includes('min-height: 32px;')
      && characterModifierSuggestionBlock.includes('padding: var(--fab-space-1) var(--fab-space-2);'),
    'character modifier suggestions should use the same icon column and row rhythm as availability menu options'
  );
  assert.ok(
    characterModifierSuggestionIconBlock.includes('text-align: center;'),
    'character modifier suggestion icons should be centered inside the fixed icon column'
  );
});

test('manager character modifier search suggestions render with availability-style icon geometry', async () => {
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
          <main class="fabricate-manager">
            <div class="harness-grid">
              <section>
                <div class="harness-availability-anchor">
                  <button type="button" class="manager-availability-menu-button">
                    <span>Biomes</span>
                    <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                  </button>
                  <div class="manager-availability-menu" role="listbox" aria-label="Biomes">
                    <button type="button" class="manager-availability-option" role="option">
                      <i class="fa-solid fa-tree" aria-hidden="true"></i>
                      <span>Ancient Forest</span>
                    </button>
                    <button type="button" class="manager-availability-option" role="option">
                      <i class="fa-solid fa-mountain" aria-hidden="true"></i>
                      <span>High Mountain</span>
                    </button>
                  </div>
                </div>
              </section>

              <section>
                <label class="manager-search is-compact manager-character-modifier-add-search">
                  <i class="fa-solid fa-search" aria-hidden="true"></i>
                  <input type="search" value="wis" aria-label="Search character modifiers">
                  <div class="manager-tag-suggestions manager-character-modifier-add-suggestions" role="listbox" aria-label="Character modifiers">
                    <button type="button" class="manager-tag-suggestion manager-character-modifier-add-suggestion" role="option">
                      <i class="fa-solid fa-user" aria-hidden="true"></i>
                      <span>Wisdom modifier</span>
                    </button>
                    <button type="button" class="manager-tag-suggestion manager-character-modifier-add-suggestion" role="option">
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
        availabilityRows: Array.from(document.querySelectorAll('.manager-availability-option')).map(rowFor),
        characterRows: Array.from(document.querySelectorAll('.manager-character-modifier-add-suggestion')).map(rowFor)
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

test('manager body starts as a three-region grid and stacks at narrow width', () => {
  const bodyBlock = blockFor('.fabricate-manager .manager-body');

  assert.ok(
    bodyBlock.includes('grid-template-columns: 220px minmax(0, 1fr) 300px;'),
    'normal manager layout should have rail, main region, and inspector'
  );
  assert.ok(
    css.includes('@container fabricate-manager (max-width: 1120px)'),
    'manager should stack before the center table becomes unreadable'
  );
  assert.ok(
    css.includes('@container fabricate-manager (max-width: 680px)'),
    'manager should define a narrow container query'
  );
  assert.ok(
    css.includes('grid-template-columns: 1fr;'),
    'narrow manager layout should stack to one column'
  );
  assert.ok(
    css.includes('grid-template-columns: minmax(0, 1.55fr) minmax(92px, 0.42fr) 72px 118px;'),
    'normal systems table should use compact System, Resolution, Status, and Actions columns'
  );
  assert.ok(
    css.includes('min-width: 0;'),
    'manager table rows should avoid forcing default-width horizontal overflow'
  );
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-table-head') && mediumQuery.includes('display: none;'),
    'medium manager layout should switch rows to stacked cards before row actions become hidden'
  );
});

test('manager systems text and action cells are constrained at normal widths', () => {
  const nameBlock = blockFor('.fabricate-manager .manager-system-name');
  const descriptionBlock = blockFor('.fabricate-manager .manager-system-description');

  assert.ok(nameBlock.includes('-webkit-line-clamp: 2;'), 'row names should clamp instead of overflowing rows');
  assert.ok(descriptionBlock.includes('-webkit-line-clamp: 1;'), 'row descriptions should stay on one line inside compact rows');
  const gatheringNameClampBlock = css.match(
    /\.manager-environment-identity \.manager-system-name,[\s\S]*?\.manager-gathering-events-table \.manager-gathering-event-identity \.manager-system-name\s*\{[^}]*\}/
  );
  assert.ok(
    gatheringNameClampBlock
      && gatheringNameClampBlock[0].includes(
        '.manager-gathering-tasks-table .manager-gathering-task-identity .manager-system-name'
      )
      && gatheringNameClampBlock[0].includes('-webkit-line-clamp: 1;'),
    'gathering identity rows (environments, tasks, and events) should clamp the name to one line so the 64px thumbnail drives row height and image + text stay centered'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-inspector-name {\n  display: -webkit-box;')
      && css.includes('-webkit-line-clamp: 3;'),
    'inspector names should stay readable without dominating the inspector'
  );
  assert.ok(!css.includes('.fabricate-manager .manager-count-cluster'), 'system row counts should not duplicate the inspector counts');
  assert.ok(css.includes('.fabricate-manager .manager-system-row .manager-action-group'), 'system row actions should have stable width rules');
  assert.ok(css.includes('.fabricate-manager .manager-system-row:focus-visible'), 'system rows should own the accessible focus state');
  assert.ok(css.includes('overflow-wrap: break-word;'), 'text should avoid single-letter wrapping unless needed for long strings');
});

test('manager systems status cells use stable interactive on-off toggles', () => {
  const toggleBlock = blockFor('.fabricate-manager .manager-status-toggle');
  const onBlock = blockFor('.fabricate-manager .manager-status-toggle.is-on');
  const offBlock = blockFor('.fabricate-manager .manager-status-toggle.is-off');
  const trackBlock = blockFor('.fabricate-manager .manager-status-toggle-track');
  const knobBlock = blockFor('.fabricate-manager .manager-status-toggle-knob');
  const onKnobBlock = blockFor('.fabricate-manager .manager-status-toggle.is-on .manager-status-toggle-knob');
  const focusBlock = blockFor('.fabricate-manager .manager-status-toggle:focus');
  const focusVisibleBlock = blockFor('.fabricate-manager .manager-status-toggle:focus-visible');

  assert.ok(toggleBlock.includes('appearance: none;'), 'system status toggles should normalize host button styles');
  assert.ok(toggleBlock.includes('width: auto;'), 'system status toggles should size to their On/Off label instead of filling the status column');
  assert.ok(toggleBlock.includes('max-width: 78px;'), 'system status toggles should keep compact geometry');
  assert.ok(toggleBlock.includes('border-radius: 999px;'), 'system status toggles should read as toggle buttons');
  assert.ok(focusBlock.includes('outline: none;') && focusBlock.includes('box-shadow: none;'), 'mouse focus should not inherit the host orange focus ring');
  assert.ok(focusVisibleBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'keyboard focus should keep a manager focus-visible ring');
  assert.ok(onBlock.includes('var(--fab-success'), 'enabled status should use the manager success accent family');
  // Issue 643: OFF is now NEUTRAL (bg-3 / border-strong), not amber. A disabled
  // recipe, component or environment is an ordinary state, not a warning. The
  // state colour moved onto the TRACK via the local --fab-toggle-* properties,
  // so these assertions read the custom-property declarations, not a background.
  assert.ok(offBlock.includes('var(--fab-bg-3)'), 'disabled status should read as a neutral off switch, not a warning');
  assert.ok(offBlock.includes('var(--fab-border-strong)'), 'the off track should keep a visible edge');
  // The switch sets `border: 0` on the BUTTON, so a `:hover { border-color }` rule on
  // the button is inert. The hover affordance has to live on the TRACK, which is the
  // part with an edge — otherwise every switch in the manager has no hover state at all.
  const toggleHoverBlock = blockFor(
    '.fabricate-manager .manager-status-toggle:not(:disabled, .is-disabled):hover .manager-status-toggle-track'
  );
  assert.ok(
    toggleHoverBlock.includes('border-color:') && toggleHoverBlock.includes('background:'),
    'hovering a switch must visibly change its track'
  );
  assert.equal(
    /\.manager-status-toggle:hover \{/.test(css),
    false,
    'a hover rule on the border-less button itself is dead code'
  );
  assert.ok(trackBlock.includes('width: 34px;'), 'toggle track should use the 34x20 switch geometry');
  assert.ok(trackBlock.includes('height: 20px;'), 'toggle track should use the 34x20 switch geometry');
  assert.ok(trackBlock.includes('background: var(--fab-toggle-track);'), 'the track should carry the state colour');
  assert.ok(knobBlock.includes('width: 14px;'), 'toggle knob should use the 14x14 switch geometry');
  assert.ok(knobBlock.includes('transition: transform'), 'toggle knob should expose a clear state change');
  // 34px track - 2px inset - 14px knob - 2px inset = 14px of travel (left 2 -> 16).
  assert.ok(onKnobBlock.includes('transform: translateX(14px);'), 'enabled status should move the toggle knob on');
});

test('manager selected system scope is static text with a return-to-library control', () => {
  const scopeBlock = blockFor('.fabricate-manager .manager-scope-card');
  const scopeTitleBlock = blockFor('.fabricate-manager .manager-scope-name');
  const returnBlock = blockFor('.fabricate-manager .manager-scope-return');
  const returnFocusBlock = blockFor('.fabricate-manager .manager-scope-return:hover,\n.fabricate-manager .manager-scope-return:focus-visible');
  const focusBlock = blockFor('.fabricate-manager button:focus-visible,\n.fabricate-manager input:focus-visible,\n.fabricate-manager select:focus-visible,\n.fabricate-manager [tabindex]:focus-visible');

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
  assert.ok(returnFocusBlock.includes('border-color: var(--fab-mv2-border-strong);'), 'return focus should stay within manager styling');
  assert.ok(focusBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'manager focus should remain visible');
  assert.equal(scopeBlock.includes('orange'), false, 'scope card should not use orange focus styling');
  assert.equal(scopeBlock.includes('red'), false, 'scope card should not use red focus styling');
});

test('manager nav buttons clear host mouse focus and keep green keyboard focus', () => {
  const navFocusBlock = blockFor('.fabricate-manager .manager-nav-button:focus');
  const activeNavFocusBlock = blockFor('.fabricate-manager .manager-nav-button.is-active:focus');
  const navFocusVisibleBlock = blockFor('.fabricate-manager .manager-nav-button:focus-visible');

  assert.ok(navFocusBlock.includes('outline: none;'), 'mouse focus on nav buttons should not inherit the host outline');
  assert.ok(navFocusBlock.includes('box-shadow: none;'), 'mouse focus on nav buttons should not inherit the host orange focus shadow');
  assert.ok(activeNavFocusBlock.includes('box-shadow: inset 3px 0 0 var(--fab-mv2-accent);'), 'active nav focus should keep the active left accent');
  assert.ok(navFocusVisibleBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'keyboard focus on nav buttons should use the manager accent');
  assert.equal(navFocusBlock.includes('orange'), false, 'nav focus should not use orange');
  assert.equal(navFocusVisibleBlock.includes('orange'), false, 'nav keyboard focus should not use orange');
});

test('manager gathering rail submenu controls clear host mouse focus and keep green keyboard focus', () => {
  const expandedGroupBlock = blockFor('.fabricate-manager .manager-nav-group.is-expanded');
  const parentBlock = blockFor('.fabricate-manager .manager-nav-parent');
  const expandedParentBlock = blockFor('.fabricate-manager .manager-nav-group.is-expanded .manager-nav-parent');
  const expandedParentHoverBlock = blockFor('.fabricate-manager .manager-nav-group.is-expanded .manager-nav-parent:hover');
  const submenuBlock = blockFor('.fabricate-manager .manager-nav-submenu');
  const toggleBlock = blockFor('.fabricate-manager .manager-nav-toggle');
  const expandedToggleBlock = blockFor('.fabricate-manager .manager-nav-group.is-expanded .manager-nav-toggle');
  const toggleFocusBlock = blockFor('.fabricate-manager .manager-nav-toggle:focus');
  const toggleFocusVisibleBlock = blockFor('.fabricate-manager .manager-nav-toggle:focus-visible');
  const subitemBlock = blockFor('.fabricate-manager .manager-nav-subitem');
  const subitemFocusBlock = blockFor('.fabricate-manager .manager-nav-subitem:focus');
  const activeSubitemBlock = blockFor('.fabricate-manager .manager-nav-subitem.is-active');
  const activeSubitemFocusBlock = blockFor('.fabricate-manager .manager-nav-subitem.is-active:focus');
  const subitemFocusVisibleBlock = blockFor('.fabricate-manager .manager-nav-subitem:focus-visible');

  assert.ok(expandedGroupBlock.includes('border-radius: 8px;'), 'expanded gathering nav should read as one grouped container');
  assert.ok(expandedGroupBlock.includes('background: var(--fab-overlay-light-035);'), 'expanded gathering nav should use a soft background');
  assert.ok(expandedGroupBlock.includes('box-shadow: inset 0 0 0 1px var(--fab-mv2-border);'), 'expanded gathering nav should draw chrome without shifting contents');
  assert.equal(expandedGroupBlock.includes('padding:'), false, 'expanded gathering nav should not add layout padding that shifts the parent row');
  assert.equal(expandedGroupBlock.includes('border:'), false, 'expanded gathering nav should not add layout border that shifts the parent row');
  assert.ok(parentBlock.includes('grid-template-columns: 24px minmax(0, 1fr) auto;'), 'gathering parent should keep count chips inside the row before the toggle');
  assert.ok(expandedParentBlock.includes('border-color: transparent;'), 'expanded gathering parent should not use selected border styling');
  assert.ok(expandedParentBlock.includes('background: transparent;'), 'expanded gathering parent should not use selected fill styling');
  assert.ok(expandedParentBlock.includes('box-shadow: none;'), 'expanded gathering parent should not use the selected left accent');
  assert.ok(expandedParentHoverBlock.includes('background: var(--fab-overlay-light-04);'), 'expanded gathering parent may have a subtle hover without becoming selected');
  assert.ok(toggleBlock.includes('top: 4px;') && toggleBlock.includes('right: 4px;'), 'gathering toggle should have stable collapsed geometry');
  assert.equal(expandedToggleBlock, '', 'expanded gathering toggle should not override collapsed geometry');
  assert.ok(submenuBlock.includes('padding-left: var(--fab-space-3);'), 'gathering submenu entries should be nested inside the group');
  assert.ok(subitemBlock.includes('grid-template-columns: 20px minmax(0, 1fr) auto;'), 'gathering submenu entries should keep count chips inside their rows');
  // Issue 643: the rail's selected state is an IDENTITY cue ("you are here"), so it
  // moved off the success family onto the accent family. Success stays reserved for
  // the enabled/disabled status the manager screens' rows report.
  assert.ok(activeSubitemBlock.includes('background: var(--fab-accent-soft);'), 'only selected gathering submenu entries should use selected fill');
  assert.ok(activeSubitemBlock.includes('border-color: var(--fab-accent-border);'), 'selected gathering submenu entries should carry the accent edge');
  assert.equal(activeSubitemBlock.includes('var(--fab-success'), false, 'the rail selected state should not reuse the enabled-status success family');
  assert.ok(activeSubitemBlock.includes('box-shadow: inset 3px 0 0 var(--fab-mv2-accent);'), 'selected gathering submenu entries should keep the active left accent');
  assert.ok(toggleFocusBlock.includes('outline: none;'), 'mouse focus on gathering toggle should not inherit the host outline');
  assert.ok(toggleFocusBlock.includes('box-shadow: none;'), 'mouse focus on gathering toggle should not inherit the host orange focus shadow');
  assert.ok(toggleFocusVisibleBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'keyboard focus on gathering toggle should use the manager accent');
  assert.ok(subitemFocusBlock.includes('outline: none;'), 'mouse focus on gathering submenu entries should not inherit the host outline');
  assert.ok(subitemFocusBlock.includes('box-shadow: none;'), 'mouse focus on gathering submenu entries should not inherit the host orange focus shadow');
  assert.ok(activeSubitemFocusBlock.includes('box-shadow: inset 3px 0 0 var(--fab-mv2-accent);'), 'active gathering submenu focus should keep the active left accent');
  assert.ok(subitemFocusVisibleBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'keyboard focus on gathering submenu entries should use the manager accent');
  assert.equal(toggleFocusBlock.includes('orange'), false, 'gathering toggle focus should not use orange');
  assert.equal(subitemFocusVisibleBlock.includes('orange'), false, 'gathering submenu keyboard focus should not use orange');
});

test('manager inspector count labels wrap without truncation', () => {
  const factBlock = blockFor('.fabricate-manager .manager-fact');
  const factLineBlock = blockFor('.fabricate-manager .manager-fact-line');
  const factLeadingBlock = blockFor('.fabricate-manager .manager-fact-leading');
  const featureListBlock = blockFor('.fabricate-manager .manager-feature-list');
  const conditionShortcutListBlock = blockFor('.fabricate-manager .manager-condition-shortcut-list');
  const conditionShortcutLabelBlock = blockFor('.fabricate-manager .manager-condition-shortcut-label');
  const conditionShortcutSelectBlock = blockFor('.fabricate-manager .manager-condition-shortcut select');

  assert.ok(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'count facts should use a two-column inspector grid');
  assert.ok(factBlock.includes('display: block;'), 'count facts should render one phrase instead of wrapping separate flex children');
  assert.ok(!factBlock.includes('display: flex;'), 'count facts should not split values and labels into separate flex items');
  const factInlineBlock = blockFor('.fabricate-manager .manager-fact-grid-inline .manager-fact');
  assert.ok(factInlineBlock.includes('display: flex;'), 'inline fact grids lay value and label on one row');
  assert.ok(factInlineBlock.includes('gap:'), 'inline facts keep a gap so value and label do not collide');
  assert.ok(factLineBlock.includes('display: inline;'), 'count facts should keep value and label in normal inline text flow');
  assert.ok(factLeadingBlock.includes('white-space: nowrap;'), 'count facts should keep the value and first label word together');
  assert.ok(!factBlock.includes('white-space: nowrap;'), 'count fact cards should not force single-line labels');
  assert.ok(factLineBlock.includes('overflow-wrap: break-word;'), 'count fact text should wrap at word boundaries with long-word fallback');
  assert.ok(!factLineBlock.includes('overflow: hidden;'), 'count fact text should not clip full labels');
  assert.ok(!factLineBlock.includes('text-overflow: ellipsis;'), 'count fact text should not ellipsize full labels');
  assert.ok(!factLineBlock.includes('overflow-wrap: anywhere;'), 'count facts should not allow character-level wrapping');
  assert.ok(css.includes('.fabricate-manager .manager-fact.is-off'), 'disabled count facts should span the count grid');
  assert.ok(css.includes('grid-column: 1 / -1;'), 'disabled count facts should have enough width for label-first text');
  assert.ok(css.includes('.fabricate-manager .manager-fact strong.is-disabled'), 'disabled count values should preserve emphasis');
  assert.ok(featureListBlock.includes('align-items: flex-start;'), 'feature pills should align to the top of the card');
  assert.ok(featureListBlock.includes('place-content: flex-start flex-start;'), 'feature pills should align to the top-left of the card');
  assert.ok(conditionShortcutListBlock.includes('grid-template-columns: minmax(0, 1fr);'), 'condition shortcut card should keep compact one-column inspector controls');
  assert.ok(conditionShortcutListBlock.includes('gap: var(--fab-space-2);'), 'condition shortcut controls should have stable spacing');
  assert.ok(conditionShortcutLabelBlock.includes('display: inline-flex;'), 'condition shortcut labels should align icons and text');
  assert.ok(conditionShortcutSelectBlock.includes('font-weight: 400;'), 'condition shortcut select text should not inherit bold label weight');
});

test('manager empty states use refined heading and setup-panel styling', () => {
  const emptyIconBlock = blockFor('.fabricate-manager .manager-empty > div > i');
  const emptyLayerIconBlock = blockFor('.fabricate-manager .manager-empty > div > i.fa-layer-group');
  const emptyHeadingBlock = blockFor('.fabricate-manager .manager-empty h3');
  const setupCardBlock = blockFor('.fabricate-manager .manager-setup-card');
  const setupHeaderBlock = blockFor('.fabricate-manager .manager-setup-card-header');
  const setupListBlock = blockFor('.fabricate-manager .manager-setup-list');
  const setupLinksBlock = blockFor('.fabricate-manager .manager-setup-links');

  assert.ok(emptyIconBlock.includes('font-size: 1.55rem;'), 'generic empty-state icons should be larger than body text');
  assert.ok(emptyLayerIconBlock.includes('font-size: 1.9rem;'), 'no-systems empty icon should be more prominent');
  assert.ok(emptyHeadingBlock.includes('font-weight: 600;'), 'empty-state headings should be lighter than heavy admin titles');
  assert.ok(emptyHeadingBlock.includes('font-size: 0.98rem;'), 'empty-state headings should stay compact');
  assert.ok(setupCardBlock.includes('display: grid;'), 'no-systems inspector setup panel should use compact grid layout');
  assert.ok(setupCardBlock.includes('border: 1px solid var(--fab-mv2-border);'), 'setup panel should use manager flat borders');
  assert.ok(setupHeaderBlock.includes('grid-template-columns: 38px minmax(0, 1fr);'), 'setup panel should reserve icon space');
  assert.ok(setupListBlock.includes('line-height: 1.35;'), 'setup tips should stay dense and readable');
  assert.ok(setupLinksBlock.includes('flex-wrap: wrap;'), 'setup links should wrap in narrow inspectors');
});

test('manager gathering rules inspector stacks descriptions above normal-weight selects', () => {
  const ruleRowBlock = blockFor('.fabricate-manager .manager-rule-row');
  const ruleCopyBlock = blockFor('.fabricate-manager .manager-rule-copy');
  const ruleCopyDescriptionBlock = blockFor('.fabricate-manager .manager-rule-copy span');
  const ruleFieldBlock = blockFor('.fabricate-manager .manager-rule-field');
  const ruleInputBlock = blockFor('.fabricate-manager .manager-rule-field select,\n.fabricate-manager .manager-rule-stepper input');

  assert.ok(ruleRowBlock.includes('grid-template-columns: 34px minmax(0, 1fr);'), 'rule rows should place icon and description on the same row');
  assert.ok(ruleCopyBlock.includes('display: flex;') && ruleCopyBlock.includes('flex-direction: column;'), 'rule copy should stack label and description beside the icon');
  assert.ok(ruleCopyDescriptionBlock.includes('color: var(--fab-mv2-text-muted);'), 'rule descriptions should read as supporting copy');
  assert.ok(ruleFieldBlock.includes('grid-column: 2;'), 'rule selects should sit underneath the description column');
  assert.ok(ruleFieldBlock.includes('font-weight: 400;'), 'rule field text should not force bold select text');
  assert.ok(ruleInputBlock.includes('font-weight: 400;'), 'rule select and input text should not inherit bold labels');
  assert.equal(css.includes('.fabricate-manager .manager-gathering-settings-summary'), false, 'settings center panel should not keep the duplicated rules summary');
});

test('manager gathering settings condition panels use a two-column responsive grid', () => {
  const settingsBlock = blockFor('.fabricate-manager .manager-gathering-settings');
  const panelBlock = blockFor('.fabricate-manager .manager-condition-panel');
  const addBlock = blockFor('.fabricate-manager .manager-condition-add');
  const regionAddBlock = blockFor('.fabricate-manager .manager-region-add');
  const biomeAddBlock = blockFor('.fabricate-manager .manager-biome-add');
  const pillBlock = blockFor('.fabricate-manager .manager-condition-pill');
  const regionPillBlock = blockFor('.fabricate-manager .manager-vocabulary-pill.is-region');
  const biomePillBlock = blockFor('.fabricate-manager .manager-vocabulary-pill.is-biome');
  const biomeCombinedTriggerBlock = blockFor('.fabricate-manager .manager-condition-pill .essence-icon-picker-trigger.icon-only.manager-biome-combined-trigger');
  const biomeCombinedTriggerIconBlock = blockFor('.fabricate-manager .manager-condition-pill .essence-icon-picker-trigger.icon-only.manager-biome-combined-trigger i');
  const colorPickerPopoverBlock = blockFor('.fabricate-manager .manager-color-picker-popover');
  const colorPresetGridBlock = blockFor('.fabricate-manager .manager-color-preset-grid');
  const colorCustomInputBlock = blockFor('.fabricate-manager .manager-color-custom input');
  const labelInputBlock = blockFor('.fabricate-manager .manager-condition-label-input');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));

  assert.ok(settingsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'settings conditions should sit side by side at normal widths');
  assert.ok(settingsBlock.includes('align-items: stretch;'), 'condition panels should stretch to equal height in the two-column layout');
  assert.ok(settingsBlock.includes('padding: var(--fab-space-3);'), 'settings panel should use uniform workspace padding on all sides');
  assert.ok(panelBlock.includes('align-content: start;'), 'condition panel content should pack to its natural height');
  assert.ok(panelBlock.includes('height: 100%;'), 'condition panel backgrounds should fill the stretched grid row');
  assert.ok(addBlock.includes('grid-template-columns: 36px minmax(0, 1fr) 48px;'), 'condition add controls should reserve icon picker, label input, and Add button columns');
  assert.ok(regionAddBlock.includes('grid-template-columns: minmax(0, 1fr) 48px;'), 'region add controls should be text input plus Add button');
  assert.ok(biomeAddBlock.includes('grid-template-columns: 36px 36px minmax(0, 1fr) 48px;'), 'biome add controls should align icon, colour, input, and Add columns');
  assert.ok(css.includes('.fabricate-manager .manager-condition-pill-list {\n  display: grid;'), 'condition pills should use grid rows instead of wrapping as single full-width flex pills');
  assert.ok(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'condition pills should fit two per line');
  assert.ok(pillBlock.includes('grid-template-columns: 30px minmax(0, 1fr) 24px;'), 'condition pills should reserve icon, label, and remove columns');
  assert.ok(regionPillBlock.includes('grid-template-columns: minmax(0, 1fr) 24px;'), 'region pills should expose editable labels and remove controls without icon columns');
  assert.ok(biomePillBlock.includes('grid-template-columns: 30px minmax(0, 1fr) 24px;'), 'biome pills should reserve combined icon/color, label, and remove columns');
  assert.ok(!biomePillBlock.includes('28px 30px minmax(0, 1fr) 30px 24px;'), 'biome pills should not reserve separate swatch and colour columns');
  assert.ok(biomeCombinedTriggerBlock.includes('color: var(--fab-biome-icon-foreground);'), 'biome combined icon trigger should use fixed charcoal foreground across themes');
  assert.ok(biomeCombinedTriggerBlock.includes('background: var(--manager-color-swatch, var(--fab-tag-sage));'), 'biome combined icon trigger should keep token/custom swatch backgrounds');
  assert.ok(biomeCombinedTriggerIconBlock.includes('color: var(--fab-biome-icon-foreground);'), 'biome combined nested icons should not inherit theme button colours');
  assert.ok(css.includes('--fab-biome-icon-foreground: #202124;'), 'biome icon foreground token should stay fixed charcoal in theme declarations');
  assert.ok(colorPickerPopoverBlock.includes('box-sizing: border-box;'), 'biome color picker popover should contain its padding and border in its width');
  assert.ok(colorPickerPopoverBlock.includes('z-index: 120;'), 'biome color picker popover should layer with Manager portaled pickers');
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
  assert.ok(css.includes('.fabricate-manager .manager-condition-pill .essence-icon-picker-trigger.icon-only') && css.includes('justify-content: center;'), 'condition pill icon picker buttons should center icons');
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-gathering-settings')
      && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'condition panels should stack at medium widths'
  );
});

// The recipe library is a list of CARD rows (issue 643), not a column grid. The old
// assertions pinned `--fab-mv2-recipe-grid`, the `has-no-category` grid variant and
// the medium-query column stacking — none of which a card row has. What replaces them
// is the pair that actually prevents horizontal overflow: the identity cell is the ONLY
// shrinkable flex child, and the control cluster never shrinks.
test('manager recipes browser defines a non-overflowing card row', () => {
  const tableBlock = blockFor('.fabricate-manager .manager-recipes-table');
  const rowBlock = blockFor('.fabricate-manager .manager-recipe-row');
  const identityBlock = blockFor('.fabricate-manager .manager-recipe-row .manager-recipe-identity');
  const clusterBlock = blockFor('.fabricate-manager .manager-recipe-cluster');
  const groupListBlock = blockFor('.fabricate-manager .manager-recipe-group-list');

  assert.ok(tableBlock.includes('display: flex;'), 'the recipes table stacks its category groups');
  assert.equal(
    css.includes('--fab-mv2-recipe-grid'),
    false,
    'the retired recipe column grid should be gone, not merely unused'
  );
  assert.equal(
    css.includes('.fabricate-manager .manager-recipe-table-head'),
    false,
    'a card row has no column headers'
  );
  assert.ok(rowBlock.includes('display: flex;'), 'the recipe row is a flex card');
  assert.ok(rowBlock.includes('min-width: 0;'), 'the recipe row may shrink inside the main column');
  assert.ok(
    identityBlock.includes('flex: 1 1 0;') && identityBlock.includes('min-width: 0;'),
    'the identity cell is the row content that gives way'
  );
  assert.ok(
    clusterBlock.includes('flex-shrink: 0;'),
    'the control cluster (lock / enable / edit) must never be squeezed'
  );
  assert.ok(groupListBlock.includes('list-style: none;'), 'the rows render as a real, unstyled list');
  // The rows still share the row-card geometry group with every other browser row.
  assert.ok(
    css.includes('.fabricate-manager .manager-recipe-row,\n.fabricate-manager .manager-component-row,\n.fabricate-manager .manager-environment-row,\n.fabricate-manager .manager-gathering-task-row,\n.fabricate-manager .manager-essence-row {\n  width: 100%;\n  min-height: 76px;'),
    'recipe, component, environment, gathering task, and essence rows should have stable row height'
  );
});

// The collapse ladder (issue 643 §8). Drop order is fixed and monotonic, and the
// lock / enable / edit controls are never in it.
//
// The ladder measures the ROW's own container, not the manager. `.manager-body` is
// `220px + 1fr + 300px` above 1120px and only collapses to one column at or below it,
// so a manager-keyed ladder fired NONE of its steps in the 1121-1280px band — exactly
// where the row is at its narrowest (~570-760px) — and every step once the layout
// stacked, where the row has the whole window. Keying it to `.manager-recipes-table`
// makes each step fire when the row is actually short of room.
test('manager recipe row collapses in the specified order and never drops its controls', () => {
  const tableBlock = blockFor('.fabricate-manager .manager-recipes-table');
  assert.ok(
    tableBlock.includes('container-type: inline-size;') &&
      tableBlock.includes('container-name: fabricate-recipes;'),
    'the row ladder needs a container that measures the ROW, not the whole manager'
  );

  const LADDER = [
    [680, '.fabricate-manager .manager-recipe-row .manager-recipe-description'],
    [600, '.fabricate-manager .manager-recipe-row .manager-recipe-io'],
    [520, '.fabricate-manager .manager-recipe-row .manager-recipe-check'],
    [440, '.fabricate-manager .manager-recipe-row .manager-status-toggle-label']
  ];

  for (const [width, selector] of LADDER) {
    const query = css.slice(css.indexOf(`@container fabricate-recipes (max-width: ${width}px)`));
    assert.ok(query.length > 0, `a ${width}px recipe-container query should exist`);
    const rule = query.slice(query.indexOf(selector));
    assert.ok(
      query.includes(selector) && rule.slice(0, rule.indexOf('}')).includes('display: none;'),
      `${selector} should drop at ${width}px of ROW width`
    );
  }

  for (const kept of ['.manager-recipe-lock', '.manager-recipe-status', '.manager-action-group']) {
    assert.equal(
      new RegExp(`\\.manager-recipe-row \\${kept} \\{\\n  display: none;`).test(css),
      false,
      `${kept} must survive every width — it is an operable control`
    );
  }

  // The three status pills are all `white-space: nowrap`, and the identity cell set no
  // overflow: they could spill out of it. The name gives way first; the row clips.
  const nameRowBlock = blockFor('.fabricate-manager .manager-recipe-name-row');
  const nameBlock = blockFor('.fabricate-manager .manager-recipe-name-row .manager-system-name');
  assert.ok(nameRowBlock.includes('overflow: hidden;'), 'the pills cannot escape the identity cell');
  assert.ok(
    nameBlock.includes('flex: 0 1 auto;') && nameBlock.includes('min-width: 0;'),
    'the name is what gives way, so the pills stay readable'
  );
});

// Two long-label regressions the shared switch caused, both confirmed on a real smoke
// frame. `.manager-status-toggle` is a STATUS cell: it caps at 78px and ellipsises its
// label, which is right for "On"/"Off" and wrong for anything the GM has to read.
test('long-labelled switches escape the status cell geometry', () => {
  // (1) The library's grouping switch rendered as "Grou…": 78px - 34px track - gap
  // leaves ~36px. A filter-bar switch is sized by its label.
  const groupToggleBlock = blockFor(
    '.fabricate-manager .manager-recipe-filter-row .manager-status-toggle[data-recipe-group-toggle]'
  );
  assert.ok(
    groupToggleBlock.includes('max-width: none;'),
    'the group-by-category switch must not inherit the 78px status-cell cap that truncates its label'
  );
  const groupLabelBlock = blockFor(
    '.fabricate-manager .manager-status-toggle[data-recipe-group-toggle] .manager-status-toggle-label'
  );
  assert.ok(
    groupLabelBlock.includes('overflow: visible;') && groupLabelBlock.includes('text-overflow: clip;'),
    'the filter switch label must not ellipsise'
  );

  // (2) The Overview Locked card has no image picker, so its switch + hint are a
  // left-aligned row rather than the media column's centred, 14ch-clamped stack.
  const toggleRowBlock = blockFor('.fabricate-manager .manager-recipe-toggle-row');
  const toggleRowCopyBlock = blockFor('.fabricate-manager .manager-recipe-toggle-row p');
  assert.ok(
    toggleRowBlock.includes('display: flex;') && toggleRowBlock.includes('align-items: center;'),
    'a switch with a sentence beside it is a row, not a centred stack'
  );
  assert.equal(
    toggleRowCopyBlock.includes('max-width:'),
    false,
    'the hint beside a switch must not be clamped to the 96px media column width'
  );
  assert.equal(
    toggleRowCopyBlock.includes('text-align: center;'),
    false,
    'the hint beside a switch reads left-aligned, not centred mid-card'
  );
});

// Selection is an identity cue ("you are here"), never a status. Success/amber stay
// reserved for enabled and warning states — a selected row tinted `--fab-success-soft`
// wears the exact colour its own ON switch uses, inches away (issue 643).
test('a selected browser row reads as an identity cue in the accent family, not a status', () => {
  const selectedRowBlock = blockFor(
    '.fabricate-manager .manager-recipe-row.is-selected,\n.fabricate-manager .manager-component-row.is-selected,\n.fabricate-manager .manager-environment-row.is-selected,\n.fabricate-manager .manager-gathering-task-row.is-selected,\n.fabricate-manager .manager-essence-row.is-selected'
  );
  const selectedSystemBlock = blockFor('.fabricate-manager .manager-system-row.is-selected');
  const identityFocusBlock = blockFor(
    '.fabricate-manager .manager-system-identity:focus-visible,\n.fabricate-manager .manager-recipe-identity:focus-visible,\n.fabricate-manager .manager-component-identity:focus-visible,\n.fabricate-manager .manager-environment-identity:focus-visible,\n.fabricate-manager .manager-gathering-task-identity:focus-visible'
  );

  for (const [name, block] of [
    ['the selected row', selectedRowBlock],
    ['the selected system card', selectedSystemBlock]
  ]) {
    assert.ok(block.includes('background: var(--fab-surface-soft);'), `${name} uses a neutral soft surface`);
    assert.ok(block.includes('border-color: var(--fab-accent-border);'), `${name} rings in the accent`);
    assert.equal(
      block.includes('var(--fab-success-soft)'),
      false,
      `${name} must not wear the enabled-status colour`
    );
  }

  assert.ok(
    identityFocusBlock.includes('outline: 2px solid var(--fab-mv2-accent);'),
    'the identity focus ring follows the accent focus standard, not the success family'
  );
});

// The typographic contract (issue 643, `openspec/specs/ui-integration/spec.md`
// § Typographic contract): serif on names and headings, mono + tabular figures on
// every numeric. A count badge that shifts width between 9 and 10 moves the control
// beside it, so tabular-nums is part of the contract, not a nicety.
test('the typographic contract sets names in the serif and numerics in the mono face', () => {
  const SERIF = [
    '.fabricate-manager .manager-rail-title,\n.fabricate-manager .manager-card-title',
    '.fabricate-manager .manager-inspector-name',
    '.fabricate-manager .manager-recipe-name-row .manager-system-name',
    '.fabricate-manager .manager-scope-name',
    '.fabricate-manager .manager-recipe-ingredient-set-name',
    '.fabricate-manager input[data-recipe-field="name"]'
  ];
  for (const selector of SERIF) {
    assert.ok(
      blockFor(selector).includes('font-family: var(--fab-font-serif);'),
      `${selector} is a name or a heading and belongs in the serif`
    );
  }

  const MONO = [
    '.fabricate-manager .manager-chip.is-mono',
    '.fabricate-manager .manager-editor-tab-badge',
    '.fabricate-manager .manager-environment-comp-order'
  ];
  for (const selector of MONO) {
    const block = blockFor(selector);
    assert.ok(
      block.includes('font-family: var(--fab-font-mono);'),
      `${selector} renders a number and belongs in the mono face`
    );
    assert.ok(
      block.includes('font-variant-numeric: tabular-nums;'),
      `${selector} must not change width between 9 and 10`
    );
  }

  assert.ok(
    blockFor('.fabricate-manager .manager-recipe-io-counts').includes('font-family: var(--fab-font-mono);'),
    "the row's in/out counts are numerics"
  );
});

test('manager gathering task browser defines bounded toolbar and compact table geometry without reorder controls', () => {
  const toolbarBlock = blockFor('.fabricate-manager .manager-task-toolbar');
  const panelBlock = blockFor('.fabricate-manager .manager-gathering-panel-tasks');
  const tableBlock = blockFor('.fabricate-manager .manager-gathering-tasks-table');
  const rowBlock = blockFor('.fabricate-manager .manager-gathering-task-table-head,\n.fabricate-manager .manager-gathering-task-row');
  const identityBlock = blockFor('.fabricate-manager .manager-recipe-identity,\n.fabricate-manager .manager-component-identity,\n.fabricate-manager .manager-environment-identity,\n.fabricate-manager .manager-gathering-task-identity');
  const toolsIdentityDropZoneBlock = blockFor('.fabricate-manager .manager-tools-identity.is-component-drop-zone');
  const toolsIdentityDropZoneActiveBlock = blockFor('.fabricate-manager .manager-tools-identity.is-component-drop-zone.is-drop-active');
  const toolsRowBlock = blockFor('.fabricate-manager .manager-tools-row');
  const toolsSelectedRowBlock = blockFor('.fabricate-manager .manager-tools-row.is-selected');
  const toolsSelectedRowBodyBlock = blockFor('.fabricate-manager .manager-tools-row.is-selected > .manager-tools-row-body');
  const toolsSelectedExpandedRowBodyBlock = blockFor('.fabricate-manager .manager-tools-row.is-selected.is-expanded > .manager-tools-row-body');
  const toolsRowBodyBlock = blockFor('.fabricate-manager .manager-tools-row-body');
  const toolsIdentityBlock = blockFor('.fabricate-manager .manager-tools-identity');
  const toolsRowSummaryBlock = blockFor('.fabricate-manager .manager-tools-row-summary');
  const toolsRowActionsBlock = blockFor('.fabricate-manager .manager-tools-row-actions');
  const toolsRowDirtySlotBlock = blockFor('.fabricate-manager .manager-tools-row-dirty-slot');
  const toolsDirtyChipBlock = blockFor('.fabricate-manager .manager-tools-dirty-chip');
  const toolsInspectorHeadingBlock = blockFor('.fabricate-manager .manager-tool-inspector-heading');
  const toolsEmptyStubBlock = blockFor('.fabricate-manager .manager-tools-empty-stub');
  const toolsEmptyStubActiveBlock = blockFor('.fabricate-manager .manager-tools-empty-stub:hover,\n.fabricate-manager .manager-tools-empty-stub:focus-visible,\n.fabricate-manager .manager-tools-empty-stub.is-drop-active');
  const editorBlock = blockFor('.fabricate-manager .manager-gathering-task-edit-view');
  const availabilityBlock = blockFor('.fabricate-manager .manager-task-availability-row');
  const componentBrowserBlock = blockFor('.fabricate-manager .manager-task-component-browser-card');
  const componentBrowserControlsBlock = blockFor('.fabricate-manager .manager-task-component-browser-controls');
  const componentBrowserScrollBlock = blockFor('.fabricate-manager .manager-task-component-browser-scroll');
  const componentGridBlock = blockFor('.fabricate-manager .manager-task-component-grid');
  const componentCardBlock = blockFor('.fabricate-manager .manager-task-component-card');
  const componentCardCopySharedBlock = blockFor('.fabricate-manager .manager-task-component-card-copy strong,\n.fabricate-manager .manager-task-component-card-copy > span:not(.manager-task-component-card-tags)');
  const componentCardGripBlock = blockFor('.fabricate-manager .manager-task-component-card-grip');
  const componentBrowserFooterBlock = blockFor('.fabricate-manager .manager-task-component-browser-footer');
  const componentBrowserFooterPaginationBlock = blockFor('.fabricate-manager .manager-task-component-browser-footer .manager-pagination');
  const toolsComponentBrowserBlock = blockFor('.fabricate-manager .manager-tools-component-browser-card');
  const toolInspectorActionsBlock = blockFor('.fabricate-manager .manager-tool-inspector-actions');
  const toolInspectorActionButtonsBlock = blockFor('.fabricate-manager .manager-tool-inspector-actions .manager-button');
  const toolInspectorActionButtonLabelBlock = blockFor('.fabricate-manager .manager-tool-inspector-actions .manager-button span');
  const toolsComponentBrowserHeaderBlock = blockFor('.fabricate-manager .manager-tools-component-browser-header');
  const toolsComponentBrowserSearchBlock = blockFor('.fabricate-manager .manager-tools-component-browser-card .manager-search.is-compact');
  const toolsComponentBrowserSearchInputBlock = blockFor('.fabricate-manager .manager-tools-component-browser-card .manager-search.is-compact input');
  const toolsComponentBrowserScrollBlock = blockFor('.fabricate-manager .manager-tools-component-browser-scroll');
  const toolsComponentBrowserGridBlock = blockFor('.fabricate-manager .manager-tools-component-grid');
  const toolsComponentBrowserFooterBlock = blockFor('.fabricate-manager .manager-tools-component-browser-footer');
  const toolsComponentBrowserFooterPaginationBlock = blockFor('.fabricate-manager .manager-tools-component-browser-footer .manager-pagination');
  const toolsComponentBrowserFooterSummaryBlock = blockFor('.fabricate-manager .manager-tools-component-browser-footer .manager-pagination-summary');
  const toolsComponentBrowserFooterControlsBlock = blockFor('.fabricate-manager .manager-tools-component-browser-footer .manager-pagination-nav,\n.fabricate-manager .manager-tools-component-browser-footer .manager-pagination-size');
  const toolsComponentBrowserFooterPageSizeSelectBlock = blockFor('.fabricate-manager .manager-tools-component-browser-footer .manager-pagination-size select');
  const toolsComponentBrowserFooterPageBlock = blockFor('.fabricate-manager .manager-tools-component-browser-footer .manager-pagination-page');
  const toolsInlineFieldBlock = blockFor('.fabricate-manager .manager-tools-inline-field');
  const toolsInlineFieldLabelBlock = blockFor('.fabricate-manager .manager-tools-inline-field > span:first-child');
  const toolsInlineNumberInputBlock = blockFor('.fabricate-manager .manager-tools-inline-field > input[type="number"]');
  const toolsMaxUsesInputBlock = blockFor('.fabricate-manager .manager-tools-inline-field > .manager-tools-max-uses-input');
  const toolsReplacementFieldBlock = blockFor('.fabricate-manager .manager-tools-replacement-field');
  const toolsReplacementComponentRowBlock = blockFor('.fabricate-manager .manager-tools-replacement-field > .manager-tool-component-row');
  const toolsRequirementExpressionInputBlock = blockFor('.fabricate-manager .manager-tools-requirement-expression input');
  const toolsRequirementHelpBlock = blockFor('.fabricate-manager .manager-tools-requirement-help');
  const toolsInlineFieldsBlock = blockFor('.fabricate-manager .manager-tools-inline-fields');
  const toolsEditorInputBlock = blockFor('.fabricate-manager .manager-tools-row-editor .manager-field input:not([type="range"]),\n.fabricate-manager .manager-tools-row-editor .manager-field select');
  const toolsEditorPercentInputBlock = blockFor('.fabricate-manager .manager-tools-row-editor .manager-drop-rate-percent input[type="text"]');
  const componentPillsBlock = blockFor('.fabricate-manager .manager-task-component-pills');
  const selectedTagPillBlock = blockFor('.fabricate-manager .manager-selected-tag-pill');
  const dropCardBlock = blockFor('.fabricate-manager .manager-task-drops-card');
  const dropHeaderBlock = blockFor('.fabricate-manager .manager-task-drops-card .manager-task-card-header');
  const dropControlsBlock = blockFor('.fabricate-manager .manager-task-drop-controls');
  const dropSearchBlock = blockFor('.fabricate-manager .manager-task-drop-controls .manager-search.is-compact');
  const dropSearchInputBlock = blockFor('.fabricate-manager .manager-task-drop-controls .manager-search.is-compact input');
  const dropFooterBlock = blockFor('.fabricate-manager .manager-task-drop-footer');
  const dropFooterPaginationBlock = blockFor('.fabricate-manager .manager-task-drop-footer .manager-pagination');
  const dropScrollBlock = blockFor('.fabricate-manager .manager-task-drops-card .manager-table-scroll');
  const dropTableBlock = blockFor('.fabricate-manager .manager-gathering-task-drops-table');
  const dropTableRankedBlock = blockFor('.fabricate-manager .manager-gathering-task-drops-table.is-ranked-mode');
  const dropRankCellBlock = blockFor('.fabricate-manager .manager-drop-rank-cell');
  const dropRankValueBlock = blockFor('.fabricate-manager .manager-drop-rank-value');
  const dropRankButtonBlock = blockFor('.fabricate-manager .manager-drop-rank-button');
  const dropTableHeadBlock = blockFor('.fabricate-manager .manager-gathering-task-drop-table-head');
  const dropRowBlock = blockFor('.fabricate-manager .manager-gathering-task-drop-table-head,\n.fabricate-manager .manager-gathering-task-drop-row');
  const firstDropRowBlock = blockFor('.fabricate-manager .manager-gathering-task-drop-table-head + .manager-gathering-task-drop-row');
  const dropCellBlock = blockFor('.fabricate-manager .manager-gathering-task-drop-table-head > *,\n.fabricate-manager .manager-gathering-task-drop-row > *');
  const dropCellSeparatorBlock = blockFor('.fabricate-manager .manager-gathering-task-drop-table-head > * + *,\n.fabricate-manager .manager-gathering-task-drop-row > * + *');
  const selectedDropRowBlock = blockFor('.fabricate-manager .manager-gathering-task-drop-row.is-selected');
  const dropComponentButtonBlock = blockFor('.fabricate-manager .manager-drop-component-button,\n.fabricate-manager .manager-drop-empty-component');
  const dropEmptyComponentBlock = blockFor('.fabricate-manager .manager-drop-empty-component');
  const dropEmptyComponentIconBlock = blockFor('.fabricate-manager .manager-drop-empty-component .manager-inline-drop-zone');
  const dropComponentCopyBlock = blockFor('.fabricate-manager .manager-drop-component-button .manager-system-copy,\n.fabricate-manager .manager-drop-empty-component .manager-system-copy');
  const dropComponentNameBlock = blockFor('.fabricate-manager .manager-drop-component-button .manager-system-name');
  const dropRateBlock = blockFor('.fabricate-manager .manager-drop-rate-cell');
  const dropRateValueBlock = blockFor('.fabricate-manager .manager-drop-rate-value');
  const dropRatePercentBlock = blockFor('.fabricate-manager .manager-drop-rate-percent');
  const dropRatePercentInputBlock = blockFor('.fabricate-manager .manager-drop-rate-percent input[type="text"]');
  const dropRatePercentInputOverrideBlock = blockFor('.fabricate-manager .manager-gathering-task-edit-view .manager-drop-rate-percent input[type="text"]');
  const dropRatePercentSuffixBlock = blockFor('.fabricate-manager .manager-drop-rate-percent > span[aria-hidden="true"]');
  const dropRateControlBlock = blockFor('.fabricate-manager .manager-drop-rate-control');
  const guaranteedDropRateControlBlock = blockFor('.fabricate-manager .manager-drop-rate-control.is-guaranteed');
  const commonDropRateControlBlock = blockFor('.fabricate-manager .manager-drop-rate-control.is-common');
  const uncommonDropRateControlBlock = blockFor('.fabricate-manager .manager-drop-rate-control.is-uncommon');
  const rareDropRateControlBlock = blockFor('.fabricate-manager .manager-drop-rate-control.is-rare');
  const veryRareDropRateControlBlock = blockFor('.fabricate-manager .manager-drop-rate-control.is-very-rare');
  const legendaryDropRateControlBlock = blockFor('.fabricate-manager .manager-drop-rate-control.is-legendary');
  const noneDropRateControlBlock = blockFor('.fabricate-manager .manager-drop-rate-control.is-none');
  const dropRateTrackBlock = blockFor('.fabricate-manager .manager-drop-rate-track');
  const dropRateFillBlock = blockFor('.fabricate-manager .manager-drop-rate-fill');
  const dropRateRangeBlock = blockFor('.fabricate-manager .manager-drop-rate-control input[type="range"]');
  const dropRateWebkitTrackBlock = blockFor('.fabricate-manager .manager-drop-rate-control input[type="range"]::-webkit-slider-runnable-track');
  const dropRateWebkitThumbBlock = blockFor('.fabricate-manager .manager-drop-rate-control input[type="range"]::-webkit-slider-thumb');
  const dropRateMozProgressBlock = blockFor('.fabricate-manager .manager-drop-rate-control input[type="range"]::-moz-range-progress');
  const dropRateMozThumbBlock = blockFor('.fabricate-manager .manager-drop-rate-control input[type="range"]::-moz-range-thumb');
  const toolBreakageChanceControlBlock = blockFor('.fabricate-manager .manager-tool-breakage-chance-control');
  const toolBreakageChanceTrackBlock = blockFor('.fabricate-manager .manager-tool-breakage-chance-control .manager-drop-rate-track');
  const toolBreakageChanceFillBlock = blockFor('.fabricate-manager .manager-tool-breakage-chance-control .manager-drop-rate-fill');
  const toolBreakageChanceRangeBlock = blockFor('.fabricate-manager .manager-tool-breakage-chance-control input[type="range"]');
  const toolBreakageChanceWebkitTrackBlock = blockFor('.fabricate-manager .manager-tool-breakage-chance-control input[type="range"]::-webkit-slider-runnable-track');
  const toolBreakageChanceWebkitThumbBlock = blockFor('.fabricate-manager .manager-tool-breakage-chance-control input[type="range"]::-webkit-slider-thumb');
  const toolBreakageChanceMozTrackBlock = blockFor('.fabricate-manager .manager-tool-breakage-chance-control input[type="range"]::-moz-range-track');
  const toolBreakageChanceMozProgressBlock = blockFor('.fabricate-manager .manager-tool-breakage-chance-control input[type="range"]::-moz-range-progress');
  const toolBreakageChanceMozThumbBlock = blockFor('.fabricate-manager .manager-tool-breakage-chance-control input[type="range"]::-moz-range-thumb');
  const dropModifierListBlock = blockFor('.fabricate-manager .manager-drop-modifier-list');
  const dropModifierPillBlock = blockFor('.fabricate-manager .manager-drop-modifier-pill');
  const positiveDropModifierPillBlock = blockFor('.fabricate-manager .manager-drop-modifier-pill.is-positive');
  const negativeDropModifierPillBlock = blockFor('.fabricate-manager .manager-drop-modifier-pill.is-negative');
  const dropModifierOverflowBlock = blockFor('.fabricate-manager .manager-drop-modifier-overflow');
  const dropEditorInputBlock = blockFor('.fabricate-manager .manager-drop-editor-card :is(select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]))');
  const dropEditorValuesBlock = blockFor('.fabricate-manager .manager-drop-editor-values');
  const dropEditorRatePercentBlock = blockFor('.fabricate-manager .manager-drop-editor-card .manager-drop-rate-percent input[type="text"]');
  const dropEditorRateValueBlock = blockFor('.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-value');
  const dropEditorRateInputBlock = blockFor('.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-percent input[type="text"]');
  const dropEditorRateSuffixBlock = blockFor('.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-percent > span[aria-hidden="true"]');
  const dropEditorRateControlBlock = blockFor('.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-control');
  const dropEditorRateTrackBlock = blockFor('.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-track');
  const dropEditorRateFillBlock = blockFor('.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-fill');
  const dropEditorRateRangeBlock = blockFor('.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-control input[type="range"]');
  const dropEditorRateWebkitTrackBlock = blockFor('.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-control input[type="range"]::-webkit-slider-runnable-track');
  const dropEditorRateMozTrackBlock = blockFor('.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-control input[type="range"]::-moz-range-track');
  const dropEditorCountBlock = blockFor('.fabricate-manager .manager-drop-count-editor');
  const dropEditorCountInputBlock = blockFor('.fabricate-manager .manager-drop-count-editor input[type="text"]');
  const dropEditorInspectorCountInputBlock = blockFor('.fabricate-manager .manager-drop-editor-card .manager-drop-count-editor[data-gathering-drop-inspector-count] input[type="text"]');
  const dropInspectorButtonBlock = blockFor('.fabricate-manager .manager-drop-inspector-stack .manager-button');
  const dropInspectorIconButtonBlock = blockFor('.fabricate-manager .manager-drop-inspector-stack .manager-icon-button');
  const dropInspectorSearchInputBlock = blockFor('.fabricate-manager .manager-drop-inspector-stack .manager-search input');
  const dropInspectorCharacterFieldBlock = blockFor('.fabricate-manager .manager-character-modifier-row-card .manager-field :is(select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]))');
  const dropInspectorCharacterOperatorBlock = blockFor('.fabricate-manager .manager-character-modifier-operator-select select');
  const dropEditorActionsBlock = blockFor('.fabricate-manager .manager-drop-editor-actions');
  const dropInspectorStackBlock = blockFor('.fabricate-manager .manager-drop-inspector-stack');
  const dropInspectorRouteBlock = blockFor('.fabricate-manager[data-manager-view="gathering-task-edit"] .manager-inspector');
  const dropInspectorDividerBlock = blockFor('.fabricate-manager .manager-drop-inspector-divider');
  const dropInspectorScrollBlock = blockFor('.fabricate-manager .manager-drop-inspector-scroll');
  const dropQuantityCellBlock = blockFor('.fabricate-manager .manager-gathering-task-drop-row > .manager-drop-quantity-cell');
  const dropQuantityInputBlock = blockFor('.fabricate-manager .manager-drop-quantity-cell input[type="text"]');
  const dropQuantityInputOverrideBlock = blockFor('.fabricate-manager .manager-gathering-task-edit-view .manager-drop-quantity-cell input[type="text"]');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const taskEditorIntermediateQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1320px)'), css.indexOf('@container fabricate-manager (max-width: 1120px)'));

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
      && toolsEmptyStubBlock.includes('padding: var(--fab-space-4) var(--fab-space-4);'),
    'tools add stub should be tall enough to work as a drop target'
  );
  assert.ok(
    toolsEmptyStubActiveBlock.includes('.manager-tools-empty-stub.is-drop-active')
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
    css.includes('.fabricate-manager .manager-tools-requirement-help ul {\n  display: grid;'),
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
    toolsEditorPercentInputBlock.includes('padding: 0 var(--fab-space-2) 0 0;'),
    'tools breakage chance percent input should keep its specialized compact padding'
  );
  assert.ok(editorBlock.includes('grid-auto-rows: auto;'), 'task edit route should size rows to each card so sections can be reordered; the fixed-height cards (component browser, drops) set their own height');
  assert.ok(editorBlock.includes('overflow: auto;'), 'task editor should allow vertical scrolling without horizontal overflow');
  assert.ok(availabilityBlock.includes('grid-template-columns: repeat(2, minmax(160px, 1fr));'), 'task availability controls should form a stable two-column grid');
  assert.ok(componentBrowserBlock.includes('height: 340px;') && componentBrowserBlock.includes('max-height: 340px;') && componentBrowserBlock.includes('overflow: hidden;'), 'component browser should own a fixed bounded height that keeps the footer visible');
  assert.ok(componentBrowserBlock.includes('grid-template-rows: auto auto minmax(0, 1fr) auto;'), 'component browser should reserve header, optional pills, card scroll, and footer rows');
  assert.ok(componentPillsBlock.includes('border-top: 1px solid var(--fab-mv2-border);'), 'component browser selected tags should occupy a distinct pill row');
  assert.ok(selectedTagPillBlock.includes('background: var(--fab-success-soft);'), 'selected component tag filters should use removable selected-tag pill styling');
  assert.ok(componentBrowserControlsBlock.includes('grid-template-columns: minmax(180px, 0.9fr) minmax(180px, 0.9fr);'), 'component browser should keep name and tag search in a compact control grid');
  assert.ok(componentBrowserScrollBlock.includes('overflow: hidden auto;'), 'component browser card area should scroll internally without horizontal overflow');
  assert.ok(componentGridBlock.includes('grid-template-columns: repeat(3, minmax(0, 1fr));'), 'component browser should use a three-column card grid');
  assert.ok(componentCardBlock.includes('grid-template-columns: 38px minmax(0, 1fr) 18px;') && componentCardBlock.includes('min-height: 72px;'), 'component browser cards should reserve image, copy, and grip columns');
  assert.ok(componentCardCopySharedBlock.includes('text-overflow: ellipsis;'), 'component card shared copy should truncate within the card');
  assert.ok(
    css.includes('.fabricate-manager .manager-task-component-card-copy strong {\n  -webkit-line-clamp: 1;')
      && css.includes('.fabricate-manager .manager-task-component-card-copy > span:not(.manager-task-component-card-tags) {\n  -webkit-line-clamp: 1;'),
    'component card name and description should clamp to one line'
  );
  assert.ok(componentCardGripBlock.includes('letter-spacing: 0;'), 'component grip should avoid viewport-scaled or negative tracking');
  assert.ok(componentBrowserFooterBlock.includes('border-top: 1px solid var(--fab-mv2-border);'), 'component browser should own a pagination footer');
  assert.ok(componentBrowserFooterPaginationBlock.includes('background: transparent;'), 'component browser footer should not nest pagination chrome');
  assert.ok(
    toolInspectorActionsBlock.includes('display: grid;')
      && toolInspectorActionsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));')
      && toolInspectorActionsBlock.includes('gap: var(--fab-space-2);'),
    'selected tool inspector actions should sit in a stable two-column action row inside the header card'
  );
  assert.ok(toolInspectorActionButtonsBlock.includes('width: 100%;') && toolInspectorActionButtonsBlock.includes('padding: 0 var(--fab-space-2);'), 'selected tool inspector action buttons should fill their grid columns without overflowing the right rail');
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
  assert.ok(toolsComponentBrowserHeaderBlock.includes('padding: 0 0 var(--fab-space-3);'), 'tools component browser header should own spacing without creating a large blank scroll gap');
  assert.ok(
    toolsComponentBrowserSearchBlock.includes('position: relative;')
      && toolsComponentBrowserSearchBlock.includes('display: block;')
      && toolsComponentBrowserSearchBlock.includes('flex: 0 0 auto;')
      && toolsComponentBrowserSearchBlock.includes('width: 100%;'),
    'tools component browser search should anchor its icon inside a full-width input box without inheriting the global 260px flex basis as height'
  );
  assert.ok(toolsComponentBrowserSearchInputBlock.includes('padding-left: 36px;'), 'tools component browser search input should reserve text inset for the leading search icon');
  assert.ok(toolsComponentBrowserScrollBlock.includes('padding: var(--fab-space-3) 0 var(--fab-space-3);') && toolsComponentBrowserScrollBlock.includes('overflow: hidden auto;'), 'tools component browser results should show complete cards before scrolling without horizontal overflow');
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
  assert.ok(dropScrollBlock.includes('padding: var(--fab-space-3) 0 0;'), 'drop rules table scroll region should not add horizontal inset');
  assert.ok(dropScrollBlock.includes('overflow: hidden auto;'), 'drop rules table should suppress horizontal scroll while retaining vertical scrolling');
  assert.ok(dropTableBlock.includes('--fab-mv2-task-drop-grid:'), 'task editor drop rows should define compact desktop geometry');
  assert.ok(dropTableBlock.includes('minmax(0, 1.05fr)') && dropTableBlock.includes('minmax(220px, 1.35fr)') && dropTableBlock.includes('56px') && dropTableBlock.includes('minmax(180px, 1.65fr)'), 'drop row desktop grid should keep component/chance/quantity geometry while widening modifiers');
  assert.equal(dropTableBlock.includes('88px'), false, 'drop row desktop grid should not reserve a row actions column');
  assert.ok(dropTableBlock.includes('width: 100%;') && dropTableBlock.includes('max-width: 100%;'), 'drop table should fill the drop rules card without exceeding it');
  assert.ok(dropTableHeadBlock.includes('padding: 0;'), 'drop rules header row should clear generic table-head padding so columns align with value rows');
  assert.ok(dropRowBlock.includes('grid-template-columns: var(--fab-mv2-task-drop-grid);'), 'drop rows should use the shared single-line editor grid');
  assert.ok(dropRowBlock.includes('gap: 0;') && dropRowBlock.includes('max-width: 100%;'), 'drop rows should use separators instead of gap-driven overflow');
  assert.ok(firstDropRowBlock.includes('border-top: 0;'), 'first drop row should not double the header bottom border');
  assert.ok(css.includes('.fabricate-manager .manager-gathering-task-drop-row {\n  min-height: 72px;'), 'drop rows should be tall enough for two visible modifier chip lines');
  assert.ok(dropCellBlock.includes('padding: var(--fab-space-1) var(--fab-space-2);') && dropCellBlock.includes('box-sizing: border-box;'), 'drop cells should keep padding inside full-width rows');
  assert.ok(dropCellSeparatorBlock.includes('border-left: 1px solid var(--fab-mv2-border);'), 'drop cells should use vertical separators');
  assert.ok(css.includes('.fabricate-manager .manager-gathering-task-drop-row.is-drop-active'), 'drop rows should expose a full-row active drop target state');
  assert.ok(selectedDropRowBlock.includes('background: var(--fab-success-soft);') && selectedDropRowBlock.includes('var(--fab-mv2-accent)'), 'selected drop rows should use the component-browser success/accent family');
  assert.ok(selectedDropRowBlock.includes('inset 0 1px 0 var(--fab-mv2-border-strong)') && selectedDropRowBlock.includes('inset 0 -1px 0 var(--fab-mv2-border-strong)'), 'selected drop row outline should avoid a right edge next to the card border');
  assert.equal(selectedDropRowBlock.includes('inset 0 0 0 1px'), false, 'selected drop row should not draw a full inset border against the card edge');
  assert.equal(selectedDropRowBlock.includes('var(--fab-info'), false, 'selected drop rows should not use the info family');
  assert.equal(selectedDropRowBlock.includes('var(--fab-warning'), false, 'selected drop rows should not use the warning family');
  assert.ok(dropComponentButtonBlock.includes('grid-template-columns: 42px minmax(0, 1fr);') && dropComponentButtonBlock.includes('min-height: 40px;'), 'drop component cells should keep compact thumbnail/name geometry');
  assert.ok(
    css.includes('.fabricate-manager .manager-drop-empty-component {\n  min-height: 52px;\n  padding: var(--fab-space-chip) var(--fab-space-2);\n  border: 1px dashed var(--fab-mv2-border-strong);'),
    'empty component placeholders should show the full drop-zone boundary'
  );
  assert.ok(dropEmptyComponentIconBlock.includes('border: 0;'), 'empty component placeholders should avoid a nested icon-only dashed border');
  assert.ok(dropComponentCopyBlock.includes('align-content: center;'), 'drop component text should be vertically centered after description removal');
  assert.ok(dropComponentNameBlock.includes('display: -webkit-box;') && dropComponentNameBlock.includes('-webkit-line-clamp: 2;') && dropComponentNameBlock.includes('white-space: normal;'), 'drop component names should wrap to two lines instead of relying on descriptions');
  assert.ok(dropRateBlock.includes('display: block;'), 'drop chance cell should expose one wrapped value');
  assert.ok(dropRateValueBlock.includes('grid-template-columns: 52px minmax(0, 1fr);') && dropRateValueBlock.includes('gap: var(--fab-space-1);'), 'drop chance value should keep the row editable percent close to a wider slider');
  assert.ok(dropRatePercentBlock.includes('position: relative;') && dropRatePercentBlock.includes('display: block;'), 'drop chance percent should overlay the suffix without taking slider width');
  assert.ok(css.includes('--fab-drop-rate-none: #E26F6B;'), 'drop chance slider should define a distinct exact-zero colour token');
  assert.ok(dropRatePercentInputBlock.includes('height: 28px;') && dropRatePercentInputBlock.includes('box-sizing: border-box;') && dropRatePercentInputBlock.includes('padding: var(--fab-space-1) var(--fab-space-4) var(--fab-space-1) var(--fab-space-2xs);') && dropRatePercentInputBlock.includes('text-align: center;'), 'drop chance row percent should keep its existing compact centered editable numeric field');
  assert.ok(dropRatePercentInputOverrideBlock.includes('min-height: 28px;') && dropRatePercentInputOverrideBlock.includes('padding: var(--fab-space-1) var(--fab-space-4) var(--fab-space-1) var(--fab-space-2xs);') && dropRatePercentInputOverrideBlock.includes('box-shadow: none;'), 'drop chance row percent should override generic gathering task input chrome without affecting other fields');
  assert.ok(
    css.includes('.fabricate-manager .manager-drop-rate-percent > span[aria-hidden="true"] {\n  position: absolute;\n  right: 6px;')
      && css.includes('pointer-events: none;'),
    'drop chance row percent suffix should keep its existing placement'
  );
  assert.ok(dropRateControlBlock.includes('--fab-drop-rate-value: 1%;') && dropRateControlBlock.includes('--fab-drop-rate-color: var(--fab-drop-rate-very-rare);'), 'drop chance slider should expose value and tier colour variables');
  assert.ok(dropRateTrackBlock.includes('background: var(--fab-overlay-dark-18);') && dropRateTrackBlock.includes('overflow: hidden;'), 'drop chance slider should render a neutral clipped track under the native range input');
  assert.ok(dropRateFillBlock.includes('width: var(--fab-drop-rate-value);') && dropRateFillBlock.includes('background: var(--fab-drop-rate-color);'), 'drop chance slider should fill the active track segment with the current tier colour');
  assert.ok(dropRateRangeBlock.includes('appearance: none;') && dropRateRangeBlock.includes('-webkit-appearance: none;'), 'drop chance range should clear native host slider rendering');
  assert.ok(dropRateRangeBlock.includes('accent-color: var(--fab-drop-rate-color);'), 'drop chance native range should inherit the current tier colour');
  assert.ok(dropRateWebkitTrackBlock.includes('border: 1px solid var(--fab-overlay-light-10);') && dropRateWebkitTrackBlock.includes('background: transparent;'), 'drop chance row WebKit range track should keep its existing native track geometry');
  assert.ok(blockFor('.fabricate-manager .manager-drop-rate-control input[type="range"]::-moz-range-track').includes('border: 1px solid var(--fab-overlay-light-10);'), 'drop chance row Firefox range track should keep its existing native track geometry');
  assert.ok(dropRateMozProgressBlock.includes('background: var(--fab-drop-rate-color);'), 'drop chance Firefox progress should paint the active segment in the current tier colour');
  assert.ok(dropRateWebkitThumbBlock.includes('background: var(--fab-drop-rate-color);') && dropRateMozThumbBlock.includes('background: var(--fab-drop-rate-color);'), 'drop chance range thumbs should retain current-tier colour');
  assert.ok(
    toolBreakageChanceControlBlock.includes('--fab-tool-breakage-chance-thumb-radius: 7px;')
      && toolBreakageChanceControlBlock.includes('--fab-tool-breakage-chance-low: var(--fab-success);')
      && toolBreakageChanceControlBlock.includes('--fab-tool-breakage-chance-mid: var(--fab-warning);')
      && toolBreakageChanceControlBlock.includes('--fab-tool-breakage-chance-high: var(--fab-danger);')
      && toolBreakageChanceControlBlock.includes('--fab-tool-breakage-chance-track: linear-gradient('),
    'tool breakage chance slider should define a semantic green-yellow-red scale from theme tokens'
  );
  assert.ok(
    toolBreakageChanceControlBlock.includes('90deg')
      && toolBreakageChanceControlBlock.includes('var(--fab-tool-breakage-chance-low) 0%')
      && toolBreakageChanceControlBlock.includes('var(--fab-tool-breakage-chance-mid) 50%')
      && toolBreakageChanceControlBlock.includes('var(--fab-tool-breakage-chance-high) 100%'),
    'tool breakage chance slider should define the full green-yellow-red gradient across the whole rail'
  );
  assert.ok(
    toolBreakageChanceControlBlock.includes('height: 28px;')
      && toolBreakageChanceControlBlock.includes('min-height: 28px;')
      && toolBreakageChanceControlBlock.includes('padding: 0 var(--fab-tool-breakage-chance-thumb-radius);')
      && toolBreakageChanceControlBlock.includes('border: 1px solid var(--fab-mv2-border);')
      && toolBreakageChanceControlBlock.includes('border-radius: 6px;')
      && toolBreakageChanceControlBlock.includes('background: var(--fab-overlay-dark-18);')
      && toolBreakageChanceControlBlock.includes('box-shadow: inset 0 1px 0 var(--fab-overlay-dark-18);')
      && toolBreakageChanceControlBlock.includes('overflow: hidden;'),
    'tool breakage chance slider should keep the framed control chrome used by gathering task editing'
  );
  assert.ok(
    toolBreakageChanceTrackBlock.includes('left: var(--fab-tool-breakage-chance-thumb-radius);')
      && toolBreakageChanceTrackBlock.includes('right: var(--fab-tool-breakage-chance-thumb-radius);')
      && toolBreakageChanceTrackBlock.includes('border: 0;')
      && toolBreakageChanceTrackBlock.includes('background: var(--fab-tool-breakage-chance-track);'),
    'tool breakage chance custom rail should be inset to the thumb radius and paint the semantic gradient without endpoint tails'
  );
  assert.ok(toolBreakageChanceFillBlock.includes('display: none;'), 'tool breakage chance slider should not render a tier-coloured filled segment over the full gradient');
  assert.ok(
    toolBreakageChanceRangeBlock.includes('padding: 0;')
      && toolBreakageChanceRangeBlock.includes('background: transparent;')
      && toolBreakageChanceRangeBlock.includes('box-shadow: none;')
      && toolBreakageChanceRangeBlock.includes('accent-color: var(--fab-tool-breakage-chance-color);'),
    'tool breakage chance native range should not cover the custom rail and should use the dynamic current-risk colour'
  );
  assert.ok(
    toolBreakageChanceWebkitTrackBlock.includes('border: 0;')
      && toolBreakageChanceWebkitTrackBlock.includes('background: transparent;')
      && toolBreakageChanceMozTrackBlock.includes('border: 0;')
      && toolBreakageChanceMozTrackBlock.includes('background: transparent;'),
    'tool breakage chance native tracks should stay transparent so the inset custom rail is the only visible rail'
  );
  assert.ok(toolBreakageChanceWebkitThumbBlock.includes('background: var(--fab-tool-breakage-chance-color);') && toolBreakageChanceMozThumbBlock.includes('background: var(--fab-tool-breakage-chance-color);'), 'tool breakage chance slider thumbs should use the dynamic current-risk colour');
  assert.ok(toolBreakageChanceMozProgressBlock.includes('background: transparent;'), 'tool breakage chance Firefox native progress should not draw over the full gradient rail');
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
  assert.ok(dropQuantityCellBlock.includes('display: flex;') && dropQuantityCellBlock.includes('justify-content: center;') && dropQuantityCellBlock.includes('padding: var(--fab-space-chip);'), 'quantity cells should spend less horizontal space while centering the input');
  assert.ok(dropQuantityInputBlock.includes('max-width: 44px;') && dropQuantityInputBlock.includes('box-sizing: border-box;') && dropQuantityInputBlock.includes('text-align: center;') && dropQuantityInputBlock.includes('font-variant-numeric: tabular-nums;'), 'quantity should remain a compact numeric text input sized for three digits');
  assert.ok(dropQuantityInputOverrideBlock.includes('min-height: 28px;') && dropQuantityInputOverrideBlock.includes('padding: var(--fab-space-1);'), 'quantity should override generic gathering input padding without widening the column');
  assert.ok(dropModifierListBlock.includes('flex-wrap: wrap;') && dropModifierListBlock.includes('align-content: flex-start;'), 'drop modifiers should wrap into a top-aligned chip group');
  assert.ok(dropModifierListBlock.includes('max-height: 58px;') && dropModifierListBlock.includes('overflow-y: auto;'), 'drop modifiers should scroll after the two-line chip budget');
  assert.ok(dropModifierPillBlock.includes('background: var(--fab-overlay-light-06);'), 'drop modifier pills should use restrained neutral chip backgrounds');
  assert.ok(positiveDropModifierPillBlock.includes('color: var(--fab-mv2-text);') && negativeDropModifierPillBlock.includes('color: var(--fab-mv2-text);'), 'drop modifier chips should avoid saturated text across the whole pill');
  assert.ok(dropModifierOverflowBlock.includes('text-overflow: ellipsis;') && dropModifierOverflowBlock.includes('white-space: nowrap;'), 'the modifier overflow hint should stay a single clipped table label');
  assert.ok(dropEditorInputBlock.includes(':not([type="range"])'), 'selected drop inspector generic input chrome should not override row-style range sliders');
  assert.ok(dropEditorInputBlock.includes('height: 28px;') && dropEditorInputBlock.includes('min-height: 28px;') && dropEditorInputBlock.includes('padding: var(--fab-space-2xs) var(--fab-space-2);'), 'selected drop inspector generic inputs and selects should use compact 28px right-sidebar geometry');
  assert.ok(dropEditorValuesBlock.includes('grid-template-columns: minmax(0, 1fr) 72px;') && dropEditorValuesBlock.includes('align-items: end;'), 'selected drop inspector should place chance and count in a compact two-column grid');
  assert.ok(dropEditorRateValueBlock.includes('grid-template-columns: 64px minmax(0, 1fr);'), 'selected drop inspector chance should widen only the right-menu percent column');
  assert.ok(dropEditorRatePercentBlock.includes('height: 28px;') && dropEditorRatePercentBlock.includes('padding: var(--fab-space-1) var(--fab-space-4) var(--fab-space-1) var(--fab-space-2xs);') && dropEditorRatePercentBlock.includes('background: var(--fab-overlay-dark-18);'), 'selected drop inspector broad chance input rule should not carry the right-menu suffix padding');
  assert.ok(dropEditorRateInputBlock.includes('height: 28px;') && dropEditorRateInputBlock.includes('min-height: 28px;') && dropEditorRateInputBlock.includes('padding: var(--fab-space-1) var(--fab-space-4) var(--fab-space-1) var(--fab-space-chip);') && dropEditorRateInputBlock.includes('box-shadow: none;'), 'selected drop inspector chance input should keep compact row-style geometry without extra suffix padding');
  assert.ok(dropEditorRateSuffixBlock.includes('right: 8px;'), 'selected drop inspector percent suffix should sit away from three-digit values');
  assert.ok(dropEditorRateControlBlock.includes('height: 28px;') && dropEditorRateControlBlock.includes('padding: 0 var(--fab-space-2);') && dropEditorRateControlBlock.includes('background: var(--fab-overlay-dark-18);') && dropEditorRateControlBlock.includes('overflow: hidden;'), 'selected drop inspector slider should own the dark backing box instead of relying on native range chrome');
  assert.ok(dropEditorRateTrackBlock.includes('left: 7px;') && dropEditorRateTrackBlock.includes('right: 7px;') && dropEditorRateTrackBlock.includes('border: 0;') && dropEditorRateTrackBlock.includes('background: var(--fab-overlay-dark-18);'), 'selected drop inspector custom track should be inset to the thumb radius to avoid endpoint tails');
  assert.ok(dropEditorRateFillBlock.includes('border-radius: 999px;'), 'selected drop inspector fill should be rounded without relying on a wider track border');
  assert.equal(dropRateTrackBlock.includes('linear-gradient'), false, 'drop chance slider styling should keep the flat-ui no-gradient contract');
  assert.equal(dropEditorRateTrackBlock.includes('linear-gradient'), false, 'selected drop inspector slider styling should keep the flat-ui no-gradient contract');
  assert.ok(dropEditorRateRangeBlock.includes('height: 26px;') && dropEditorRateRangeBlock.includes('padding: 0;') && dropEditorRateRangeBlock.includes('background: transparent;') && dropEditorRateRangeBlock.includes('box-shadow: none;'), 'selected drop inspector native range should remain a transparent thumb hit target over the custom track');
  assert.ok(dropEditorRateWebkitTrackBlock.includes('border: 0;') && dropEditorRateWebkitTrackBlock.includes('background: transparent;'), 'selected drop inspector WebKit native range track should not draw over the custom track');
  assert.ok(dropEditorRateMozTrackBlock.includes('border: 0;') && dropEditorRateMozTrackBlock.includes('background: transparent;'), 'selected drop inspector Firefox native range track should not draw over the custom track');
  assert.ok(dropEditorCountBlock.includes('display: grid;') && dropEditorCountBlock.includes('gap: var(--fab-space-chip);'), 'selected drop inspector count editor should use a compact labeled field');
  assert.ok(dropEditorCountInputBlock.includes('min-height: 28px;') && dropEditorCountInputBlock.includes('text-align: center;'), 'selected drop inspector count input should match row count input geometry');
  assert.ok(dropEditorInspectorCountInputBlock.includes('height: 28px;') && dropEditorInspectorCountInputBlock.includes('min-height: 28px;') && dropEditorInspectorCountInputBlock.includes('padding: var(--fab-space-1);') && dropEditorInspectorCountInputBlock.includes('box-shadow: none;'), 'selected drop inspector count input should override generic inspector input chrome with chance-field geometry');
  assert.ok(dropInspectorButtonBlock.includes('min-height: 28px;') && dropInspectorButtonBlock.includes('padding: 0 var(--fab-space-2);'), 'selected drop inspector text buttons should match the compact 28px sidebar rhythm');
  assert.ok(dropInspectorIconButtonBlock.includes('width: 28px;') && dropInspectorIconButtonBlock.includes('height: 28px;') && dropInspectorIconButtonBlock.includes('flex: 0 0 28px;'), 'selected drop inspector icon buttons should match the compact 28px sidebar rhythm');
  assert.ok(dropInspectorSearchInputBlock.includes('height: 28px;') && dropInspectorSearchInputBlock.includes('min-height: 28px;') && dropInspectorSearchInputBlock.includes('padding-block: 0;'), 'selected drop inspector search input should keep icon padding while using 28px height');
  assert.ok(dropInspectorCharacterFieldBlock.includes('height: 28px;') && dropInspectorCharacterFieldBlock.includes('min-height: 28px;') && dropInspectorCharacterFieldBlock.includes('padding: var(--fab-space-2xs) var(--fab-space-2);'), 'selected drop inspector character modifier fields should override shared 36px field height');
  assert.ok(dropInspectorCharacterOperatorBlock.includes('height: 28px;') && dropInspectorCharacterOperatorBlock.includes('min-height: 28px;') && dropInspectorCharacterOperatorBlock.includes('padding: 0 var(--fab-space-chip);'), 'selected drop inspector character modifier operator select should keep compact 28px height');
  assert.ok(dropEditorActionsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));') && dropEditorActionsBlock.includes('margin-top: 0;'), 'selected drop rule actions should sit beneath the inspector title row');
  assert.ok(dropInspectorStackBlock.includes('grid-template-rows: auto auto minmax(0, 1fr);'), 'selected drop inspector should reserve fixed header, divider, and lower scroll rows');
  assert.ok(dropInspectorStackBlock.includes('height: 100%;') && dropInspectorStackBlock.includes('overflow: visible;'), 'selected drop inspector stack should allow the divider to span the full right inspector width');
  assert.ok(dropInspectorRouteBlock.includes('overflow: hidden;'), 'gathering task edit inspector should delegate selected-drop scrolling to the lower viewport');
  assert.ok(dropInspectorDividerBlock.includes('width: calc(100% + 24px);') && dropInspectorDividerBlock.includes('margin: var(--fab-space-3) calc(-1 * var(--fab-space-3)) 0;'), 'selected drop inspector divider should bleed through the right inspector padding');
  assert.ok(dropInspectorDividerBlock.includes('height: 1px;') && dropInspectorDividerBlock.includes('background: var(--fab-mv2-border);'), 'selected drop inspector should render a visible divider below the header');
  assert.ok(dropInspectorScrollBlock.includes('overflow: hidden auto;'), 'selected drop lower editor content should own vertical scrolling without horizontal overflow');
  assert.ok(dropInspectorScrollBlock.includes('padding-top: var(--fab-space-3);') && dropInspectorScrollBlock.includes('gap: var(--fab-space-3);'), 'selected drop scroll viewport should visually separate lower cards from the divider');
  assert.equal(css.includes('.fabricate-manager .manager-drop-actions'), false, 'drop row actions should not reserve row layout or styling');
  assert.equal(taskEditorIntermediateQuery.includes('.manager-gathering-task-drop-row {\n    grid-template-columns: minmax(0, 1fr);'), false, 'task editor should not stack drop rows at the intermediate desktop width');
  assert.ok(taskEditorIntermediateQuery.includes('minmax(154px, 1.04fr) 54px minmax(150px, 1.38fr)'), 'intermediate task editor drop grid should preserve drop chance width while widening modifiers');
  assert.ok(dropTableRankedBlock.includes('--fab-mv2-task-drop-grid: 44px minmax(0, 0.92fr) minmax(220px, 1.35fr) 56px minmax(180px, 1.65fr);'), 'ranked-mode drop grid should prepend a narrow 44px rank column and take width from the component column while preserving drop chance and quantity widths');
  assert.ok(taskEditorIntermediateQuery.includes('--fab-mv2-task-drop-grid: 44px minmax(0, 0.96fr) minmax(154px, 1.04fr) 54px minmax(150px, 1.38fr);'), 'intermediate ranked-mode drop grid should keep drop chance and quantity widths while reducing the component column');
  assert.ok(dropRankCellBlock.includes('display: flex;') && dropRankCellBlock.includes('flex-direction: column;'), 'rank cell should stack the up button, label, and down button vertically');
  assert.ok(dropRankValueBlock.includes('text-align: center;') && dropRankValueBlock.includes('line-height: 1;'), 'rank value should sit centered between the buttons with a tight line height');
  assert.ok(dropRankButtonBlock.includes('width: 18px;') && dropRankButtonBlock.includes('height: 18px;'), 'rank reorder buttons should be small enough to stack inside the row');
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-gathering-task-drop-table-head,\n  .fabricate-manager .manager-gathering-task-drop-row') && mediumQuery.includes('grid-template-columns: var(--fab-mv2-task-drop-grid);'),
    'medium manager layout should preserve the drop row grid and headers instead of duplicate row labels'
  );
  assert.equal(css.includes('.fabricate-manager .manager-gathering-task-row .manager-environment-reorder-stack'), false, 'task rows should not render environment reorder controls');
});

test('manager components browser defines drop target and compact responsive table geometry', () => {
  const tableBlock = blockFor('.fabricate-manager .manager-components-table');
  const toolbarBlock = Array.from(css.matchAll(/\.fabricate-manager \.manager-toolbar\s*\{[\s\S]*?\}/g))
    .map(match => match[0])
    .join('\n');
  const toolbarPrimaryBlock = blockFor('.fabricate-manager .manager-toolbar-primary');
  const toolbarPillsBlock = blockFor('.fabricate-manager .manager-toolbar-pills');
  const dropBlock = blockFor('.fabricate-manager .manager-component-drop-zone');
  const tagSearchBlock = blockFor('.fabricate-manager .manager-tag-search');
  const tagSuggestionsBlock = blockFor('.fabricate-manager .manager-tag-suggestions');
  const selectedTagPillBlock = blockFor('.fabricate-manager .manager-selected-tag-pill');
  const identityBlock = blockFor('.fabricate-manager .manager-component-identity');
  const componentCopyBlock = blockFor('.fabricate-manager .manager-component-identity .manager-system-copy');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));

  assert.ok(
    css.includes('.fabricate-manager[data-manager-view="components"] .manager-main'),
    'components route should reserve rows for header, drop target, toolbar, and table'
  );
  assert.ok(
    tableBlock.includes('--fab-mv2-component-grid: minmax(0, 1.42fr)'),
    'components table should define shrinkable compact columns for normal Foundry manager widths'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-components-table.has-no-tags.has-no-essences.has-progressive-difficulty'),
    'components table should have a no-tags/no-essences progressive grid variant'
  );
  assert.ok(dropBlock.includes('grid-template-columns: 42px minmax(0, 1fr);'), 'component drop zone should reserve icon and copy space');
  assert.ok(dropBlock.includes('margin: var(--fab-space-3);'), 'component drop zone should keep balanced vertical spacing around the toolbar');
  assert.ok(css.includes('.fabricate-manager .manager-component-drop-zone.is-drop-active'), 'component drop zone should expose an active drag state');
  assert.ok(toolbarBlock.includes('display: grid;'), 'manager toolbar should own a grid layout for primary controls and auxiliary rows');
  assert.ok(toolbarBlock.includes('grid-template-columns: minmax(0, 1fr);'), 'manager toolbar grid should keep rows bounded to the main content width');
  assert.ok(toolbarPrimaryBlock.includes('display: flex;'), 'manager primary toolbar row should lay out controls as a flex row');
  assert.ok(toolbarPrimaryBlock.includes('flex-wrap: wrap;'), 'manager primary toolbar row should wrap controls without involving selected pills');
  assert.ok(toolbarPillsBlock.includes('display: flex;'), 'manager pill row should be its own flex row');
  assert.ok(toolbarPillsBlock.includes('flex-wrap: wrap;'), 'manager pill row should wrap selected tags independently');
  assert.ok(toolbarPillsBlock.includes('width: 100%;'), 'manager pill row should occupy a full toolbar row');
  assert.ok(tagSearchBlock.includes('position: relative;'), 'component tag search should anchor its suggestion list to the control');
  assert.ok(tagSearchBlock.includes('max-width: 320px;'), 'component tag search should keep bounded toolbar geometry');
  assert.ok(tagSuggestionsBlock.includes('position: absolute;'), 'component tag suggestions should overlay below the search field without shifting the toolbar');
  assert.ok(tagSuggestionsBlock.includes('max-height: 148px;'), 'component tag suggestions should be scroll bounded');
  assert.ok(selectedTagPillBlock.includes('padding-right: var(--fab-space-1);'), 'selected tag pills should reserve compact space for the remove button');
  assert.ok(
    identityBlock.includes('grid-template-columns: 46px minmax(0, 1fr);')
      || css.includes('.fabricate-manager .manager-recipe-identity,\n.fabricate-manager .manager-component-identity,\n.fabricate-manager .manager-environment-identity'),
    'component identity should reserve thumbnail space'
  );
  assert.ok(
    componentCopyBlock.includes('max-height: 52px;') && componentCopyBlock.includes('overflow: hidden;'),
    'component identity copy should clamp inside the row instead of overflowing below the thumbnail'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-component-row') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium manager layout should stack component rows before columns become cramped'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-action-group.manager-labeled-cell') && mediumQuery.includes('display: flex;'),
    'stacked component action groups should keep buttons in a compact action cluster'
  );
});

test('manager essence browser defines compact responsive table geometry', () => {
  const tableBlock = blockFor('.fabricate-manager .manager-essences-table');
  const noSourceBlock = blockFor('.fabricate-manager .manager-essences-table.has-no-source');
  const identityBlock = blockFor('.fabricate-manager .manager-essence-identity');
  const sourceImageBlock = blockFor('.fabricate-manager .manager-essence-source-cell-image');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));

  assert.ok(
    css.includes('.fabricate-manager[data-manager-view="essences"] .manager-main'),
    'essences route should define route-specific rows'
  );
  assert.ok(
    blockFor('.fabricate-manager[data-manager-view="essences"] .manager-main').includes('grid-template-rows: auto auto minmax(0, 1fr);'),
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
    mediumQuery.includes('.fabricate-manager .manager-essence-row') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium manager layout should stack essence rows before columns become cramped'
  );
});

test('manager essence edit route defines picker-based responsive geometry', () => {
  const mainBlock = blockFor('.fabricate-manager[data-manager-view="essence-edit"] .manager-main');
  const editGridBlock = blockFor('.fabricate-manager .manager-essence-edit-grid');
  const sourceSummaryBlock = blockFor('.fabricate-manager .manager-essence-source-summary');
  const inspectorSourceSummaryBlock = blockFor('.fabricate-manager .manager-essence-inspector-source-summary');
  const inspectorSourceActionsBlock = blockFor('.fabricate-manager .manager-essence-inspector-source-actions');
  const warningActionBlock = blockFor('.fabricate-manager .manager-button.is-warning-action,\n.fabricate-manager .manager-icon-button.is-warning-action');
  const sourceDropBlock = blockFor('.fabricate-manager .manager-essence-source-drop-zone .essence-source-trigger');
  const usageGridBlock = blockFor('.fabricate-manager .manager-essence-usage-grid');
  const usageItemBlock = blockFor('.fabricate-manager .manager-essence-usage-item');
  const iconTriggerBlock = blockFor('.fabricate-manager .essence-icon-picker-trigger');
  const sourceTriggerBlock = blockFor('.fabricate-manager .essence-source-trigger');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 680px)'));

  assert.ok(mainBlock.includes('grid-template-rows: minmax(0, 1fr);'), 'essence edit route should let the identity card be the first main content');
  assert.ok(editGridBlock.includes('grid-template-columns: var(--fab-mv2-essence-icon-column, 156px) minmax(0, 1fr);'), 'essence edit identity fields should reserve stable icon picker space');
  assert.ok(sourceSummaryBlock.includes('grid-template-columns: 54px minmax(0, 1fr) 34px;'), 'essence source summary should reserve source image, evidence, and clear action columns');
  assert.ok(!inspectorSourceSummaryBlock.includes('grid-template-columns: 54px minmax(0, 1fr) auto;'), 'inspector source summary should not crowd evidence and unlink into a three-column row');
  assert.ok(inspectorSourceSummaryBlock.includes('grid-template-columns: 54px minmax(0, 1fr);'), 'inspector source summary should be only the linked item evidence card');
  assert.ok(inspectorSourceActionsBlock.includes('margin-top: var(--fab-space-3);'), 'inspector source action row should sit below the linked item card');
  assert.ok(inspectorSourceActionsBlock.includes('display: grid;'), 'inspector source actions should use stable row geometry');
  assert.ok(inspectorSourceActionsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'inspector source actions should keep copy and unlink on the same row');
  assert.ok(!mediumQuery.includes('.fabricate-manager .manager-essence-inspector-source-actions .manager-button'), 'narrow manager layout should not stack the selected essence source actions');
  assert.ok(warningActionBlock.includes('var(--fab-warning'), 'unlink source should have an amber warning-action button style');
  assert.ok(sourceDropBlock.includes('width: 100%;'), 'essence source drop target should use the full source panel width');
  assert.ok(sourceDropBlock.includes('height: 84px;'), 'essence source drop target should have a stable wide drop-zone height');
  assert.ok(iconTriggerBlock.includes('grid-template-columns: 28px minmax(0, 1fr) 16px;'), 'icon picker trigger should be a real picker control, not a raw text field');
  assert.ok(sourceTriggerBlock.includes('aspect-ratio: 1 / 1;'), 'source picker should keep a stable drop target');
  assert.ok(usageGridBlock.includes('max-height: 132px;'), 'essence usage thumbnails should stay scroll-contained in the inspector');
  assert.ok(usageItemBlock.includes('aspect-ratio: 1 / 1;'), 'essence usage thumbnails should be square image-only controls');
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-essence-edit-grid')
      && mediumQuery.includes('.fabricate-manager .manager-essence-source-summary'),
    'narrow manager layout should stack essence edit controls'
  );
});

test('manager environments browser and edit route define compact responsive geometry', () => {
  const toolbarBlock = blockFor('.fabricate-manager .manager-environments-toolbar');
  const gatheringPanelBlock = blockFor('.fabricate-manager .manager-gathering-panel');
  const gatheringEnvironmentsPanelBlock = blockFor('.fabricate-manager .manager-gathering-panel-environments');
  const tableScrollBlock = blockFor('.fabricate-manager .manager-table-scroll');
  const tableBlock = blockFor('.fabricate-manager .manager-environments-table');
  const taskCountBlock = blockFor('.fabricate-manager .manager-environment-task-count');
  const actionsBlock = blockFor('.fabricate-manager .manager-environment-actions');
  const actionGridBlock = blockFor('.fabricate-manager .manager-environment-action-grid');
  const reorderStackBlock = blockFor('.fabricate-manager .manager-environment-reorder-stack');
  const editorShellBlock = blockFor('.fabricate-manager .manager-environment-editor-shell');
  const editorViewBlock = blockFor('.fabricate-manager .manager-environment-edit-view');
  const detailsGridBlock = blockFor('.fabricate-manager .manager-environment-details-grid');
  const workspaceBlock = blockFor('.fabricate-manager .manager-environment-workspace');
  const weightInputBlock = blockFor('.fabricate-manager .manager-environment-comp-weight-field input');
  const compMenuBlock = blockFor('.fabricate-manager .manager-environment-comp-menu');
  const compMenuButtonBlock = blockFor('.fabricate-manager .manager-environment-comp-menu button');
  const compMenuIconBlock = blockFor('.fabricate-manager .manager-environment-comp-menu button > i');
  const compMenuLabelBlock = blockFor('.fabricate-manager .manager-environment-comp-menu button > span');
  const compMenuNoteBlock = blockFor('.fabricate-manager .manager-environment-comp-menu-note');
  const compMenuNoteBeforeBlock = blockFor('.fabricate-manager .manager-environment-comp-menu-note::before');
  const compQuickActionBlock = blockFor('.fabricate-manager .manager-environment-comp-quick-action');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const environmentCompContainerQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 960px)'));

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
    'gathering panels should participate in the manager bounded grid instead of expanding to content height'
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
    tableBlock.includes('--fab-mv2-environment-grid: minmax(0, 1fr) 120px 56px 88px 116px;'),
    'environments table should define one flexible identity column and fixed compact columns so headers and rows align'
  );
  assert.ok(
    !css.includes('.fabricate-manager .manager-environment-row {\n  position: relative;\n  min-height: 88px;\n}'),
    'environment rows should no longer carry the taller reorder-overlay height override'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-environment-row,') && css.includes('min-height: 76px;'),
    'environment rows should share the compact 76px row height with the task and event browsers'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-environment-identity {\n  grid-template-columns: 64px minmax(0, 1fr);\n  gap: var(--fab-space-3);\n  align-self: center;\n  min-height: 64px;'),
    'environment identity should reserve a square 64px thumbnail column like the task and event browsers'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-environment-thumb {\n  display: block;\n  align-self: center;\n  width: 64px;\n  height: 64px;'),
    'environment thumbnails should render as a square 64px image that suits both scene thumbnails and chosen images'
  );
  assert.ok(taskCountBlock.includes('font-weight: 800;'), 'environment task count should render as plain emphasized text');
  assert.ok(actionGridBlock.includes('display: flex;'), 'environment edit duplicate delete buttons should sit inline in a flex row');
  assert.ok(
    !css.includes('.fabricate-manager .manager-environment-action-grid .manager-icon-button.is-danger {\n  grid-column: 2;\n}'),
    'environment delete quick action should no longer be forced into a second reorder-era grid column'
  );
  assert.ok(
    !css.includes('manager-environment-reorder-stack'),
    'environment reorder controls and their styles should be removed'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-environment-row .manager-status-cell'),
    'environment status cells should align the shared compact status toggle'
  );
  assert.ok(
    css.includes('.fabricate-manager[data-manager-view="environment-edit"] .manager-main'),
    'environment edit route should reserve scrollable editor space'
  );
  assert.ok(
    editorShellBlock.includes('overflow: hidden;') && editorShellBlock.includes('grid-template-rows: minmax(0, 1fr);'),
    'environment editor shell should bound the editor height (not scroll) so the tab bar stays fixed'
  );
  assert.ok(
    blockFor('.fabricate-manager .manager-environment-tab-panel').includes('overflow: auto;'),
    'the environment editor tab panel should own internal scroll while the tab bar stays pinned'
  );
  assert.ok(
    css.includes('.fabricate-manager[data-manager-view="environment-edit"] .manager-body') && css.includes('grid-template-columns: 220px minmax(0, 1fr);'),
    'environment edit route should replace the browse inspector with a two-region rail/editor grid'
  );
  assert.ok(editorViewBlock.includes('grid-template-rows: auto minmax(0, 1fr);'), 'environment editor should reserve details band plus scrollable workspace');
  assert.ok(
    detailsGridBlock.includes('grid-template-columns: minmax(300px, 1.02fr) minmax(360px, 1.1fr) minmax(230px, 0.58fr);'),
    'environment details band should expose identity, scene linkage, and status/evidence at normal widths'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-environment-status-card {\n  display: flex;'),
    'environment details band should include a compact status/evidence card'
  );
  assert.ok(
    workspaceBlock.includes('grid-template-columns: minmax(0, 1fr) 300px;'),
    'environment editor workspace should pair the main composition column with a fixed 300px inspector (matching the standard manager inspector width) at normal widths'
  );
  const compBlock = blockFor('.fabricate-manager .manager-environment-comp');
  assert.ok(
    compBlock.includes('--fab-env-comp-grid: minmax(0, 1fr) 92px 132px 92px;'),
    'composition grid keeps the shared fallback layout for non-task rows'
  );
  assert.ok(
    css.includes('.manager-environment-comp[data-composition-kind="task"]')
      && css.includes('--fab-env-comp-grid: minmax(0, 1fr) 72px 132px 72px;'),
    'task rows reserve space for a quick action icon beside the overflow-menu action'
  );
  assert.ok(
    css.includes('.manager-environment-comp[data-composition-kind="task"][data-composition-selection="blind"]')
      && css.includes('--fab-env-comp-grid: minmax(0, 1fr) 112px 72px 132px 72px;'),
    'blind-mode tasks add a compact Weight column for the input and calculated percentage'
  );
  assert.ok(
    environmentCompContainerQuery.includes('.fabricate-manager .manager-environment-comp[data-composition-kind="task"]')
      && environmentCompContainerQuery.includes('--fab-env-comp-grid: minmax(0, 1fr) 64px 110px 72px;'),
    'narrow task rows key off manager container width and keep enough action-column width for quick action plus menu buttons'
  );
  assert.ok(
    weightInputBlock.includes('width: 42px;') && weightInputBlock.includes('padding: var(--fab-space-2xs) var(--fab-space-1);'),
    'blind task weight input should be visually sized for three characters'
  );
  assert.ok(
    compQuickActionBlock.includes('flex: 0 0 34px;'),
    'composition quick actions should keep the same fixed geometry as manager icon buttons'
  );
  assert.ok(
    compMenuBlock.includes('right: 0;') && compMenuBlock.includes('top: calc(100% + 4px);'),
    'composition overflow menus should stay anchored to the row action button'
  );
  assert.ok(
    compMenuBlock.includes('width: max-content;')
      && compMenuBlock.includes('max-width: min(260px, calc(100vw - 32px));')
      && compMenuBlock.includes('min-width: 176px;'),
    'composition overflow menus should size to single-line labels with compact minimum and bounded maximum widths'
  );
  assert.ok(
    compMenuButtonBlock.includes('display: grid;') && compMenuButtonBlock.includes('grid-template-columns: 18px minmax(0, 1fr);'),
    'composition overflow menu items should reserve a fixed icon column before a truncating label column'
  );
  assert.ok(
    compMenuButtonBlock.includes('min-width: 0;'),
    'composition overflow menu rows should be allowed to shrink inside the flex menu container'
  );
  assert.ok(
    compMenuButtonBlock.includes('justify-content: start;')
      && compMenuButtonBlock.includes('place-items: center start;')
      && compMenuButtonBlock.includes('text-align: left;'),
    'composition overflow menu item content should be left-aligned'
  );
  assert.ok(
    compMenuButtonBlock.includes('white-space: nowrap;'),
    'composition overflow menu labels should remain on one line'
  );
  assert.ok(
    compMenuButtonBlock.includes('font-size: 0.82rem;') && compMenuButtonBlock.includes('font-weight: 500;'),
    'composition overflow menu items should use compact lighter text'
  );
  assert.ok(
    compMenuIconBlock.includes('justify-self: center;'),
    'composition overflow menu icons should stack in the center of the fixed icon column'
  );
  assert.ok(
    compMenuLabelBlock.includes('display: block;')
      && compMenuLabelBlock.includes('min-width: 0;')
      && compMenuLabelBlock.includes('max-width: 100%;')
      && compMenuLabelBlock.includes('overflow: hidden;')
      && compMenuLabelBlock.includes('text-overflow: ellipsis;'),
    'composition overflow menu labels should truncate inside the bounded menu width'
  );
  assert.ok(
    compMenuNoteBlock.includes('grid-template-columns: 18px minmax(0, 1fr);')
      && compMenuNoteBlock.includes('min-width: 0;')
      && compMenuNoteBlock.includes('white-space: nowrap;')
      && compMenuNoteBlock.includes('font-size: 0.82rem;')
      && compMenuNoteBlock.includes('font-weight: 500;'),
    'disabled composition menu notes should share the compact row geometry'
  );
  assert.ok(
    compMenuNoteBeforeBlock.includes('content: "";') && compMenuNoteBeforeBlock.includes('width: 18px;'),
    'disabled composition menu notes should reserve the same icon column even without an icon'
  );
  assert.ok(
    compBlock.includes('--fab-env-comp-grid-ranked: 30px minmax(0, 1fr) 92px 132px 92px;')
      && css.includes('.fabricate-manager .manager-environment-comp-head.has-rank-controls')
      && css.includes('.fabricate-manager .manager-environment-comp-row.has-rank-controls'),
    'ranked events opt into a leading 30px handle column ahead of the task/override/runtime cells'
  );
  assert.ok(
    !compBlock.includes('minmax(150px'),
    'composition grid should not hard-floor flexible columns and overflow the panel'
  );
  assert.ok(
    !css.includes('manager-environment-evidence-column'),
    'environment editor CSS should no longer reference the removed evidence column'
  );
  assert.ok(
    !css.includes('.manager-environment-comp-evidence'),
    'environment editor CSS should no longer reference the removed inline-row evidence cell'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-environment-validation-band'),
    'environment editor should style the collapsible validation band above the workspace'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-scene-drop-zone'),
    'environment editor should style the scene drag-drop zone'
  );
  assert.ok(
    css.includes('.fabricate-manager .image-path-picker.is-button-only .image-path-picker-button'),
    'environment editor should style the button-only ImagePathPicker variant'
  );
  assert.ok(css.includes('.fabricate-manager .manager-environment-scene-card'), 'environment editor should define a linked scene card');
  assert.ok(css.includes('.fabricate-manager .manager-task-tabs'), 'environment editor should define task tabs');
  assert.equal(css.includes('.fabricate-manager .manager-environment-details-tabs'), false, 'environment editor should not define removed environment advanced tabs');
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-environment-row') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium manager layout should stack environment rows before columns become cramped'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-environment-editor-shell') && mediumQuery.includes('overflow: visible;'),
    'stacked environment edit layout should release nested scroll containment'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-environment-workspace') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'stacked environment editor should put details, task rail, editor, and evidence in one column'
  );
});

test('manager environment inspector evidence table wraps compact pills without horizontal overflow', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 360 }, deviceScaleFactor: 1 });

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
              padding: 16px;
              font-family: Arial, sans-serif;
            }
            .harness {
              width: 260px;
            }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <section class="manager-inspector-card harness">
              <h3 class="manager-card-title">Matching evidence</h3>
              <table class="manager-environment-evidence is-checks manager-environment-evidence-table" aria-label="Matching evidence">
                <tbody>
                  <tr class="manager-environment-evidence-row is-positive" data-evidence-field="biome" data-evidence-state="match">
                    <th class="manager-environment-evidence-dimension" scope="row">Biome</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-positive" data-evidence-value-state="match">Forest</span>
                        <span class="manager-environment-evidence-value-pill is-danger" data-evidence-value-state="mismatch">VeryLongUnbrokenBiomeNameThatMustWrapInsideTheInspectorColumn</span>
                      </div>
                    </td>
                  </tr>
                  <tr class="manager-environment-evidence-row is-positive" data-evidence-field="region" data-evidence-state="match">
                    <th class="manager-environment-evidence-dimension" scope="row">Region</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-positive" data-evidence-value-state="match">North</span>
                      </div>
                    </td>
                  </tr>
                  <tr class="manager-environment-evidence-row is-warning" data-evidence-field="weather" data-evidence-state="mismatch">
                    <th class="manager-environment-evidence-dimension" scope="row">Weather</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-warning" data-evidence-value-state="mismatch">Storm</span>
                      </div>
                    </td>
                  </tr>
                  <tr class="manager-environment-evidence-row is-warning" data-evidence-field="time" data-evidence-state="mismatch">
                    <th class="manager-environment-evidence-dimension" scope="row">Time</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-warning" data-evidence-value-state="mismatch">Night</span>
                      </div>
                    </td>
                  </tr>
                  <tr class="manager-environment-evidence-row is-any" data-evidence-field="danger" data-evidence-state="any">
                    <th class="manager-environment-evidence-dimension" scope="row">Danger</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-any" data-evidence-value-state="any">Any danger</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
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
      const table = document.querySelector('.manager-environment-evidence-table');
      const card = document.querySelector('.manager-inspector-card');
      const longPill = Array.from(document.querySelectorAll('.manager-environment-evidence-value-pill'))
        .find(pill => pill.textContent.includes('VeryLongUnbroken'));
      const rowStyle = getComputedStyle(document.querySelector('.manager-environment-evidence-row'));
      const tableStyle = getComputedStyle(table);
      const dimensionStyle = getComputedStyle(document.querySelector('.manager-environment-evidence-dimension'));
      const valueCellStyle = getComputedStyle(document.querySelector('.manager-environment-evidence-values'));
      const valueListStyle = getComputedStyle(document.querySelector('.manager-environment-evidence-value-list'));
      const pillStyle = getComputedStyle(longPill);
      const valueCells = Array.from(document.querySelectorAll('.manager-environment-evidence-values')).map(rectFor);

      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        rowFields: Array.from(document.querySelectorAll('.manager-environment-evidence-row')).map(row => row.dataset.evidenceField),
        table: rectFor(table),
        card: rectFor(card),
        longPill: rectFor(longPill),
        firstValueCell: valueCells[0],
        valueLefts: valueCells.map(cell => Math.round(cell.left)),
        rowBorderBottom: rowStyle.borderBottomWidth,
        rowBackgroundColor: rowStyle.backgroundColor,
        tableStyle: {
          display: tableStyle.display,
          tableLayout: tableStyle.tableLayout,
          backgroundColor: tableStyle.backgroundColor
        },
        dimensionStyle: {
          width: dimensionStyle.width,
          fontWeight: dimensionStyle.fontWeight,
          backgroundColor: dimensionStyle.backgroundColor
        },
        valueCellStyle: {
          backgroundColor: valueCellStyle.backgroundColor
        },
        valueListStyle: {
          display: valueListStyle.display,
          flexWrap: valueListStyle.flexWrap
        },
        pillStyle: {
          borderRadius: pillStyle.borderRadius,
          overflowWrap: pillStyle.overflowWrap,
          backgroundColor: pillStyle.backgroundColor
        }
      };
    });

    assert.deepEqual(report.rowFields, ['biome', 'region', 'weather', 'time', 'danger'], 'inspector evidence table should render all five rows');
    assert.equal(report.tableStyle.display, 'table', 'inspector evidence should keep table layout despite shared evidence flex styles');
    assert.equal(report.tableStyle.tableLayout, 'fixed', 'inspector evidence table should keep fixed columns');
    assert.equal(report.tableStyle.backgroundColor, 'rgba(0, 0, 0, 0)', 'inspector evidence table should not draw a dark inset panel');
    assert.equal(report.rowBackgroundColor, 'rgba(0, 0, 0, 0)', 'inspector evidence rows should not draw alternating backgrounds');
    assert.equal(report.dimensionStyle.backgroundColor, 'rgba(0, 0, 0, 0)', 'inspector evidence label cells should not draw row fill');
    assert.equal(report.valueCellStyle.backgroundColor, 'rgba(0, 0, 0, 0)', 'inspector evidence value cells should not draw row fill');
    assert.equal(report.rowBorderBottom, '1px', 'inspector evidence rows should use horizontal separators');
    assert.ok(report.dimensionStyle.width.startsWith('82'), 'inspector evidence labels should keep a fixed left column');
    assert.ok(Number(report.dimensionStyle.fontWeight) >= 650, 'inspector evidence labels should render as strong labels');
    assert.equal(report.valueListStyle.display, 'flex', 'inspector values should align as inline pill rows');
    assert.equal(report.valueListStyle.flexWrap, 'wrap', 'inspector value pills should wrap inside the right column');
    assert.equal(new Set(report.valueLefts).size, 1, 'inspector value columns should align across rows');
    assert.ok(report.table.right <= report.card.right + 1, 'evidence table should stay inside the inspector card');
    assert.ok(report.documentWidth <= report.viewportWidth, 'evidence table should not create page-level horizontal overflow');
    assert.ok(report.longPill.width <= report.firstValueCell.width + 1, 'long value pills should stay inside the right column');
    assert.ok(report.longPill.height > 20, 'long value pills should wrap to multiple compact lines instead of clipping');
    assert.equal(report.pillStyle.borderRadius, '4px', 'value pills should use compact chip corners');
    assert.equal(report.pillStyle.overflowWrap, 'anywhere', 'value pills should be able to break long localized values');
    assert.notEqual(report.pillStyle.backgroundColor, 'rgba(0, 0, 0, 0)', 'status pills should retain subtle state backgrounds');
  } finally {
    await page.close();
    await browser.close();
  }
});

test('manager environment composition overflow menu renders bounded single-line rows', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 260 }, deviceScaleFactor: 1 });

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
              padding: 16px;
              font-family: Arial, sans-serif;
            }
            .harness {
              position: relative;
              width: 320px;
              height: 180px;
            }
            .harness .manager-environment-comp-menu-wrap {
              width: 34px;
              margin-left: 260px;
            }
            .harness .manager-icon-button {
              width: 34px;
              height: 34px;
            }
            .fa-solid::before,
            .fas::before {
              content: "■";
              display: inline-block;
              width: 10px;
              font-size: 10px;
            }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <div class="harness">
              <div class="manager-environment-comp-menu-wrap">
                <button type="button" class="manager-icon-button" aria-label="Open task actions">
                  <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
                </button>
                <div class="manager-environment-comp-menu" role="menu">
                  <button type="button" role="menuitem">
                    <i class="fas fa-up-right-from-square" aria-hidden="true"></i>
                    <span>OpenSourceRecordWithAnIntentionallyExtendedLocalizedMenuLabelThatMustTruncateInsideTheBoundedMenuWidth</span>
                  </button>
                  <button type="button" role="menuitem" class="is-danger">
                    <i class="fas fa-ban" aria-hidden="true"></i>
                    <span>Exclude from environment</span>
                  </button>
                  <button type="button" role="menuitem" class="manager-environment-comp-menu-note" disabled>
                    <span>EnableInLibraryFirstWithAnIntentionallyExtendedLocalizedNoteThatMustTruncateInsideTheBoundedMenuWidth</span>
                  </button>
                </div>
              </div>
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
        const labelStyle = getComputedStyle(label);
        return {
          row: rectFor(element),
          icon: icon ? rectFor(icon) : null,
          label: rectFor(label),
          rowStyle: {
            display: rowStyle.display,
            gridTemplateColumns: rowStyle.gridTemplateColumns,
            justifyContent: rowStyle.justifyContent,
            justifyItems: rowStyle.justifyItems,
            textAlign: rowStyle.textAlign,
            whiteSpace: rowStyle.whiteSpace,
            fontSize: rowStyle.fontSize,
            fontWeight: rowStyle.fontWeight
          },
          labelStyle: {
            overflow: labelStyle.overflow,
            textOverflow: labelStyle.textOverflow,
            whiteSpace: labelStyle.whiteSpace
          },
          labelClientWidth: label.clientWidth,
          labelScrollWidth: label.scrollWidth
        };
      };

      return {
        viewportWidth: window.innerWidth,
        wrap: rectFor(document.querySelector('.manager-environment-comp-menu-wrap')),
        menu: rectFor(document.querySelector('.manager-environment-comp-menu')),
        rows: Array.from(document.querySelectorAll('.manager-environment-comp-menu button')).map(rowFor)
      };
    });

    const [firstRow, dangerRow, noteRow] = report.rows;
    const iconCenters = [firstRow, dangerRow].map(row => row.icon.left + (row.icon.width / 2));
    const labelLefts = report.rows.map(row => row.label.left);

    assert.ok(report.menu.width <= 261, 'composition menu should render within the bounded maximum width');
    assert.ok(report.menu.right <= report.viewportWidth - 16, 'composition menu should avoid viewport horizontal overflow');
    assert.ok(Math.abs(report.menu.right - report.wrap.right) <= 1, 'composition menu should remain right-aligned to the action button');
    assert.ok(report.rows.every(row => row.rowStyle.display === 'grid'), 'composition menu rows should render as grid rows');
    assert.ok(report.rows.every(row => row.rowStyle.gridTemplateColumns.startsWith('18px ')), 'composition menu rows should render the fixed icon column');
    assert.ok(report.rows.every(row => row.rowStyle.whiteSpace === 'nowrap'), 'composition menu rows should render as single-line actions');
    assert.ok(report.rows.every(row => row.rowStyle.justifyContent === 'start' && row.rowStyle.justifyItems === 'start'), 'composition menu row content should be left-aligned');
    assert.ok(report.rows.every(row => row.rowStyle.fontSize === '13.12px' && row.rowStyle.fontWeight === '500'), 'composition menu rows should render compact medium-weight text');
    assert.ok(Math.abs(iconCenters[0] - iconCenters[1]) <= 1, 'composition menu icons should stack in one vertical column');
    assert.ok(Math.max(...labelLefts) - Math.min(...labelLefts) <= 1, 'composition menu labels and disabled notes should align in one text column');
    assert.equal(firstRow.labelStyle.overflow, 'hidden', 'long menu labels should hide overflow');
    assert.equal(firstRow.labelStyle.textOverflow, 'ellipsis', 'long menu labels should use an ellipsis');
    assert.ok(firstRow.labelScrollWidth > firstRow.labelClientWidth, 'long menu labels should truncate within the bounded label column');
    assert.ok(noteRow.labelScrollWidth > noteRow.labelClientWidth, 'disabled note labels should truncate within the same bounded label column');
  } finally {
    await page.close();
    await browser.close();
  }
});

test('manager system edit view defines scoped stable form and toggle layout', () => {
  const mainBlock = blockFor('.fabricate-manager .manager-system-edit-main');
  const formBlock = blockFor('.fabricate-manager .manager-system-edit-form');
  const gridBlock = blockFor('.fabricate-manager .manager-edit-grid');
  const fieldInputBlock = blockFor('.fabricate-manager .manager-field input,\n.fabricate-manager .manager-field select');
  const toggleListBlock = blockFor('.fabricate-manager .manager-toggle-list');
  const featureTileBlock = blockFor('.fabricate-manager .manager-feature-tile');
  const featureTileHeadBlock = blockFor('.fabricate-manager .manager-feature-tile-head');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const narrowQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 680px)'));

  assert.ok(mainBlock.includes('grid-template-rows: auto minmax(0, 1fr);'), 'system edit main should reserve scrollable form space');
  assert.ok(formBlock.includes('overflow: auto;'), 'system edit form should own scroll containment at normal widths');
  assert.ok(gridBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'system edit fields should use a stable two-column grid');
  assert.ok(fieldInputBlock.includes('height: 36px;'), 'system edit inputs and selects should have stable control height');
  assert.ok(toggleListBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'feature toggles should use stable two-column rows');
  assert.ok(featureTileBlock.includes('flex-direction: column;'), 'feature tiles should stack heading and hint vertically');
  assert.ok(featureTileHeadBlock.includes('justify-content: space-between;'), 'feature tile heading should push the pill toggle to the trailing edge');
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-toggle-list') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium edit layout should collapse feature toggles before text becomes cramped'
  );
  assert.ok(
    narrowQuery.includes('.fabricate-manager .manager-edit-card-heading') && narrowQuery.includes('flex-direction: column;'),
    'narrow edit card headings should stack actions under titles'
  );
});

test('manager pagination footer uses scoped chrome with stable summary, nav, and per-page controls', () => {
  const block = blockFor('.fabricate-manager .manager-pagination');

  assert.ok(block.includes('display: flex;'), 'pagination footer should layout horizontally');
  assert.ok(block.includes('justify-content: space-between;'), 'pagination footer should distribute summary, nav, per-page across the row');
  assert.ok(block.includes('flex-wrap: wrap;'), 'pagination footer should wrap on narrow widths');
  assert.ok(block.includes('border-top: 1px solid var(--fab-mv2-border);'), 'pagination footer should anchor to the table with a manager border');
  assert.ok(
    css.includes('.fabricate-manager .manager-pagination-page'),
    'pagination should expose a stable Page-of label for keyboard users'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-pagination-size select'),
    'pagination should style the per-page selector inside the manager scope'
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

test('manager icon buttons normalize host button defaults and keep pointer targets stable', () => {
  const block = blockFor('.fabricate-manager .manager-button,\n.fabricate-manager .manager-icon-button');
  const primaryIconBlock = blockFor('.fabricate-manager .manager-icon-button.is-primary');
  const primaryIconHoverBlock = blockFor('.fabricate-manager .manager-icon-button.is-primary:not(:disabled):hover');
  const iconBlocks = Array.from(css.matchAll(/\.fabricate-manager \.manager-icon-button\s*\{[\s\S]*?\}/g));
  const iconBlock = iconBlocks.at(-1)?.[0] || '';

  assert.ok(block.includes('appearance: none;'), 'manager buttons should clear host appearance');
  assert.ok(block.includes('-webkit-appearance: none;'), 'manager buttons should clear WebKit host appearance');
  assert.ok(block.includes('box-sizing: border-box;'), 'manager buttons should use border-box sizing');
  assert.ok(block.includes('display: inline-flex;'), 'manager buttons should center contents with inline-flex');
  assert.ok(block.includes('min-width: 0;'), 'manager buttons should clear host min-width defaults');
  assert.ok(iconBlock.includes('width: 34px;'), 'icon buttons should have a stable width of at least 32px');
  assert.ok(iconBlock.includes('height: 34px;'), 'icon buttons should have a stable height of at least 32px');
  assert.ok(primaryIconBlock.includes('color: var(--fab-success-text);'), 'primary icon buttons should use a light green outline treatment');
  assert.equal(primaryIconBlock.includes('background: var(--fab-success);'), false, 'primary icon buttons should not use the heavy solid primary background');
  assert.ok(primaryIconHoverBlock.includes('background: var(--fab-success-soft);'), 'primary icon buttons should keep a soft green hover state');
  assert.ok(css.includes('.fabricate-manager .manager-button:disabled'), 'disabled manager buttons should have explicit disabled styling');
  assert.ok(css.includes('.fabricate-manager .manager-button:not(:disabled):hover'), 'manager hover styles should not target disabled buttons');
});

test('collapsed manager rail reclaims content width and keeps section nav as an icon strip', () => {
  const bodyBlock = blockFor('.fabricate-manager .manager-body');
  const collapsedBodyBlock = blockFor('.fabricate-manager .manager-body.is-rail-collapsed');
  const toggleBlock = blockFor('.fabricate-manager .manager-rail-toggle');
  const collapsedRailBlock = blockFor('.fabricate-manager .manager-body.is-rail-collapsed .manager-rail');
  const collapsedNavButtonBlock = blockFor('.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-button');

  assert.ok(bodyBlock.includes('grid-template-columns: 220px minmax(0, 1fr) 300px;'), 'expanded manager body keeps the fixed 220px rail column');
  assert.ok(collapsedBodyBlock.includes('grid-template-columns: 56px minmax(0, 1fr) 300px;'), 'collapsed manager body narrows the rail column so the main column reclaims the freed width');
  assert.ok(toggleBlock.includes('appearance: none;') && toggleBlock.includes('cursor: pointer;'), 'rail toggle should be a normalized button control');
  assert.ok(collapsedRailBlock.includes('padding:'), 'collapsed rail should tighten its padding for the icon strip');
  assert.ok(
    css.includes('.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-label,\n.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-count {'),
    'collapsed rail should hide nav labels and counts to leave an icon-only strip'
  );
  assert.ok(collapsedNavButtonBlock.includes('grid-template-columns: minmax(0, 1fr);'), 'collapsed nav buttons should collapse to a single centered icon column');
  assert.ok(
    stackedBodyRule().includes('grid-template-columns: 1fr;'),
    'narrow container query should still stack the collapsed body to a single column'
  );
});

// The stacked body rule, read out of the 1120px container query rather than off the base
// `.manager-body` block (`blockFor` returns the FIRST match, which is the base rule).
function stackedBodyRule() {
  const query = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const selector =
    '.fabricate-manager .manager-body,\n  .fabricate-manager .manager-body.is-rail-collapsed {';
  const start = query.indexOf(selector);
  if (start < 0) return '';
  const rule = query.slice(start);
  return rule.slice(0, rule.indexOf('}') + 1);
}

// Issue 643 — the bug that made the recipe library render ZERO visible rows at 900px.
//
// Stacked, `.manager-body`'s three children land in implicit `auto` rows inside a box of
// DEFINITE height, and each of them carries `min-height: 0` + `overflow: hidden` — so each
// contributes a min-content size of ZERO and the track-sizing algorithm SHARES the body's
// height between them rather than sizing each to its content. Measured at 900x700: rail
// 225px (its whole nav clipped away), main 200px, inspector 179px, `.manager-table-scroll`
// squeezed to 24px, and every recipe row still in the DOM at its full 76px — which is
// precisely why `assertManagerLayoutStable` (a DOM row count plus an overflow measurement)
// passed on a library that showed nothing at all.
//
// `max-content` tracks cannot be squeezed. This is a correctness rule, not tidiness.
test('the stacked manager body sizes its regions to content instead of sharing its height', () => {
  const bodyRule = stackedBodyRule();
  assert.ok(bodyRule, 'the 1120px query must still carry a stacked-body rule');
  assert.ok(
    bodyRule.includes('grid-auto-rows: max-content;'),
    'stacked rail / main / inspector rows must size to content, or each is squeezed to a share of the body height'
  );
  assert.ok(
    bodyRule.includes('overflow-y: auto;'),
    'the body is what scrolls once its regions keep their own height'
  );

  // Left at its content height the stacked rail is ~650px of navigation ABOVE the content
  // it navigates to, so the GM would scroll past the entire nav to reach row one.
  const query = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const railStart = query.indexOf('.fabricate-manager .manager-rail {');
  const railRule = query.slice(railStart, query.indexOf('}', railStart) + 1);
  assert.ok(railRule.includes('max-height:'), 'the stacked rail is bounded, not a full-height wall of nav');
  assert.ok(railRule.includes('overflow: hidden auto;'), 'the bounded stacked rail scrolls its own nav');
});

// Issue 643: the Studio rail adds a section label and turns the count badges into
// shared mono chips. `.manager-chip` sets `display: inline-flex`, so a badge that is
// not explicitly re-hidden would survive into the 56px strip and blow the column out.
// Both new elements therefore need their own collapsed treatment, asserted here.
test('collapsed manager rail also hides the studio section label and the mono count badges', () => {
  const collapsedRailTitleBlock = blockFor('.fabricate-manager .manager-body.is-rail-collapsed .manager-rail-title');
  const railTitleBlock = blockFor('.fabricate-manager .manager-rail-title');
  const navCountChipBlock = blockFor('.fabricate-manager .manager-nav-count.manager-chip');

  assert.ok(collapsedRailTitleBlock.includes('display: none;'), 'collapsed rail should hide the uppercase section label');
  assert.ok(railTitleBlock.includes('letter-spacing:'), 'the rail section label should track wider than a card title');
  assert.ok(navCountChipBlock.includes('flex: 0 0 auto;'), 'a rail count badge should not shrink the nav label away');
  // The 4-class collapsed selector (0,4,0) must outrank `.fabricate-manager .manager-chip`
  // (0,2,0), or the chips reappear as inline-flex inside the icon strip.
  const collapsedHideIndex = css.indexOf('.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-count {');
  const groupedHideIndex = css.indexOf('.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-label,\n.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-count {');
  assert.ok(collapsedHideIndex >= 0 || groupedHideIndex >= 0, 'collapsed rail must still hide the nav count badges');
});

test('the manager titlebar caps the selected system badge and keeps the status line on one line', () => {
  const rootBlock = blockFor('.fabricate-manager');
  const titlebarBlock = blockFor('.fabricate-manager .manager-titlebar');
  const iconBlock = blockFor('.fabricate-manager .manager-titlebar-icon');
  const badgeBlock = blockFor('.fabricate-manager .manager-titlebar-badge');
  const statusBlock = blockFor('.fabricate-manager .manager-titlebar-status');
  const statusTextBlock = blockFor('.fabricate-manager .manager-titlebar-status-text');
  const titleBlock = blockFor('.fabricate-manager .manager-title');

  assert.ok(
    rootBlock.includes('grid-template-rows: auto auto 1fr;'),
    'the manager shell must reserve a row for the titlebar, or the header takes the 1fr row and the body collapses'
  );
  assert.ok(titlebarBlock.includes('display: flex;'), 'the titlebar should lay its identity strip out in one row');
  assert.ok(titlebarBlock.includes('min-width: 0;'), 'the titlebar must be allowed to shrink inside the manager grid');
  assert.ok(iconBlock.includes('color: var(--fab-mv2-accent);'), 'the titlebar icon should read as the accent identity mark');
  // The badge carries the SELECTED SYSTEM's name — user-authored text of any length.
  assert.ok(badgeBlock.includes('background: var(--fab-badge-gold);'), 'the system badge should use the gold badge token');
  assert.ok(badgeBlock.includes('color: var(--fab-on-badge-gold);'), 'the system badge should use its paired on-gold text token');
  assert.ok(badgeBlock.includes('max-width:'), 'the system badge must cap its width against long system names');
  assert.ok(badgeBlock.includes('text-overflow: ellipsis;') && badgeBlock.includes('white-space: nowrap;'), 'the system badge should ellipsis rather than push the status line off the strip');
  assert.ok(statusBlock.includes('margin-left: auto;'), 'the status line should sit right-aligned');
  assert.ok(statusBlock.includes('color: var(--fab-mv2-text-muted);'), 'the status line should read as muted metadata');
  assert.ok(statusTextBlock.includes('text-overflow: ellipsis;'), 'a long resolution-mode label should ellipsis, not wrap the strip');
  assert.ok(titleBlock.includes('font-family: var(--fab-font-serif);'), 'the manager screen title should override the host h1 font with the studio serif');
});

test('every view-specific manager-body grid override narrows the rail column when collapsed', () => {
  // Find each top-level view-specific `.manager-body` grid override (those that keep a
  // distinct fixed rail column). Each must ship a matching `.is-rail-collapsed` override that
  // narrows column one to 56px, otherwise the later view rule wins on equal specificity and the
  // collapse no-ops (issue #331 regression: a wide, mostly-empty icon strip).
  //
  // Two simple, linear-time regexes are used deliberately (rather than one combined pattern with
  // chained `+` quantifiers) to keep the matching free of any backtracking concern.
  const viewNames = Array.from(css.matchAll(/data-manager-view="(\w[\w-]*)"\] \.manager-body \{/g), (m) => m[1]);
  const views = Array.from(new Set(viewNames));

  assert.ok(views.length > 0, 'expected at least one view-specific manager-body grid override to pin');

  for (const view of views) {
    const overrideBlock = blockFor(`.fabricate-manager[data-manager-view="${view}"] .manager-body`);
    const columnsMatch = overrideBlock.match(/grid-template-columns:\s*(\S+)/);
    const firstColumn = columnsMatch ? columnsMatch[1] : '';
    // A view that stacks to a single column (e.g. inside a narrow container query) has no rail
    // column to narrow, so it does not need a collapsed override.
    if (firstColumn === '1fr' || firstColumn.startsWith('minmax')) {
      continue;
    }

    const collapsedBlock = blockFor(
      `.fabricate-manager[data-manager-view="${view}"] .manager-body.is-rail-collapsed`
    );
    assert.ok(
      collapsedBlock,
      `view "${view}" overrides the manager-body grid but is missing a .is-rail-collapsed override; the collapse will be overridden on equal specificity`
    );
    assert.ok(
      collapsedBlock.includes('grid-template-columns: 56px '),
      `view "${view}" collapsed override should narrow the rail column to 56px`
    );
  }
});

test('recipe tag chips zero their list-item margins so a host list rule cannot inflate one chip', async () => {
  // Regression: chips are <li>s, and a host (Foundry) global list rule giving
  // non-last items a margin-bottom inflated only the first chip's box (e.g. it
  // rendered 34px tall vs the last chip's 30px). Our class rule must zero the
  // margin and win on specificity even when the host rule is declared later.
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
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; }
            /* Simulate a host global list rhythm declared after our stylesheet. */
            li:not(:last-child) { margin-bottom: 4px; }
            .fas::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <div class="manager-recipe-option-tags-list" data-recipe-tags-list>
              <ul class="manager-recipe-tag-chips">
                <li class="manager-chip manager-recipe-tag-chip" data-recipe-tag="reagent"><span>reagent</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></li>
                <li class="manager-chip manager-recipe-tag-chip" data-recipe-tag="rare"><span>rare</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></li>
              </ul>
            </div>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const chips = Array.from(document.querySelectorAll('.manager-recipe-tag-chip'));
      return chips.map((chip) => {
        const style = getComputedStyle(chip);
        return {
          marginTop: style.marginTop,
          marginBottom: style.marginBottom,
          height: chip.getBoundingClientRect().height
        };
      });
    });

    assert.equal(report.length, 2, 'both tag chips should render');
    for (const [index, chip] of report.entries()) {
      assert.equal(chip.marginBottom, '0px', `chip ${index} should have no bottom margin despite the host list rule`);
      assert.equal(chip.marginTop, '0px', `chip ${index} should have no top margin`);
    }
    assert.equal(report[0].height, report[1].height, 'both chips should derive the same height');
  } finally {
    await page.close();
    await browser.close();
  }
});

test('recipe tag list spans the full row width on its own line below the controls', async () => {
  // The chosen-tags box should drop to a full-width line under the match
  // controls + quantity row, so chips never share width with the row-end controls.
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 760, height: 360 }, deviceScaleFactor: 1 });

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            ${css}
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; }
            .harness-row-width { width: 600px; }
            .fas::before, .fa-solid::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <div class="harness-row-width">
              <div class="manager-recipe-ingredient-option-row" data-recipe-option>
                <div class="manager-recipe-option-target">
                  <div class="manager-recipe-option-tags">
                    <div class="manager-recipe-option-tags-controls">
                      <div class="manager-recipe-tag-match-toggle">
                        <button type="button" class="manager-recipe-tag-match-option is-selected">Any</button>
                        <button type="button" class="manager-recipe-tag-match-option">All</button>
                      </div>
                      <button type="button" class="manager-button is-subtle manager-recipe-tag-trigger"><i class="fas fa-tag"></i><span>Add tag</span></button>
                    </div>
                  </div>
                </div>
                <div class="manager-recipe-option-controls">
                  <input type="number" class="manager-recipe-option-quantity" value="1">
                  <button type="button" class="manager-icon-button is-danger manager-recipe-option-remove"><i class="fas fa-minus"></i></button>
                </div>
                <div class="manager-recipe-option-tags-list" data-recipe-tags-list>
                  <ul class="manager-recipe-tag-chips">
                    <li class="manager-chip manager-recipe-tag-chip" data-recipe-tag="reagent"><span>reagent</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></li>
                    <li class="manager-chip manager-recipe-tag-chip" data-recipe-tag="rare"><span>rare</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></li>
                  </ul>
                </div>
              </div>
            </div>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const rectFor = (selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width };
      };
      return {
        row: rectFor('.manager-recipe-ingredient-option-row'),
        target: rectFor('.manager-recipe-option-target'),
        controls: rectFor('.manager-recipe-option-controls'),
        list: rectFor('.manager-recipe-option-tags-list')
      };
    });

    assert.ok(
      Math.abs(report.list.width - report.row.width) <= 1,
      `tags list should fill the row width (list ${report.list.width} vs row ${report.row.width})`
    );
    assert.ok(
      report.list.top >= report.controls.bottom - 1 && report.list.top >= report.target.bottom - 1,
      'tags list should sit on its own line below the controls/quantity row'
    );
  } finally {
    await page.close();
    await browser.close();
  }
});
