import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let GatheringView;
let mounted;
let target;

function rewriteClientImports(code) {
  return code
    .replace(/from 'svelte';/g, "from 'svelte/internal/client';")
    .replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

function writeCompiledSvelte(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compile(source, {
    filename: sourcePath,
    generate: 'client',
    dev: true,
    css: 'injected'
  });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

function environment(overrides = {}) {
  return {
    id: 'env-meadow',
    name: 'Sunlit Meadow',
    img: 'icons/svg/sun.svg',
    description: 'A gently rolling field bathed in afternoon light.',
    locked: false,
    selectionMode: 'targeted',
    revealPolicy: 'never',
    discoveredTaskCount: 0,
    composedTaskCount: 0,
    biomeTags: [{ id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage', customColor: '' }],
    ...overrides
  };
}

function listing(environments) {
  return {
    visible: true,
    selectedActorId: 'Actor.actor-1',
    environments
  };
}

function makeServices(result, { reject = false } = {}) {
  return {
    listGatheringForActor: () => (reject ? Promise.reject(new Error('boom')) : Promise.resolve(result))
  };
}

async function mountView(services) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(GatheringView, { target, props: { services } });
  flushSync();
  // Let the async fetch + finally resolve, then flush the resulting state.
  await tick();
  await tick();
  flushSync();
}

describe('GatheringView mounted behavior', () => {
  before(async () => {
    setupDOM();
    globalThis.Text = document.createTextNode('').constructor;
    globalThis.Comment = document.createComment('').constructor;
    globalThis.game = {
      i18n: {
        localize: (key) => key,
        format: (key, data) => `${key}:${JSON.stringify(data)}`
      }
    };
    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-gathering-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    const utilDestination = join(tempRoot, 'src/ui/svelte/util/foundryBridge.js');
    mkdirSync(dirname(utilDestination), { recursive: true });
    writeFileSync(utilDestination, readFileSync(resolve(repoRoot, 'src/ui/svelte/util/foundryBridge.js'), 'utf8'));

    const imageDefaultsDestination = join(tempRoot, 'src/gatheringImageDefaults.js');
    mkdirSync(dirname(imageDefaultsDestination), { recursive: true });
    writeFileSync(imageDefaultsDestination, readFileSync(resolve(repoRoot, 'src/gatheringImageDefaults.js'), 'utf8'));

    const conditionIconsDestination = join(tempRoot, 'src/ui/svelte/util/gatheringConditionIcons.js');
    writeFileSync(conditionIconsDestination, readFileSync(resolve(repoRoot, 'src/ui/svelte/util/gatheringConditionIcons.js'), 'utf8'));

    // EnvironmentCard / GatheringDetail / event + task components share the
    // gathering presentation helpers (risk/biome/percent/description).
    const gatheringFormatDestination = join(tempRoot, 'src/ui/svelte/util/gatheringFormat.js');
    writeFileSync(gatheringFormatDestination, readFileSync(resolve(repoRoot, 'src/ui/svelte/util/gatheringFormat.js'), 'utf8'));

    // GatheringView imports the pure default-selection helper; copy it into the
    // temp module tree so the compiled component can resolve it at import time.
    const selectionDefaultDestination = join(tempRoot, 'src/ui/svelte/apps/gathering/selectionDefault.js');
    mkdirSync(dirname(selectionDefaultDestination), { recursive: true });
    writeFileSync(
      selectionDefaultDestination,
      readFileSync(resolve(repoRoot, 'src/ui/svelte/apps/gathering/selectionDefault.js'), 'utf8')
    );

    // GatheringView also imports the pure scoped-selection helper (interactable
    // env+task auto-select); copy it into the temp tree so the compiled component
    // can resolve it at import time.
    const scopedSelectionDestination = join(tempRoot, 'src/ui/svelte/apps/gathering/scopedSelection.js');
    writeFileSync(
      scopedSelectionDestination,
      readFileSync(resolve(repoRoot, 'src/ui/svelte/apps/gathering/scopedSelection.js'), 'utf8')
    );

    // LinkedScene (in the detail tree) imports the scene-image helper.
    const sceneImagesDestination = join(tempRoot, 'src/ui/svelte/util/sceneImages.js');
    mkdirSync(dirname(sceneImagesDestination), { recursive: true });
    writeFileSync(sceneImagesDestination, readFileSync(resolve(repoRoot, 'src/ui/svelte/util/sceneImages.js'), 'utf8'));

    // GatheringTaskDetail (in the detail tree) imports the calendar-aware
    // respawn-ETA duration formatter, which imports the foundryCalendar helpers.
    const formatDurationDestination = join(tempRoot, 'src/ui/svelte/util/formatDuration.js');
    writeFileSync(formatDurationDestination, readFileSync(resolve(repoRoot, 'src/ui/svelte/util/formatDuration.js'), 'utf8'));
    const foundryCalendarDestination = join(tempRoot, 'src/systems/foundryCalendar.js');
    mkdirSync(dirname(foundryCalendarDestination), { recursive: true });
    writeFileSync(foundryCalendarDestination, readFileSync(resolve(repoRoot, 'src/systems/foundryCalendar.js'), 'utf8'));

    // GatheringTaskDetail + GatheringView share the blocked-reason localizer.
    const blockedReasonsDestination = join(tempRoot, 'src/ui/svelte/apps/gathering/gatheringBlockedReasons.js');
    mkdirSync(dirname(blockedReasonsDestination), { recursive: true });
    writeFileSync(blockedReasonsDestination, readFileSync(resolve(repoRoot, 'src/ui/svelte/apps/gathering/gatheringBlockedReasons.js'), 'utf8'));

    writeCompiledSvelte('src/ui/svelte/components/Pagination.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/EnvironmentCard.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringEnvironmentList.svelte');
    // GatheringView now renders the center-column detail tree; compile it too so
    // the compiled view can resolve its imports at mount time.
    writeCompiledSvelte('src/ui/svelte/apps/gathering/ChanceBar.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/LinkedScene.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTaskRequirements.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTaskRow.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringEventRow.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringEventDetail.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringDetailTabs.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTasksPanel.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringEventsPanel.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringDetail.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringDropModifiers.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTaskDrops.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTaskDetail.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringView.svelte');

    GatheringView = (await import(pathToFileURL(join(
      tempRoot,
      'src/ui/svelte/apps/gathering/GatheringView.svelte.js'
    )))).default;
  });

  afterEach(() => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
  });

  after(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    teardownDOM();
    delete globalThis.game;
  });

  it('transitions from loading to a populated 3-column layout', async () => {
    await mountView(makeServices(listing([environment()])));

    assert.equal(target.querySelector('[data-gathering-state="loading"]'), null, 'loading state cleared');
    assert.ok(target.querySelector('[data-gathering-state="populated"]'), 'populated layout shown');
    assert.ok(target.querySelector('.gathering-view-column-center'), 'center column present');
    assert.ok(target.querySelector('.gathering-view-column-right'), 'right column present');
    assert.equal(target.querySelectorAll('[data-environment-id]').length, 1, 'one environment card');
  });

  it('shows the empty state when no actor is selected', async () => {
    await mountView(makeServices({ visible: true, selectedActorId: null, environments: [] }));

    assert.ok(target.querySelector('[data-gathering-state="empty"]'), 'no-actor renders empty state');
    assert.equal(target.querySelector('[data-gathering-state="populated"]'), null);
  });

  it('shows the error state when the service rejects', async () => {
    await mountView(makeServices(null, { reject: true }));

    assert.ok(target.querySelector('[data-gathering-state="error"]'), 'rejection renders error state');
  });

  it('selects an available card on click and marks it selected', async () => {
    await mountView(makeServices(listing([
      environment({ id: 'env-a', name: 'Alpha' }),
      environment({ id: 'env-b', name: 'Beta' })
    ])));

    const cardB = target.querySelector('[data-environment-id="env-b"]');
    assert.equal(cardB.getAttribute('data-selected'), 'false', 'starts unselected');
    cardB.click();
    flushSync();

    const selectedB = target.querySelector('[data-environment-id="env-b"]');
    assert.equal(selectedB.getAttribute('data-selected'), 'true', 'click selects the card');
    assert.ok(selectedB.classList.contains('is-selected'), 'selected card gets the highlight class');
    const cardA = target.querySelector('[data-environment-id="env-a"]');
    assert.equal(cardA.getAttribute('data-selected'), 'false', 'other card stays unselected');
  });

  it('renders locked cards with no button and not in the tab order', async () => {
    await mountView(makeServices(listing([
      environment({ id: 'env-open', name: 'Open' }),
      environment({ id: 'env-locked', name: 'Sealed', locked: true })
    ])));

    const lockedCard = target.querySelector('[data-environment-id="env-locked"]');
    assert.equal(lockedCard.getAttribute('data-locked'), 'true', 'locked hook set');
    assert.equal(lockedCard.tagName.toLowerCase(), 'div', 'locked card is a div, not a button');
    assert.equal(lockedCard.querySelector('button'), null, 'locked card renders no button');
    assert.equal(lockedCard.hasAttribute('tabindex'), false, 'locked card is not focusable');
    assert.ok(lockedCard.querySelector('.fa-lock'), 'locked card shows a lock icon');

    // The lock renders as an overlay OVER the thumbnail, not as a separate chip.
    const overlay = lockedCard.querySelector('.gathering-env-card-lock-overlay');
    assert.ok(overlay, 'locked card renders the lock overlay element');
    const thumbWrap = lockedCard.querySelector('.gathering-env-card-thumb-wrap');
    assert.ok(thumbWrap, 'locked card has the relative thumb wrapper');
    assert.ok(thumbWrap.contains(overlay), 'lock overlay sits within the thumb container (over the image)');
    assert.ok(overlay.querySelector('.fa-lock'), 'overlay carries the lock icon');
    assert.equal(
      lockedCard.querySelector('.gathering-env-card-lock'),
      null,
      'no separate lock chip element remains (the old .gathering-env-card-lock chip is gone)'
    );

    // Available environments render before locked ones.
    const cards = Array.from(target.querySelectorAll('[data-environment-id]'));
    assert.deepEqual(
      cards.map(card => card.getAttribute('data-environment-id')),
      ['env-open', 'env-locked'],
      'available before locked'
    );
  });

  it('renders a "Not in current realm" header alert on a realm-locked card', async () => {
    await mountView(makeServices(listing([
      environment({ id: 'env-open', name: 'Open' }),
      environment({
        id: 'env-realm',
        name: 'Far Vale',
        locked: true,
        location: { gated: true, available: false, currentRealms: [], guidance: null },
        blockedReasons: [{ code: 'NO_CURRENT_REALM', message: 'No party realm set.' }]
      })
    ])));

    const realmCard = target.querySelector('[data-environment-id="env-realm"]');
    assert.equal(realmCard.getAttribute('data-locked'), 'true', 'realm-gated env renders locked');
    assert.equal(realmCard.querySelector('button'), null, 'realm-locked card is not selectable');

    const alert = realmCard.querySelector('.gathering-env-card-realm-alert');
    assert.ok(alert, 'realm-locked card shows the realm alert chip');
    assert.match(alert.textContent, /RealmLockedChip/, 'chip uses the RealmLockedChip label');
    assert.ok(alert.querySelector('.fa-location-dot'), 'chip carries the location icon');
    assert.equal(alert.getAttribute('title'), 'No party realm set.', 'tooltip is the full reason message');

    // The alert sits in the header alongside the danger pip.
    const header = realmCard.querySelector('.gathering-env-card-header');
    assert.ok(header.contains(alert), 'alert is in the card header');
    assert.ok(header.querySelector('.gathering-env-card-event'), 'danger pip is in the same header');

    // A normal (in-realm/open) environment shows no realm alert.
    const openCard = target.querySelector('[data-environment-id="env-open"]');
    assert.equal(openCard.querySelector('.gathering-env-card-realm-alert'), null, 'open env has no realm alert');
  });

  it('renders a literal customColor hex in the chip --fab-chip-color, distinct from the token path', async () => {
    await mountView(makeServices(listing([
      environment({
        id: 'env-hex',
        name: 'Painted Vale',
        biomeTags: [
          { id: 'custom', label: 'Custom', icon: 'fas fa-paintbrush', colorToken: 'sage', customColor: '#112233' },
          { id: 'token', label: 'Token', icon: 'fas fa-tree', colorToken: 'sage', customColor: '' }
        ]
      })
    ])));

    const chips = target.querySelectorAll('[data-environment-id="env-hex"] .gathering-env-card-chip');
    assert.equal(chips.length, 2, 'both biome chips render');

    const hexStyle = chips[0].getAttribute('style') || '';
    assert.ok(
      hexStyle.includes('--fab-chip-color: #112233'),
      `custom hex chip uses the literal hex (saw: ${hexStyle})`
    );
    assert.equal(
      hexStyle.includes('var(--fab-tag-'),
      false,
      'custom hex chip does not fall through to the token var path'
    );

    const tokenStyle = chips[1].getAttribute('style') || '';
    assert.ok(
      tokenStyle.includes('--fab-chip-color: var(--fab-tag-sage)'),
      `token chip uses the var(--fab-tag-<token>) path (saw: ${tokenStyle})`
    );
  });

  it('renders one chip per biome tag and no chip row for an empty biomeTags array', async () => {
    await mountView(makeServices(listing([
      environment({
        id: 'env-two-tags',
        name: 'Twin Biomes',
        biomeTags: [
          { id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage', customColor: '' },
          { id: 'ruins', label: 'Ruins', icon: 'fas fa-archway', colorToken: 'amber', customColor: '' }
        ]
      }),
      environment({ id: 'env-no-tags', name: 'Featureless', biomeTags: [] })
    ])));

    const twoTagCard = target.querySelector('[data-environment-id="env-two-tags"]');
    assert.equal(
      twoTagCard.querySelectorAll('.gathering-env-card-chip').length,
      2,
      'two biome tags render two chips'
    );
    assert.ok(twoTagCard.querySelector('.gathering-env-card-chips'), 'chip row container present');

    const noTagCard = target.querySelector('[data-environment-id="env-no-tags"]');
    assert.equal(
      noTagCard.querySelector('.gathering-env-card-chips'),
      null,
      'empty biomeTags renders no chip row (the {#if biomeTags.length > 0} empty branch)'
    );
    assert.equal(noTagCard.querySelectorAll('.gathering-env-card-chip').length, 0, 'no chips when biomeTags is empty');
  });

  it('moves selection from one card to another, clearing the previous selection', async () => {
    await mountView(makeServices(listing([
      environment({ id: 'env-a', name: 'Alpha' }),
      environment({ id: 'env-b', name: 'Beta' })
    ])));

    const cardA = target.querySelector('[data-environment-id="env-a"]');
    cardA.click();
    flushSync();

    const selectedA = target.querySelector('[data-environment-id="env-a"]');
    assert.equal(selectedA.getAttribute('data-selected'), 'true', 'A is selected after clicking A');
    assert.ok(selectedA.classList.contains('is-selected'), 'A gets the highlight class');
    assert.equal(selectedA.getAttribute('aria-pressed'), 'true', 'A reports aria-pressed=true');

    const cardB = target.querySelector('[data-environment-id="env-b"]');
    cardB.click();
    flushSync();

    const clearedA = target.querySelector('[data-environment-id="env-a"]');
    assert.equal(clearedA.getAttribute('data-selected'), 'false', 'A clears when B is selected');
    assert.equal(clearedA.classList.contains('is-selected'), false, 'A loses the highlight class');
    assert.equal(clearedA.getAttribute('aria-pressed'), 'false', 'A reports aria-pressed=false');

    const selectedB = target.querySelector('[data-environment-id="env-b"]');
    assert.equal(selectedB.getAttribute('data-selected'), 'true', 'B is now selected');
    assert.ok(selectedB.classList.contains('is-selected'), 'B gets the highlight class');
    assert.equal(selectedB.getAttribute('aria-pressed'), 'true', 'B reports aria-pressed=true — single-selection invariant holds');
  });

  it('shows the (x/y) suffix only for blind environments with reveal !== never', async () => {
    await mountView(makeServices(listing([
      environment({ id: 'env-blind', name: 'Hidden Grove', selectionMode: 'blind', revealPolicy: 'onAttempt', discoveredTaskCount: 1, composedTaskCount: 3 }),
      environment({ id: 'env-blind-never', name: 'Quiet Grove', selectionMode: 'blind', revealPolicy: 'never', discoveredTaskCount: 0, composedTaskCount: 3 }),
      environment({ id: 'env-targeted', name: 'Open Field', selectionMode: 'targeted', revealPolicy: 'onAttempt' })
    ])));

    const blindCard = target.querySelector('[data-environment-id="env-blind"]');
    assert.ok(blindCard.querySelector('.gathering-env-card-discovered'), 'blind + reveal shows suffix');
    assert.ok(blindCard.textContent.includes('(1/3)'), 'suffix renders the counts');

    const neverCard = target.querySelector('[data-environment-id="env-blind-never"]');
    assert.equal(neverCard.querySelector('.gathering-env-card-discovered'), null, 'reveal never hides suffix');

    const targetedCard = target.querySelector('[data-environment-id="env-targeted"]');
    assert.equal(targetedCard.querySelector('.gathering-env-card-discovered'), null, 'targeted hides suffix');
  });

  it('auto-selects the first non-locked environment after load', async () => {
    await mountView(makeServices(listing([
      environment({ id: 'env-a', name: 'Alpha' }),
      environment({ id: 'env-b', name: 'Beta' })
    ])));

    const cardA = target.querySelector('[data-environment-id="env-a"]');
    assert.equal(cardA.getAttribute('data-selected'), 'true', 'first available card auto-selected after load');
    assert.ok(cardA.classList.contains('is-selected'), 'auto-selected card carries the selection class');

    const cardB = target.querySelector('[data-environment-id="env-b"]');
    assert.equal(cardB.getAttribute('data-selected'), 'false', 'only the first card is auto-selected');
  });

  it('never auto-selects a locked environment, skipping to the first selectable one', async () => {
    await mountView(makeServices(listing([
      // Listing order leads with a locked entry; the locked one must never be
      // auto-selected, and the first SELECTABLE env is chosen instead.
      environment({ id: 'env-locked', name: 'Sealed', locked: true }),
      environment({ id: 'env-open', name: 'Open' })
    ])));

    const lockedCard = target.querySelector('[data-environment-id="env-locked"]');
    assert.equal(lockedCard.getAttribute('data-locked'), 'true', 'locked card present');
    // Locked cards have no data-selected hook at all (they are non-interactive divs).
    assert.equal(lockedCard.hasAttribute('data-selected'), false, 'locked card carries no selection hook');
    assert.equal(lockedCard.classList.contains('is-selected'), false, 'locked card never gets the selection class');

    const openCard = target.querySelector('[data-environment-id="env-open"]');
    assert.equal(openCard.getAttribute('data-selected'), 'true', 'first selectable env is auto-selected');
  });

  it('selected card gets a border outline and keeps its selection look (hover rule is :not(.is-selected)-scoped)', async () => {
    await mountView(makeServices(listing([environment({ id: 'env-a', name: 'Alpha' })])));

    const card = target.querySelector('[data-environment-id="env-a"]');
    assert.equal(card.getAttribute('data-selected'), 'true', 'single env auto-selected');
    assert.ok(card.classList.contains('is-selected'), 'selected card carries the selection class');

    // The hover background is scoped so a hovered selected card keeps success-soft + outline.
    const cardSource = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/gathering/EnvironmentCard.svelte'),
      'utf8'
    );
    assert.ok(
      cardSource.includes('.gathering-env-card.is-available:not(.is-selected):hover'),
      'hover background is :not(.is-selected)-scoped so selection survives hover'
    );
    assert.ok(
      cardSource.includes('border-color: var(--fab-accent)'),
      'selected card gets a full accent-coloured border outline'
    );
  });

  it('renders the description under the main row and omits it entirely when empty', async () => {
    await mountView(makeServices(listing([
      environment({ id: 'env-desc', name: 'Described', description: 'A lush riverbank teeming with reeds.' }),
      environment({ id: 'env-no-desc', name: 'Bare', description: '' })
    ])));

    const describedCard = target.querySelector('[data-environment-id="env-desc"]');
    const desc = describedCard.querySelector('.gathering-env-card-description');
    assert.ok(desc, 'description element renders when description is present');
    assert.ok(desc.textContent.includes('A lush riverbank teeming with reeds.'), 'description text rendered');

    // The description is a sibling of the main row, beneath it.
    const main = describedCard.querySelector('.gathering-env-card-main');
    assert.ok(main, 'main row container present');
    assert.equal(main.contains(desc), false, 'description is not nested inside the main row');
    assert.equal(main.nextElementSibling, desc, 'description follows the main row');

    const bareCard = target.querySelector('[data-environment-id="env-no-desc"]');
    assert.equal(
      bareCard.querySelector('.gathering-env-card-description'),
      null,
      'description element omitted entirely when description is empty'
    );
  });

  it('renders a blind + locked card as a non-interactive teaser with lock overlay, blind badge, and 0/0 counts', async () => {
    await mountView(makeServices(listing([
      environment({
        id: 'env-blind-locked',
        name: 'Sealed Grove',
        locked: true,
        selectionMode: 'blind',
        revealPolicy: 'onAttempt',
        composedTaskCount: 0,
        discoveredTaskCount: 0
      })
    ])));

    const card = target.querySelector('[data-environment-id="env-blind-locked"]');
    assert.equal(card.getAttribute('data-locked'), 'true', 'locked hook set');

    // Lock overlay is present within the thumb wrapper (over the image).
    const thumbWrap = card.querySelector('.gathering-env-card-thumb-wrap');
    assert.ok(thumbWrap, 'thumb wrapper present');
    const overlay = card.querySelector('.gathering-env-card-lock-overlay');
    assert.ok(overlay, 'lock overlay present');
    assert.ok(thumbWrap.contains(overlay), 'lock overlay sits within the thumb wrapper');
    assert.ok(overlay.querySelector('.fa-lock'), 'overlay carries the lock icon');

    // The blind badge still renders on a locked teaser.
    assert.ok(card.querySelector('.gathering-env-card-blind'), 'blind badge present on locked card');

    // The card is non-interactive: a locked div, no button, not focusable.
    assert.equal(card.tagName.toLowerCase(), 'div', 'locked card is a div, not a button');
    assert.equal(card.querySelector('button'), null, 'locked card renders no button');
    assert.equal(card.hasAttribute('tabindex'), false, 'locked card is not focusable');

    // If the (x/y) suffix renders, it must show (0/0) — the locked listing pins
    // counts to 0, so no real composed count can leak through the suffix.
    const discovered = card.querySelector('.gathering-env-card-discovered');
    if (discovered) {
      assert.ok(discovered.textContent.includes('(0/0)'), 'discovered suffix, if shown, reads (0/0) with no leak');
    }
  });

  it('renders the description on a LOCKED card (description is identity-level teaser info)', async () => {
    await mountView(makeServices(listing([
      environment({
        id: 'env-locked-desc',
        name: 'Sealed Vault',
        locked: true,
        description: 'A heavy iron door bars the way.'
      })
    ])));

    const card = target.querySelector('[data-environment-id="env-locked-desc"]');
    assert.equal(card.getAttribute('data-locked'), 'true', 'locked hook set');
    const desc = card.querySelector('.gathering-env-card-description');
    assert.ok(desc, 'description renders on a locked card');
    assert.ok(
      desc.textContent.includes('A heavy iron door bars the way.'),
      'locked card description text rendered (identity-level, not redacted)'
    );
  });

  it('places the blind badge in the card header bar, not inline with the name or main row', async () => {
    await mountView(makeServices(listing([
      environment({
        id: 'env-blind',
        name: 'Hidden Grove',
        selectionMode: 'blind',
        revealPolicy: 'onAttempt',
        discoveredTaskCount: 1,
        composedTaskCount: 3,
        biomeTags: [{ id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage', customColor: '' }]
      })
    ])));

    const card = target.querySelector('[data-environment-id="env-blind"]');
    const header = card.querySelector('.gathering-env-card-header');
    const main = card.querySelector('.gathering-env-card-main');
    const nameRow = card.querySelector('.gathering-env-card-name-row');
    const blind = card.querySelector('.gathering-env-card-blind');
    const chips = card.querySelector('.gathering-env-card-chips');

    assert.ok(blind, 'blind badge renders');
    assert.ok(header, 'card header bar renders');
    assert.ok(header.contains(blind), 'blind badge lives in the header bar');
    assert.equal(main.contains(blind), false, 'blind badge is not in the main row');
    assert.equal(nameRow.contains(blind), false, 'blind badge is not inline with the name');
    assert.ok(chips, 'chips row still renders');
    // The header is the card's first child, above the main row.
    const kids = Array.from(card.children);
    assert.ok(kids.indexOf(header) < kids.indexOf(main), 'header precedes the main row');
  });

  it('always shows a danger pill in the header bar, with its level name, coloured by risk tier and to the right of the blind chip', async () => {
    await mountView(makeServices(listing([
      environment({ id: 'env-safe', name: 'Safe Meadow', risk: 'safe' }),
      environment({
        id: 'env-blind-deadly',
        name: 'Deadly Grove',
        selectionMode: 'blind',
        revealPolicy: 'onAttempt',
        risk: 'deadly'
      })
    ])));

    // Always shown, even on a non-blind card.
    const safeCard = target.querySelector('[data-environment-id="env-safe"]');
    const safeHeader = safeCard.querySelector('.gathering-env-card-header');
    const safeEvent = safeCard.querySelector('.gathering-env-card-event');
    assert.ok(safeEvent, 'danger pill renders on a non-blind card');
    assert.ok(safeHeader.contains(safeEvent), 'danger pill lives in the header bar');
    assert.ok(safeEvent.classList.contains('risk-safe'), 'pill carries the risk tier class');
    assert.ok(safeEvent.querySelector('.fa-skull'), 'pill shows the danger icon');
    // The chip now shows the level name, not just the icon.
    const safeLabel = safeEvent.querySelector('.gathering-env-card-event-label');
    assert.ok(safeLabel, 'danger pill renders a level-name label');
    assert.ok((safeLabel.textContent || '').includes('Risk.safe'), 'label shows the localized danger level');

    // On a blind card the pill sits to the RIGHT of the blind chip in the header.
    const blindCard = target.querySelector('[data-environment-id="env-blind-deadly"]');
    const header = blindCard.querySelector('.gathering-env-card-header');
    const blind = header.querySelector('.gathering-env-card-blind');
    const event = header.querySelector('.gathering-env-card-event');
    assert.ok(blind && event, 'both the blind chip and the danger pill render');
    assert.equal(blind.nextElementSibling, event, 'danger pill is to the right of the blind chip');
    assert.ok(event.classList.contains('risk-deadly'), 'deadly tier class applied');
  });

  it('uses the linked-scene thumbnail for the card image when the environment links a scene', async () => {
    globalThis.fromUuid = async (uuid) => (uuid === 'Scene.cave'
      ? { name: 'Collapsed Tunnel', thumb: 'scenes/cave-thumb.webp' }
      : null);
    try {
      await mountView(makeServices(listing([
        environment({ id: 'env-scene', name: 'Mines', img: 'icons/svg/sun.svg', sceneUuid: 'Scene.cave', biomeTags: [] }),
        environment({ id: 'env-plain', name: 'Open Field', img: 'icons/svg/sun.svg', biomeTags: [] })
      ])));
      // Let the async fromUuid resolution settle and flush.
      await tick();
      await tick();
      flushSync();

      const sceneThumb = target.querySelector('[data-environment-id="env-scene"] .gathering-env-card-thumb');
      assert.equal(sceneThumb.getAttribute('src'), 'scenes/cave-thumb.webp', 'linked-scene thumbnail used');
      assert.equal(sceneThumb.classList.contains('is-fallback'), false, 'a resolved thumbnail is not a fallback');

      // An environment without a linked scene keeps its own image.
      const plainThumb = target.querySelector('[data-environment-id="env-plain"] .gathering-env-card-thumb');
      assert.equal(plainThumb.getAttribute('src'), 'icons/svg/sun.svg', 'no linked scene keeps the environment image');
    } finally {
      delete globalThis.fromUuid;
    }
  });

  function typeSearch(value) {
    const input = target.querySelector('.gathering-env-search input');
    input.value = value;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
  }

  function manyEnvironments(count) {
    return Array.from({ length: count }, (_, index) =>
      environment({
        id: `env-${index}`,
        name: `Environment ${index}`,
        description: `Description for environment ${index}`,
        biomeTags: []
      })
    );
  }

  it('paginates a long listing to pageSize (6) cards on the first page', async () => {
    await mountView(makeServices(listing(manyEnvironments(10))));

    assert.equal(
      target.querySelectorAll('[data-environment-id]').length,
      6,
      'only the first page of 6 cards renders'
    );
    // The pagination footer is shown once there are more items than the smallest option.
    assert.ok(target.querySelector('.manager-pagination'), 'pagination footer renders past pageSize');
    assert.ok(target.querySelector('[data-pagination-next]'), 'a next-page control is present');
  });

  it('advancing the page renders the remaining cards', async () => {
    await mountView(makeServices(listing(manyEnvironments(10))));

    const next = target.querySelector('[data-pagination-next]');
    next.click();
    flushSync();

    assert.equal(
      target.querySelectorAll('[data-environment-id]').length,
      4,
      'the second page renders the remaining 4 cards'
    );
    assert.ok(target.querySelector('[data-environment-id="env-9"]'), 'a later environment is now visible');
  });

  it('filters the rendered cards by a case-insensitive name/description substring', async () => {
    await mountView(makeServices(listing([
      environment({ id: 'env-meadow', name: 'Sunlit Meadow', description: 'A rolling field.', biomeTags: [] }),
      environment({ id: 'env-cavern', name: 'Deep Cavern', description: 'A dark hollow under the hills.', biomeTags: [] }),
      environment({ id: 'env-shore', name: 'Quiet Shore', description: 'Waves lap a meadow of kelp.', biomeTags: [] })
    ])));

    typeSearch('CAVERN');
    assert.equal(target.querySelectorAll('[data-environment-id]').length, 1, 'only the name match remains');
    assert.ok(target.querySelector('[data-environment-id="env-cavern"]'), 'the cavern card matches by name');

    // "meadow" matches the meadow name AND the shore description (kelp meadow).
    typeSearch('meadow');
    const ids = Array.from(target.querySelectorAll('[data-environment-id]')).map(card => card.getAttribute('data-environment-id'));
    assert.deepEqual(ids.sort(), ['env-meadow', 'env-shore'], 'description matches are included case-insensitively');
  });

  it('shows the NoMatches message when the search matches nothing', async () => {
    await mountView(makeServices(listing([
      environment({ id: 'env-a', name: 'Alpha', description: '', biomeTags: [] }),
      environment({ id: 'env-b', name: 'Beta', description: '', biomeTags: [] })
    ])));

    typeSearch('zzzznomatch');
    assert.equal(target.querySelectorAll('[data-environment-id]').length, 0, 'no cards render');
    const empty = target.querySelector('.gathering-env-empty');
    assert.ok(empty, 'the no-match message renders');
    assert.ok(
      empty.textContent.includes('FABRICATE.App.Gathering.Environments.NoMatches'),
      'the no-match message uses the localized key'
    );
  });

  it('keeps the selection across a search that still shows the selected card', async () => {
    await mountView(makeServices(listing([
      environment({ id: 'env-a', name: 'Alpha', description: '', biomeTags: [] }),
      environment({ id: 'env-b', name: 'Beta', description: '', biomeTags: [] }),
      environment({ id: 'env-c', name: 'Gamma', description: '', biomeTags: [] })
    ])));

    const cardB = target.querySelector('[data-environment-id="env-b"]');
    cardB.click();
    flushSync();
    assert.equal(
      target.querySelector('[data-environment-id="env-b"]').getAttribute('data-selected'),
      'true',
      'B is selected'
    );

    // Narrow to a search that still includes Beta; selection must persist.
    typeSearch('Beta');
    const stillSelected = target.querySelector('[data-environment-id="env-b"]');
    assert.ok(stillSelected, 'the selected card is still visible after filtering');
    assert.equal(stillSelected.getAttribute('data-selected'), 'true', 'selection persists across the search');

    // Clearing the search keeps the same selection.
    typeSearch('');
    assert.equal(
      target.querySelector('[data-environment-id="env-b"]').getAttribute('data-selected'),
      'true',
      'selection persists after clearing the search'
    );
  });

  it('keeps the selection when paging away from and back to the selected card', async () => {
    await mountView(makeServices(listing(manyEnvironments(10))));

    // Auto-selection picks the first env; confirm then page forward and back.
    const first = target.querySelector('[data-environment-id="env-0"]');
    assert.equal(first.getAttribute('data-selected'), 'true', 'first env auto-selected');

    target.querySelector('[data-pagination-next]').click();
    flushSync();
    assert.equal(target.querySelector('[data-environment-id="env-0"]'), null, 'selected card is off the visible page');

    target.querySelector('[data-pagination-prev]').click();
    flushSync();
    const backOnPage = target.querySelector('[data-environment-id="env-0"]');
    assert.ok(backOnPage, 'selected card is visible again on page 1');
    assert.equal(backOnPage.getAttribute('data-selected'), 'true', 'selection persisted across paging');
  });

  it('resets to page 0 when a search from a later page shrinks the filtered set past the current offset', async () => {
    // 10 envs at pageSize 6 -> 2 pages. Advance to page 2, then search a term that
    // matches only an early environment so the filtered set is far below the page-2 offset.
    await mountView(makeServices(listing(manyEnvironments(10))));

    target.querySelector('[data-pagination-next]').click();
    flushSync();
    const pageIndicator = target.querySelector('[data-pagination-page]');
    assert.ok(pageIndicator.textContent.includes('2'), 'on page 2 before the search');

    // "Environment 3" matches only env-3; the single survivor must render, proving the
    // pageIndex > 0 guard reset the page (offset 6 would otherwise hide the lone match).
    typeSearch('Environment 3');
    const survivors = Array.from(target.querySelectorAll('[data-environment-id]')).map(card => card.getAttribute('data-environment-id'));
    assert.deepEqual(survivors, ['env-3'], 'the single matching card is visible after the page reset');
    assert.equal(
      target.querySelector('[data-pagination-prev]'),
      null,
      'page reset to 0 — the prev control is gone (single filtered page)'
    );
  });

  it('re-pages and resets to page 0 when the per-page size is raised from 6 to 9 via the Pagination select', async () => {
    await mountView(makeServices(listing(manyEnvironments(10))));

    target.querySelector('[data-pagination-next]').click();
    flushSync();
    assert.ok(target.querySelector('[data-pagination-page]').textContent.includes('2'), 'on page 2 before resizing');

    const sizeSelect = target.querySelector('[data-pagination-size]');
    // 9 must be a real selectable option from [6, 9, 12].
    assert.ok(
      Array.from(sizeSelect.options).some(option => option.value === '9'),
      '9 is a selectable per-page option'
    );
    sizeSelect.value = '9';
    sizeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    flushSync();

    assert.equal(
      target.querySelectorAll('[data-environment-id]').length,
      9,
      'raising the page size to 9 renders 9 cards'
    );
    assert.ok(target.querySelector('[data-environment-id="env-0"]'), 'page reset to 0 — the first env is visible again');
    assert.ok(target.querySelector('[data-pagination-page]').textContent.includes('1'), 'page indicator shows page 1');
  });

  it('retains the selection when the selected card is filtered out and then returns', async () => {
    await mountView(makeServices(listing([
      environment({ id: 'env-a', name: 'Alpha', description: '', biomeTags: [] }),
      environment({ id: 'env-b', name: 'Beta', description: '', biomeTags: [] })
    ])));

    const cardB = target.querySelector('[data-environment-id="env-b"]');
    cardB.click();
    flushSync();
    assert.equal(
      target.querySelector('[data-environment-id="env-b"]').getAttribute('data-selected'),
      'true',
      'B is selected'
    );

    // Search only matches Alpha, so env-b leaves the DOM entirely.
    typeSearch('Alpha');
    assert.equal(target.querySelector('[data-environment-id="env-b"]'), null, 'selected card is filtered out of the DOM');

    // Clearing the search brings env-b back with its selection intact (selectedId retained).
    typeSearch('');
    const returned = target.querySelector('[data-environment-id="env-b"]');
    assert.ok(returned, 'previously-selected card returns when the filter is cleared');
    assert.equal(returned.getAttribute('data-selected'), 'true', 'selection was retained while the card was filtered out');
  });

  it('hides the pager footer at exactly 6 environments and shows it with two pages at 7', async () => {
    // At <= 6 the footer is hidden (showPagination = totalCount > minPageSize, minPageSize 6).
    await mountView(makeServices(listing(manyEnvironments(6))));
    assert.equal(target.querySelector('.manager-pagination'), null, 'no pager footer at exactly 6 environments');

    // afterEach unmounts the first mount; remount with 7 to cross the boundary.
    unmount(mounted);
    mounted = null;
    target.remove();
    target = null;

    await mountView(makeServices(listing(manyEnvironments(7))));
    assert.ok(target.querySelector('.manager-pagination'), 'pager footer appears at 7 environments');
    assert.ok(target.querySelector('[data-pagination-next]'), 'next control present (2 pages)');
    assert.ok(target.querySelector('[data-pagination-prev]'), 'prev control present (2 pages)');
  });
});
