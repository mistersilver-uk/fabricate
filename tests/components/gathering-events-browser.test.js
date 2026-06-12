import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const browserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringEventsBrowserView.svelte');
const environmentsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const langPath = resolve(repoRoot, 'lang/en.json');
const cssPath = resolve(repoRoot, 'styles/fabricate.css');

const browserSource = readFileSync(browserPath, 'utf8');
const environmentsBrowserSource = readFileSync(environmentsBrowserPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));
const css = readFileSync(cssPath, 'utf8');

describe('GatheringEventsBrowserView source contract', () => {
  it('renders an event library tabpanel with the expected toolbar filters', () => {
    assert.ok(browserSource.includes("class=\"manager-gathering-panel manager-gathering-panel-events\""), 'browser should use the event panel class');
    assert.ok(browserSource.includes('data-gathering-events-browser'), 'browser should expose a data attribute hook for tests');
    assert.ok(browserSource.includes("type=\"search\""), 'browser should include a search input');
    assert.ok(browserSource.includes('bind:value={searchTerm}'), 'browser should bind the search term');
    assert.ok(browserSource.includes("value={statusFilter}"), 'browser should expose a status filter');
    assert.equal(browserSource.includes("value={regionFilter}"), false, 'region filter is removed (region is geography, not composition)');
    assert.ok(browserSource.includes("value={biomeFilter}"), 'browser should expose a biome filter');
    assert.ok(browserSource.includes("value={dangerFilter}"), 'browser should expose a danger tag filter');
  });

  it('exposes row identity, status toggle, and the create/edit/duplicate/delete actions', () => {
    assert.ok(browserSource.includes('data-gathering-event-id={event.id}'), 'rows should expose a data attribute for assertions');
    assert.ok(browserSource.includes('manager-gathering-event-identity'), 'each row should use an event identity button');
    assert.ok(browserSource.includes('onCreateEvent'), 'browser should call onCreateEvent');
    assert.ok(browserSource.includes('onEditEvent'), 'browser should call onEditEvent');
    assert.ok(browserSource.includes('onDuplicateEvent'), 'browser should call onDuplicateEvent');
    assert.ok(browserSource.includes('onDeleteEvent'), 'browser should call onDeleteEvent');
    assert.ok(browserSource.includes('onToggleEventEnabled'), 'browser should call onToggleEventEnabled');
  });

  it('renders the card-style row with four column headers (Event / Tags / Status / Actions)', () => {
    const headBlockStart = browserSource.indexOf('manager-table-head manager-gathering-event-table-head');
    assert.ok(headBlockStart >= 0, 'head block should be present');
    const headBlockEnd = browserSource.indexOf('</div>', headBlockStart);
    const headBlock = browserSource.slice(headBlockStart, headBlockEnd);
    const headerMatches = headBlock.match(/role="columnheader"/g) || [];
    assert.equal(headerMatches.length, 4, 'expected four column headers');
    for (const removed of ['DangerTags', 'DropRate', 'Environments']) {
      assert.equal(
        headBlock.includes(`FABRICATE.Admin.Manager.Environment.Events.${removed}`),
        false,
        `${removed} column header should not be present`
      );
    }
  });

  it('renders chips for biome, time, weather, and danger via rowChips', () => {
    assert.ok(browserSource.includes('rowChips(event)'), 'tags cell renders rowChips(event)');
    for (const helper of ['biomeChips(', 'timeChips(', 'weatherChips(', 'dangerChips(']) {
      assert.ok(browserSource.includes(helper), `helper ${helper} should be present`);
    }
    assert.equal(browserSource.includes('regionChips('), false, 'region chips are removed (region is geography, not composition)');
    assert.ok(browserSource.includes('data-gathering-event-tags'), 'tags cell exposes a data attribute');
    assert.ok(browserSource.includes("icon: 'fa-solid fa-triangle-exclamation'"), 'danger chips should render a triangle warning icon');
    assert.ok(browserSource.includes('{#if chip.icon}<i class={chip.icon} aria-hidden="true"></i>{/if}'), 'row chip icons should be decorative');
    assert.equal(/function\s+activeEnvironmentCount\s*\(/.test(browserSource), false, 'activeEnvironmentCount should be removed');
    assert.equal(/function\s+dropRateLabel\s*\(/.test(browserSource), false, 'dropRateLabel should be removed');
  });

  it('uses a four-column grid for the event table and a scrollable tags cell', () => {
    const gridMatch = css.match(/--fab-mv2-gathering-event-grid:([^;]+);/);
    assert.ok(gridMatch, 'event grid CSS variable should be defined');
    // Count top-level columns with a depth-aware scan (no regex) so whitespace
    // inside a function like minmax(0, 1fr) does not split that column in two.
    const columns = [];
    let depth = 0;
    let token = '';
    for (const ch of gridMatch[1].trim()) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      if ((ch === ' ' || ch === '\t' || ch === '\n') && depth === 0) {
        if (token) { columns.push(token); token = ''; }
      } else {
        token += ch;
      }
    }
    if (token) columns.push(token);
    assert.equal(columns.length, 4, 'expected four grid columns (identity, tags, status, actions)');

    const tagsBlock = css.match(/\.manager-gathering-event-tags-cell\s*\{[^}]*\}/);
    assert.ok(tagsBlock, 'tags cell rule should be defined');
    assert.ok(/display:\s*flex/.test(tagsBlock[0]), 'tags cell must be a flex container');
    assert.ok(/flex-wrap:\s*wrap/.test(tagsBlock[0]), 'tags cell must wrap');
    assert.ok(/overflow-y:\s*auto/.test(tagsBlock[0]), 'tags cell must be scrollable');
    assert.ok(/[^-]height:\s*\d+px/.test(tagsBlock[0]), 'tags cell must use a fixed height so all rows match');
  });

  it('sizes the event thumbnail to 64px to match the environments browser rows', () => {
    const thumbBlock = css.match(/\.manager-gathering-events-table\s+\.manager-gathering-event-identity\s+\.manager-gathering-event-thumb\s*\{[^}]*\}/);
    assert.ok(thumbBlock, 'card-layout thumb override should be defined');
    assert.ok(/width:\s*64px/.test(thumbBlock[0]), 'thumb width should be 64px');
    assert.ok(/height:\s*64px/.test(thumbBlock[0]), 'thumb height should be 64px');
  });

  it('replaces the encounters placeholder with the new event library tabpanel', () => {
    assert.ok(
      environmentsBrowserSource.includes("activeGatheringTab === 'encounters'"),
      'EnvironmentsBrowserView should render the encounters tab when the active tab is encounters'
    );
    assert.ok(
      environmentsBrowserSource.includes('<GatheringEventsBrowserView'),
      'EnvironmentsBrowserView should mount the new GatheringEventsBrowserView component'
    );
    assert.ok(
      !environmentsBrowserSource.includes('EncountersPlaceholderTitle'),
      'placeholder localization keys should be replaced with non-placeholder keys once event authoring lands'
    );
    assert.ok(
      environmentsBrowserSource.includes('EncountersTitle'),
      'events tab should use the EncountersTitle key now that the placeholder is gone'
    );
  });

  it('wires event CRUD and selection state through the manager root', () => {
    assert.ok(rootSource.includes('selectedGatheringEventId'), 'manager root should track the selected event id');
    assert.ok(rootSource.includes('function selectGatheringEvent'), 'manager root should expose selectGatheringEvent');
    assert.ok(rootSource.includes('function createGatheringEvent'), 'manager root should expose createGatheringEvent');
    assert.ok(rootSource.includes('function duplicateGatheringEvent'), 'manager root should expose duplicateGatheringEvent');
    assert.ok(rootSource.includes('function deleteGatheringEvent'), 'manager root should expose deleteGatheringEvent');
    assert.ok(rootSource.includes('function toggleGatheringEventEnabled'), 'manager root should expose toggleGatheringEventEnabled');
    assert.ok(rootSource.includes('function updateSelectedGatheringEvent'), 'manager root should expose updateSelectedGatheringEvent');
    assert.ok(rootSource.includes('store.duplicateGatheringLibraryEvent'), 'manager root should call the new store duplicate action');
  });

  it('localizes the event library labels', () => {
    const eventsNamespace = lang.FABRICATE.Admin.Manager.Environment.Events;
    assert.ok(eventsNamespace, 'lang/en.json should declare the Events namespace');
    for (const key of ['Filters', 'SearchPlaceholder', 'Create', 'Edit', 'Duplicate', 'Delete', 'DangerTags', 'DropRate', 'Environments', 'EmptyTitle']) {
      assert.ok(eventsNamespace[key], `lang/en.json Events namespace should declare ${key}`);
    }
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersTitle, 'Gathering events');
    assert.ok(
      !lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersPlaceholderTitle,
      'placeholder title key should be removed once event authoring lands'
    );
  });

  it('renders a "Used in environments" inspector card identical to the task one', () => {
    assert.ok(rootSource.includes('data-event-environment-usage'), 'event inspector should expose the usage card data attribute');
    assert.ok(rootSource.includes('manager-event-environment-usage-grid'), 'event usage tiles should sit in a grid container');
    assert.ok(rootSource.includes('manager-event-environment-usage-card'), 'event usage should render tiled cards');
    assert.ok(rootSource.includes('manager-event-environment-usage-thumb'), 'event usage tile should include a thumbnail image');
    assert.ok(rootSource.includes('gatheringEventReferencingEnvironments'), 'inspector should filter environments referencing the event');
    assert.ok(rootSource.includes('enabledEventIds'), 'usage should be derived from enabledEventIds');
    const events = lang.FABRICATE.Admin.Manager.Environment.Events;
    assert.equal(events.UsedInEnvironmentsCard, 'Used in environments');
    assert.equal(events.NotUsedInEnvironments, 'Not used in any environments yet.');
  });

  it('shows usage tiles as squares in a three-column grid (shared with the task card)', () => {
    const gridBlock = css.match(/\.manager-task-environment-usage-grid,[^{]*\{[^}]*\}/);
    assert.ok(gridBlock && /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(gridBlock[0]), 'usage grid should be three equal columns');
    const thumbBlock = css.match(/\.manager-task-environment-usage-thumb,[^{]*\{[^}]*\}/);
    assert.ok(thumbBlock && /aspect-ratio:\s*1\s*\/\s*1/.test(thumbBlock[0]), 'usage thumbnails should be square');
  });
});
