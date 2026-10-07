/** The player Alchemy tab's host suite (issue 1514). */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  ALCHEMY_VIEW_HARNESS,
  alchemyServices as services,
  fakeAlchemyStore,
} from '../helpers/alchemyViewFixtures.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { assertViewErrorTreatment } from '../helpers/playerViewStateAssertions.js';
import { NON_PHRASING_CONTENT } from '../helpers/listRowContract.js';
import { primaryButtons } from '../helpers/playerDetailHeaderAssertions.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-alchemy-view-',
  ...ALCHEMY_VIEW_HARNESS,
});

describe('AlchemyView mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders the loading state before the first load resolves', async () => {
    const target = await harness.mount({
      services: services(fakeAlchemyStore({ loading: true, loadedOnce: false })),
    });

    assert.ok(
      Boolean(target.querySelector('[data-alchemy-state="loading"]')),
      'loading state shown'
    );
    assert.ok(
      !target.querySelector('[data-alchemy-state="workbench"]'),
      'the workbench grid is not rendered while loading'
    );
  });

  it('announces the loading root as busy, and does not once the view is ready', async () => {
    // The criterion this suite was created for. It is asserted on the RENDERED DOM because a
    // composition that declares `aria-busy` and stops rendering it passes every source-text
    // reader, and the negative half is asserted because an attribute that is always present
    // says nothing about the state it is supposed to describe.
    const loadingTarget = await harness.mount({
      services: services(fakeAlchemyStore({ loading: true, loadedOnce: false })),
    });
    const loadingRoot = loadingTarget.querySelector('[data-alchemy-state="loading"]');
    assert.equal(
      loadingRoot.getAttribute('aria-busy'),
      'true',
      'the loading view root carries aria-busy'
    );
    assert.ok(
      loadingRoot.textContent.includes('FABRICATE.App.Alchemy.Loading'),
      'and a VISIBLE label states what is loading, so the busy region has an accessible name'
    );

    harness.remount();
    const readyTarget = await harness.mount({ services: services(fakeAlchemyStore()) });
    const readyRoot = readyTarget.querySelector('[data-alchemy-state="workbench"]');
    assert.ok(Boolean(readyRoot), 'the ready view renders the workbench grid');
    assert.ok(
      !readyTarget.querySelector('[aria-busy]'),
      'nothing in the ready view claims to be busy'
    );
  });

  it('records the window a Brew came from as its roll prompt origin (issue 2053)', async () => {
    const { activeRollPromptOrigin } = await harness.loadRawModule(
      'src/ui/svelte/util/rollPromptOrigin.js'
    );
    let origin = 'unread';
    const store = fakeAlchemyStore({
      brewEnabled: true,
      brew: async () => {
        origin = activeRollPromptOrigin();
      },
    });
    const target = await harness.mount({ services: services(store) });
    assert.equal(
      primaryButtons(target.querySelector('[data-alchemy-state="workbench"]')).length,
      1,
      'Brew is the view’s one primary'
    );

    target.querySelector('[data-alchemy-brew]').click();
    await Promise.resolve();

    assert.ok(
      origin === target,
      'the workbench forwards the click and the view records its window'
    );
    assert.ok(activeRollPromptOrigin() === null, 'the origin is released once the brew settles');
  });

  it('renders the error state when the store reports an error', async () => {
    const target = await harness.mount({
      services: services(fakeAlchemyStore({ error: 'boom' })),
    });

    const root = target.querySelector('[data-alchemy-state="error"]');
    assert.ok(Boolean(root), 'error state shown');
    assert.ok(
      !root.hasAttribute('aria-busy'),
      'a failed load is not a loading state and must not claim to be busy'
    );
    assert.ok(
      root.textContent.includes('FABRICATE.App.Alchemy.Error'),
      'the error sentence is rendered'
    );
    assertViewErrorTreatment(root, { view: 'alchemy view' });
  });

  it('renders the no-actor state when the listing resolves to no actor', async () => {
    const target = await harness.mount({
      services: services(
        fakeAlchemyStore({ listing: { selectedActorId: null, activeSystemName: '' } })
      ),
    });

    assert.ok(
      Boolean(target.querySelector('[data-alchemy-state="no-actor"]')),
      'no-actor state shown'
    );
    assert.ok(
      !target.querySelector('[data-alchemy-state="workbench"]'),
      'the workbench grid is not rendered without an actor'
    );
  });

  it('has NO empty branch: a discipline with no known recipes still renders the workbench', async () => {
    // The branch set is per view, which is why the composition takes it as data. A view that
    // was handed the widest vocabulary would have to invent this state.
    const target = await harness.mount({
      services: services(fakeAlchemyStore({ knownRecipes: [], knownCount: 0 })),
    });

    assert.ok(
      Boolean(target.querySelector('[data-alchemy-state="workbench"]')),
      'the workbench grid is shown'
    );
    assert.ok(
      !target.querySelector('[data-alchemy-state="empty"]'),
      'no empty branch is reachable in this view'
    );
  });

  it('carries an inventory row onto the bench: the drag payload is JSON a bench drop adds', async () => {
    let added = [];
    const target = await harness.mount({
      services: services(
        fakeAlchemyStore({
          components: [{ componentId: 'emberroot', name: 'Emberroot', quantity: 2 }],
          hasOwnedComponents: true,
          add: (id) => {
            added = [...added, id];
          },
        })
      ),
    });
    const row = target.querySelector('[data-alchemy-inventory-row="emberroot"]');
    assert.ok(Boolean(row), 'the inventory row renders');
    let payload = null;
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
    dragStart.dataTransfer = {
      setData: (_type, value) => {
        payload = value;
      },
    };
    row.dispatchEvent(dragStart);

    const drop = new Event('drop', { bubbles: true, cancelable: true });
    drop.dataTransfer = { getData: () => payload };
    target.querySelector('[data-alchemy-dropzone]').dispatchEvent(drop);

    assert.deepEqual(added, ['emberroot'], 'the dropped component is added to the bench');
  });

  it('renders the discipline chooser ahead of the workbench when one is needed', async () => {
    const target = await harness.mount({
      services: services(
        fakeAlchemyStore({
          needsChooser: true,
          systems: [
            { id: 'sys-a', name: 'Herbalism' },
            { id: 'sys-b', name: 'Poisoncraft' },
          ],
        })
      ),
    });

    assert.ok(
      !target.querySelector('[data-alchemy-state="workbench"]'),
      'the workbench waits for the discipline choice'
    );
    assert.ok(
      target.textContent.includes('Herbalism'),
      'the chooser renders the selectable disciplines'
    );
  });

  it('draws each discipline as a list-row card: one unpressed button that enters it', async () => {
    const chosen = [];
    const target = await harness.mount({
      services: services(
        fakeAlchemyStore({
          needsChooser: true,
          systems: [
            { id: 'sys-a', name: 'Herbalism', knownCount: 1, totalCount: 4, description: 'Roots.' },
            { id: 'sys-b', name: 'Poisoncraft', knownCount: 0, totalCount: 2 },
          ],
          chooseSystem: (id) => {
            chosen.push(id);
          },
        })
      ),
    });
    const cards = [
      ...target.querySelectorAll(':scope .alchemy-chooser-grid > .fabricate-list-row'),
    ];
    assert.deepEqual(
      cards.map((card) => {
        const control = card.querySelector(':scope > button.fabricate-list-row-open');
        return [
          card.classList.contains('is-card'),
          card.querySelectorAll('button').length,
          control.classList.contains('alchemy-chooser-card'),
          control.getAttribute('data-alchemy-chooser-card'),
          control.getAttribute('aria-label'),
          control.hasAttribute('aria-pressed'),
          control.getAttribute('data-keyboard-focus'),
          control.querySelectorAll(NON_PHRASING_CONTENT).length,
        ];
      }),
      [
        [true, 1, true, 'sys-a', 'Herbalism', false, 'true', 0],
        [true, 1, true, 'sys-b', 'Poisoncraft', false, 'true', 0],
      ],
      'each card is one named action button holding phrasing content, pressed by nothing'
    );
    const herbalism = cards[0].querySelector(':scope > button');
    assert.match(
      herbalism.querySelector(':scope > .fab-medallion')?.getAttribute('style') ?? '',
      /width:\s*38px/u,
      "the card leads with the art ladder's 38px mark"
    );
    const described = (herbalism.getAttribute('aria-describedby') ?? '')
      .split(/\s+/u)
      .map((id) =>
        target.querySelector(`[id="${id}"]`)?.textContent.replaceAll(/\s+/gu, ' ').trim()
      );
    assert.deepEqual(
      described,
      [
        'FABRICATE.App.Alchemy.SystemSummary:{"known":1,"total":4}',
        'Roots. FABRICATE.App.Alchemy.EnterDiscipline',
      ],
      'its count, then its blurb and its enter cue, describe it'
    );
    cards[1].querySelector(':scope > button').click();
    assert.deepEqual(chosen, ['sys-b'], 'choosing a card enters that discipline');
  });

  it('presses the known recipe the store selected and marks the one the bench matches', async () => {
    const recipe = (id, name) => ({ id, name, img: null, result: null, signatureSummary: [] });
    const target = await harness.mount({
      services: services(
        fakeAlchemyStore({
          knownRecipes: [recipe('vigor', 'Elixir of Vigor'), recipe('venom', 'Blade Venom')],
          knownCount: 2,
          selectedRecipeId: 'vigor',
          mode: 'ready',
          target: { id: 'venom', name: 'Blade Venom' },
        })
      ),
    });
    const rows = [...target.querySelectorAll(':scope [data-alchemy-recipe]')];
    assert.deepEqual(
      rows.map((row) => [
        row.getAttribute('data-alchemy-recipe'),
        row.getAttribute('aria-pressed'),
        row.classList.contains('is-match'),
      ]),
      [
        ['vigor', 'true', false],
        ['venom', 'false', true],
      ]
    );
  });
});
