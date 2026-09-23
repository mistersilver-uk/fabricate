/** The essence routes: the browser, the dedicated edit route and its exit guards. */

import { afterEach, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, mount, tick, unmount } from 'svelte';
import { createStore } from '../helpers/manager/managerStoreFake.js';
import { createManagerQueries } from '../helpers/manager/managerQueries.js';
import { managerComponents, settleBetweenTests } from './manager-mounted-shared.js';

let Component;
let mounted;
let target;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const { craftingParent, navButton } = queries;

/**
 * The accessible names of the essence toolbar's filter and arrangement controls, chips excluded.
 * An absence check on one retired label passes for any other control a later change adds, so the
 * bar is pinned to the exact set it carries instead.
 */
function essenceToolbarControlNames() {
  const toolbar = target.querySelector('[data-essence-toolbar]');
  return [...toolbar.querySelectorAll('[aria-label]')]
    .filter((control) => control !== toolbar && !control.closest('[data-essence-filter-chip]'))
    .map((control) => control.getAttribute('aria-label'));
}

/** Register this route’s cases in `manager-mounted.test.js`’s one describe. */
export function registerEssencesCases() {
  before(async () => {
    ({ Component } = await managerComponents());
  });

  afterEach(async () => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
    await settleBetweenTests();
  });


  it('routes to the essence browser and dedicated edit route without inline editing', async () => {
    const calls = [];
    const editedComponents = [];
    const copiedSources = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: {
          openCurrentAdmin: () => {},
          onEditComponent: (id) => editedComponents.push(id),
          onCopySourceUuid: (uuid) => copiedSources.push(uuid),
          importSingleManagedItemFromDrop: async () => ({
            id: 'c2',
            name: 'Glass Vial',
            img: 'icons/consumables/potions/vial-corked-blue.webp',
          }),
        },
      },
    });
    flushSync();

    const essenceButton = navButton('Essence Rules');
    assert.ok(essenceButton, 'essence nav button should render when the feature is enabled');
    assert.equal(essenceButton.disabled, false);
    essenceButton.click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essences');
    assert.equal(target.querySelectorAll('.manager-essence-row').length, 2);
    assert.ok(target.textContent.includes('Earth'));
    assert.equal(target.querySelector('.manager-essence-action-band'), null);

    // The DISABLED essence is marked in words, not by dimming alone.
    const waterRow = target.querySelector('.manager-essence-row[data-essence-id="water"]');
    const earthRow = target.querySelector('.manager-essence-row[data-essence-id="earth"]');
    assert.equal(waterRow.dataset.essenceEnabled, 'false');
    assert.equal(earthRow.dataset.essenceEnabled, 'true');
    assert.ok(waterRow.textContent.includes('Disabled'), 'a disabled row says so in words');
    assert.deepEqual(
      [...earthRow.querySelectorAll('[data-essence-capability]')].map(
        (pill) => pill.dataset.essenceCapability
      ),
      ['effects', 'macro'],
      'a configured essence shows both capability pills'
    );
    assert.equal(
      waterRow.querySelectorAll('[data-essence-capability]').length,
      0,
      'and an unconfigured one shows neither'
    );
    // The two usage numbers are DIFFERENT questions and both are reported.
    assert.ok(
      earthRow.querySelector('[data-essence-usage-components]').textContent.includes('1'),
      'the row states how many components carry the essence'
    );
    assert.ok(
      earthRow.querySelector('[data-essence-usage-recipes]').textContent.includes('2'),
      'and, separately, how many recipes require it'
    );

    // The FIRST `.manager-icon-button` in the row must remain the Edit pencil.
    assert.equal(
      earthRow.querySelector('.manager-icon-button').getAttribute('data-essence-edit'),
      'earth',
      'the first icon button in a row is still the Edit pencil'
    );

    // The row toggle routes through the ONE manager write, not through updateEssence.
    waterRow.querySelector('[data-essence-toggle="water"]').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) => call[0] === 'setEssenceEnabled' && call[1] === 'water' && call[2] === true
      ),
      'the row switch enables through setEssenceEnabled'
    );

    assert.equal(target.querySelectorAll('.manager-essence-usage-item').length, 1);
    assert.equal(target.querySelector('.manager-essence-usage-item').title, 'Iron Ore');
    target.querySelector('.manager-essence-usage-item').click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'component-edit',
      'essence usage thumbnail should route to the manager component-edit view'
    );
    assert.deepEqual(
      editedComponents,
      [],
      'essence usage thumbnail should no longer launch the legacy services.onEditComponent'
    );
    navButton('Essence Rules').click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essences');
    assert.equal(target.querySelectorAll('.manager-essence-edit-row').length, 0);
    assert.equal(target.querySelectorAll('#manager-essence-create-name').length, 0);

    target.querySelector('[data-essence-id="water"] .manager-essence-identity').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-essence-id="water"]').classList.contains('is-selected'));
    assert.ok(target.textContent.includes('Clear current.'));

    // The inspector OWNS Edit and Delete — the row keeps only the pencil.
    assert.ok(
      target.querySelector('[data-essence-browser-inspector]'),
      'the selected-essence inspector is an extracted component'
    );
    // AND IT OFFERS NO DUPLICATE (issue 1372, maintainer parity round 8). Duplicating wrote a
    // second `system.essenceDefinitions` entry with its own name, icon and colour — a
    // system-owned essence — from the rail whose own banner two cards above says name, icon and
    // colour come from the Essence Catalogue and are shared by every system.
    assert.ok(
      !target.querySelector('[data-essence-action="duplicate"]'),
      'the inspector offers no Duplicate'
    );
    assert.ok(
      Boolean(target.querySelector('[data-essence-action="edit"]')),
      'NON-VACUITY: the actions cluster is rendered, so the absence above is a measurement'
    );
    // The `SYSTEM RULES n / m` panel (issue 1372, B1) renders only when the world corpus can
    // answer it, and this harness registers no essence scope store, so it is correctly absent
    // here — the same rule the membership filter follows. Its presence is measured where a
    // corpus exists: `essence-world-scope-screens.test.js` pins the call site's whole attribute
    // list, and `scoped-shell-prop-contract.test.js` pins that both essence rails compose the
    // one component rather than each owning a copy.
    assert.ok(
      !target.querySelector('[data-essence-section="systems"]'),
      'and no roster is invented over a corpus nothing could read'
    );
    assert.ok(
      target.querySelector('[data-essence-section="usage"]'),
      'essence inspector should expose a Usage section'
    );
    assert.ok(
      target.querySelector(
        '[data-essence-section="source"] .manager-essence-source-drop-zone .essence-source-trigger'
      ),
      'unlinked selected essence should expose a source drop zone'
    );
    // The retained stat cards report the two counts separately.
    assert.equal(
      target.querySelector('[data-essence-stat="recipes"] strong').textContent.trim(),
      '1'
    );
    const essenceHeroRow = target.querySelector('.manager-inspector-title-row.is-hero-large');
    assert.ok(essenceHeroRow, 'essence inspector should use the prominent hero title row');

    // THE SHARED-DEFINITION DEEP LINK (issue 1372, `proto:1676`-`1678`). It is asserted HERE
    // rather than on the component alone because the two halves fail independently: the
    // component can render a link the shell never wired, and the shell can wire a callback no
    // control calls. This clicks the rendered control in the real shell and reads the route.
    const sharedCard = target.querySelector('[data-essence-section="shared"]');
    assert.ok(sharedCard, 'the inspector names the layer the GM is looking at');
    assert.ok(
      sharedCard.textContent.includes('Shared definition'),
      'with the prototype kicker, so the rail says which record is world-shared'
    );
    target.querySelector('[data-essence-action="open-world-definition"]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'world-essence-entry',
      'and the link opens the WORLD definition, which is the only route out to it'
    );

    navButton('Essence Rules').click();
    flushSync();
    await tick();
    flushSync();
    target.querySelector('[data-essence-id="water"] .manager-essence-identity').click();
    await tick();
    flushSync();

    target.querySelector('[data-essence-id="water"] .manager-essence-identity').click();
    await tick();
    flushSync();
    const inspectorDropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(inspectorDropEvent, 'dataTransfer', {
      value: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.glass-vial' }) },
    });
    target
      .querySelector('[data-essence-section="source"] .essence-source-trigger')
      .dispatchEvent(inspectorDropEvent);
    await tick();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateEssence' && call[1] === 'water' && call[2].sourceComponentId === 'c2'
      )
    );

    target.querySelector('[data-essence-id="earth"] .manager-essence-identity').click();
    await tick();
    flushSync();
    const inspectorSourceSummary = target.querySelector(
      '[data-essence-section="source"] .manager-essence-inspector-source-summary'
    );
    assert.ok(
      inspectorSourceSummary,
      'linked selected essence should render a source summary card'
    );
    assert.equal(
      inspectorSourceSummary.querySelectorAll('.manager-essence-source-thumb').length,
      1,
      'linked selected essence should show one source thumbnail'
    );
    assert.ok(
      inspectorSourceSummary
        .querySelector('.manager-essence-source-copy')
        .textContent.includes('Iron Ore'),
      'linked selected essence should keep the source name readable'
    );
    const inspectorSourceActions = target.querySelector(
      '[data-essence-section="source"] .manager-essence-inspector-source-actions'
    );
    assert.ok(
      inspectorSourceActions,
      'linked selected essence should expose source actions below the item card'
    );
    assert.equal(
      inspectorSourceSummary.contains(inspectorSourceActions),
      false,
      'source actions should sit outside the linked item card'
    );
    const copySourceAction = inspectorSourceActions.querySelector(
      '[data-essence-action="copy-source"]'
    );
    assert.ok(copySourceAction, 'linked selected essence should expose source copy');
    assert.equal(copySourceAction.disabled, false);
    copySourceAction.click();
    flushSync();
    assert.deepEqual(copiedSources, ['c1']);
    const unlinkSourceAction = inspectorSourceActions.querySelector(
      '[data-essence-action="unlink-source"]'
    );
    // The AMBER survives the extraction (issue 1036, maintainer round 2). Both source
    // actions now render through `InspectorActionButton`, the shared right-inspector button,
    // and the modifier moved with them: `.manager-button.is-warning-action` was the global
    // sheet's, `is-warning` is the primitive's own tone. Unlinking breaks a reference and
    // destroys nothing, so it must not land in the danger family on the way across.
    assert.ok(
      unlinkSourceAction.classList.contains('fab-inspector-action'),
      'unlink source should render through the shared right-inspector button'
    );
    assert.ok(
      unlinkSourceAction.classList.contains('is-warning'),
      'and keep the amber warning tone rather than becoming destructive'
    );
    assert.ok(
      copySourceAction.classList.contains('fab-inspector-action'),
      'as should its copy-uuid partner'
    );
    unlinkSourceAction.click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateEssence' && call[1] === 'earth' && call[2].sourceComponentId === null
      )
    );

    // The source-state filter is gone (issue 1372, maintainer parity round 8).
    assert.deepEqual(essenceToolbarControlNames(), [
      'Search essences',
      'Sort essences',
      'Toggle sort direction',
      'Essence presentation',
      'Select all',
    ], 'the essence toolbar controls');
    const essenceSearch = target.querySelector('[aria-label="Search essences"]');
    essenceSearch.value = 'Water';
    essenceSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-essence-row').length, 1);
    assert.ok(target.textContent.includes('Water'));

    essenceSearch.value = '';
    essenceSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    target.querySelector('[data-essence-id="water"] [data-essence-edit="water"]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');
    assert.ok(target.textContent.includes('Edit essence'));
    assert.ok(!target.textContent.includes('Essence editor'));
    assert.equal(target.textContent.includes('Basic information'), false);
    assert.equal(target.textContent.includes('Essence ID'), false);
    assert.ok(
      !target.querySelector('.manager-inspector [aria-label="Edit Water"]'),
      'inspector should not show an edit action while already editing'
    );
    // The editor opens on IDENTITY and the shell's rail carries the live preview.
    assert.equal(
      target.querySelector('[data-essence-tab-panel]').dataset.essenceTabPanel,
      'identity'
    );
    assert.ok(
      target.querySelector('.manager-inspector [data-essence-behavior-preview]'),
      'the editor rail is the live behaviour preview'
    );
    assert.ok(
      target.querySelector('.essence-icon-picker-trigger'),
      'edit route should use the shared icon picker trigger'
    );
    assert.equal(target.querySelector('.essence-icon-picker-trigger').title, 'Change icon');
    // The icon RESET is an icon-only overlay control on the tile itself now (maintainer
    // feedback), not a control beside the picker, so its label is its accessible name and
    // its tooltip rather than visible text. Asserted on the control, which is what a GM
    // operates, plus the structural claim that it lives on the tile rather than in the
    // picker's row.
    const iconResetButton = target.querySelector('[data-essence-icon-reset]');
    assert.equal(iconResetButton.getAttribute('aria-label'), 'Clear icon');
    assert.equal(iconResetButton.title, 'Clear icon');
    assert.ok(
      iconResetButton.closest('.manager-essence-icon-tile'),
      'the reset overlays the icon tile rather than sitting in the picker row'
    );
    assert.ok(
      !target.querySelector('.manager-essence-icon-actions [data-essence-icon-reset]'),
      'and the actions row beside the picker no longer carries a second reset control'
    );
    assert.equal(
      target.querySelector('.manager-header-actions [data-essence-edit-save]').disabled,
      true
    );

    const editName = target.querySelector('#manager-essence-edit-name');
    editName.value = 'Rain';
    editName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('[data-essence-preview-tile] .inventory-card-name').textContent.trim(),
      'Rain',
      'the live preview follows the draft'
    );
    assert.equal(
      target.querySelector('.manager-header-actions [data-essence-edit-save]').disabled,
      false
    );

    // The On-craft tab carries the source picker; Identity does not.
    assert.ok(!target.querySelector('.essence-source-trigger'), 'Identity has no source picker');
    target.querySelector('[data-essence-tab="oncraft"]').click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('.manager-essence-source-drop-zone .essence-source-trigger'),
      'the On-craft tab shows a full-width source drop/pick target'
    );
    target.querySelector('.essence-source-trigger').click();
    await tick();
    flushSync();
    document.querySelector('.essence-source-picker-option[title="Glass Vial"]').click();
    await tick();
    flushSync();
    // ONE card once linked (issue 1036, maintainer round 2).
    const linkedSource = target.querySelector('[data-item-drop-zone="essence-source"]');
    assert.ok(linkedSource, 'the linked source renders through the shared item drop zone');
    assert.ok(linkedSource.textContent.includes('Glass Vial'), 'naming the linked component');
    assert.ok(
      linkedSource.textContent.includes('Drop another Item here to replace the linked source.'),
      'and instructing the GM, where it used to restate the raw uuid'
    );
    assert.equal(
      target.querySelector('.manager-essence-source-drop-zone'),
      null,
      'and no second drop zone renders beneath it'
    );
    // The Tool Studio's grouped icon pair.
    const linkedActions = linkedSource.querySelectorAll(
      '.manager-item-drop-zone-actions .manager-icon-button'
    );
    assert.equal(linkedActions.length, 1, 'a source with no uuid offers unlink alone');
    assert.ok(
      linkedActions[0].querySelector('.fa-link-slash'),
      'and it is the unlink glyph, in the grouped icon treatment'
    );
    target.querySelector('.manager-header-actions [data-essence-edit-save]').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateEssence' &&
          call[1] === 'water' &&
          call[2].name === 'Rain' &&
          call[2].sourceComponentId === 'c2'
      )
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essences');

    // The DELETE lives in the inspector now, and is WARNED, not blocked (maintainer round):
    target.querySelector('[data-essence-id="water"] .manager-essence-identity').click();
    await tick();
    flushSync();
    target.querySelector('[data-essence-action="delete"]').click();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'deleteEssence' && call[1] === 'water'));
    target.querySelector('[data-essence-id="earth"] .manager-essence-identity').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('[data-essence-action="delete"]').disabled,
      false,
      'a carried essence is still deletable — the delete is warned, not blocked'
    );
    assert.ok(
      target.querySelector('[data-essence-delete-impact]'),
      'and an impact note states how far the cascade reaches'
    );

    // ── NO CREATE ON THIS ROUTE (issue 1372, maintainer parity round 8) ─────────────────────
    // The header's `+ Create essence` opened a system-scope draft that `store.addEssence` wrote
    // straight into `system.essenceDefinitions` — a system-owned essence with its own name, icon
    // and colour, from the screen whose own rail says identity is the Essence Catalogue's. The
    // reference's Essence Rules header carries nothing on the right at all.
    assert.ok(
      !target.querySelector('.manager-header-actions .manager-button'),
      'the Essence Rules header carries no action'
    );
    navButton('Component Rules').click();
    await tick();
    flushSync();
    navButton('Essence Rules').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'essences',
      'NON-VACUITY: the route is still the essence list, so the empty header is a measurement'
    );
  });

  it('keeps essence library search, filter and page state across an editor round-trip', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store: createStore(calls), services: { openCurrentAdmin: () => {} } },
    });
    flushSync();

    navButton('Essence Rules').click();
    await tick();
    flushSync();

    // Search AND the status segmented control, both narrowing to one row.
    const search = target.querySelector('[aria-label="Search essences"]');
    search.value = 'Water';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-essence-row').length, 1);

    target.querySelector('[data-essence-view-option="grid"] input').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.manager-essences-table').dataset.essenceView, 'grid');
    // The grid card carries its actions in a divided footer now (issue 1036, maintainer
    // round): the edit pencil and the enable toggle live on the card, matching the prototype.
    assert.ok(
      target.querySelector('[data-essence-id="water"] [data-essence-edit]'),
      'a grid card carries the edit pencil in its footer'
    );

    target.querySelector('[data-essence-id="water"] .manager-essence-identity').click();
    await tick();
    flushSync();
    target.querySelector('[data-essence-action="edit"]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');

    target.querySelector('.manager-header-actions [data-essence-edit-back]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essences');

    // The whole round trip unmounted the browser. Every control is where the GM left it.
    assert.equal(
      target.querySelector('[aria-label="Search essences"]').value,
      'Water',
      'the search term survives the editor round-trip'
    );
    assert.equal(target.querySelectorAll('.manager-essence-row').length, 1);
    assert.equal(
      target.querySelector('.manager-essences-table').dataset.essenceView,
      'grid',
      'and so does the list/grid presentation'
    );
    assert.ok(
      calls.some((call) => call[0] === 'cancelEssenceDraft'),
      'Back republishes the persisted projections through the store'
    );
  });

  it('hides manager essence source UI when effect transfer is disabled', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          selectedFeatures: {
            essences: true,
            effectTransfer: false,
            propertyMacros: false,
            itemTags: true,
            gathering: true,
            recipeCategories: true,
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essence Rules').click();
    await tick();
    flushSync();

    assert.deepEqual(essenceToolbarControlNames(), [
      'Search essences',
      'Sort essences',
      'Toggle sort direction',
      'Essence presentation',
      'Select all',
    ], 'the essence toolbar controls');
    assert.equal(target.textContent.includes('Linked source'), false);
    assert.equal(target.textContent.includes('Source evidence'), false);
    // The capability pills are GATED by the feature, not merely by the card's own fields:
    assert.equal(
      target.querySelectorAll('[data-essence-capability]').length,
      0,
      'a gated-off capability shows no pill'
    );

    target.querySelector('[data-essence-id="water"] [data-essence-edit="water"]').click();
    await tick();
    flushSync();
    assert.ok(!target.querySelector('.essence-source-trigger'), 'no source picker');
    assert.ok(!target.querySelector('.manager-essence-source-summary'), 'no source summary');
    assert.ok(!target.querySelector('.manager-essence-source-drop-zone'), 'no source drop zone');
    assert.equal(target.textContent.includes('Source unresolved'), false);
    assert.equal(target.textContent.includes('source linkage'), false);

    // With BOTH gates off the On-craft tab explains itself rather than rendering empty.
    target.querySelector('[data-essence-tab="oncraft"]').click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('[data-essence-on-craft-empty]'),
      'both gates off renders an explanatory empty state, not an empty tab'
    );
    assert.ok(!target.querySelector('[data-essence-section="macro"]'), 'and no macro card at all');

    target.querySelector('[data-essence-tab="identity"]').click();
    await tick();
    flushSync();
    const editName = target.querySelector('#manager-essence-edit-name');
    editName.value = 'Rain';
    editName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('.manager-header-actions [data-essence-edit-save]').click();
    await tick();
    flushSync();

    const updateCall = calls.find((call) => call[0] === 'updateEssence');
    assert.ok(updateCall, 'identity save should delegate an essence update');
    assert.equal(Object.prototype.hasOwnProperty.call(updateCall[2], 'sourceComponentId'), false);
    assert.equal(
      Object.prototype.hasOwnProperty.call(updateCall[2], 'propertyMacroUuid'),
      false,
      'a gated-off macro axis is never written'
    );
  });

  it('protects dirty essence edit drafts when leaving the route', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          confirmDiscardEssenceResult: false,
          experimentalFeaturesEnabled: true,
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essence Rules').click();
    await tick();
    flushSync();
    target.querySelector('[data-essence-id="water"] [data-essence-edit="water"]').click();
    await tick();
    flushSync();

    const editName = target.querySelector('#manager-essence-edit-name');
    editName.value = 'Rain';
    editName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    craftingParent().click();
    await tick();
    flushSync();

    assert.ok(calls.some((call) => call[0] === 'confirmDiscardDirtyEssenceDraft'));
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');
    assert.equal(target.querySelector('#manager-essence-edit-name').value, 'Rain');
  });

  it('saves a dirty essence edit draft and completes navigation when the GM chooses Save', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          confirmDiscardEssenceResult: 'save',
          experimentalFeaturesEnabled: true,
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essence Rules').click();
    await tick();
    flushSync();
    target.querySelector('[data-essence-id="water"] [data-essence-edit="water"]').click();
    await tick();
    flushSync();

    const editName = target.querySelector('#manager-essence-edit-name');
    editName.value = 'Rain';
    editName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    craftingParent().click();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    await tick();
    flushSync();
    await tick();
    flushSync();

    assert.ok(calls.some((call) => call[0] === 'confirmDiscardDirtyEssenceDraft'));
    const updateCall = calls.find((call) => call[0] === 'updateEssence');
    assert.ok(updateCall, 'choosing Save should persist the dirty essence draft');
    assert.equal(updateCall[1], 'water');
    assert.equal(updateCall[2].name, 'Rain');
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
  });

  it('keeps a dirty essence edit draft open when the Save fails on route exit', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          confirmDiscardEssenceResult: 'save',
          updateEssenceResult: false,
          experimentalFeaturesEnabled: true,
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essence Rules').click();
    await tick();
    flushSync();
    target.querySelector('[data-essence-id="water"] [data-essence-edit="water"]').click();
    await tick();
    flushSync();

    const editName = target.querySelector('#manager-essence-edit-name');
    editName.value = 'Rain';
    editName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    craftingParent().click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'updateEssence'),
      'Save should be attempted'
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');
    assert.equal(target.querySelector('#manager-essence-edit-name').value, 'Rain');
  });

  it('keeps essence edit drafts on failed and rejected saves', async () => {
    const failedCalls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(failedCalls, { updateEssenceResult: false }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essence Rules').click();
    await tick();
    flushSync();
    target.querySelector('[data-essence-id="water"] [data-essence-edit="water"]').click();
    await tick();
    flushSync();
    const failedName = target.querySelector('#manager-essence-edit-name');
    failedName.value = 'Rain';
    failedName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');
    assert.equal(target.querySelector('#manager-essence-edit-name').value, 'Rain');
    assert.ok(target.textContent.includes('Save failed.'));

    unmount(mounted);
    target.remove();

    const rejectedCalls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(rejectedCalls, { updateEssenceReject: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essence Rules').click();
    await tick();
    flushSync();
    target.querySelector('[data-essence-id="water"] [data-essence-edit="water"]').click();
    await tick();
    flushSync();
    const rejectedName = target.querySelector('#manager-essence-edit-name');
    rejectedName.value = 'Storm';
    rejectedName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');
    assert.equal(target.querySelector('#manager-essence-edit-name').value, 'Storm');
    assert.ok(target.textContent.includes('Save failed.'));

    unmount(mounted);
    target.remove();

    // THE THIRD CASE — A FAILED CREATE.
    // walked the system-scope create draft, whose only entry point was the Essence Rules header's
    // `+ Create essence`; an essence's identity is a world record and the create that authors one
    // is the Essence Catalogue's. The two cases above still cover what this file is about — a
    // failed and a rejected save both KEEP the draft — over the update path that survives.
  });
}
