import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const browserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringTasksBrowserView.svelte');
const langPath = resolve(repoRoot, 'lang/en.json');
const cssPath = resolve(repoRoot, 'styles/fabricate.css');

const browserSource = readFileSync(browserPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));
const css = readFileSync(cssPath, 'utf8');

describe('GatheringTasksBrowserView card-style row', () => {
  it('renders four column headers (Task / Tags / Status / Actions)', () => {
    const headBlockStart = browserSource.indexOf('manager-table-head manager-gathering-task-table-head');
    assert.ok(headBlockStart >= 0, 'head block should be present');
    const headBlockEnd = browserSource.indexOf('</div>', headBlockStart);
    const headBlock = browserSource.slice(headBlockStart, headBlockEnd);
    const headerMatches = headBlock.match(/role="columnheader"/g) || [];
    assert.equal(headerMatches.length, 4, 'expected four column headers');
    assert.ok(headBlock.includes('FABRICATE.Admin.Manager.Environment.Tasks.Tags'), 'Tags column header should be present');
    for (const removed of ['Drops', 'Environments', 'Availability']) {
      assert.equal(
        headBlock.includes(`FABRICATE.Admin.Manager.Environment.Tasks.${removed}`),
        false,
        `${removed} column header should not be present`
      );
    }
  });

  it('renders the tags chip area as its own grid cell with a data attribute hook', () => {
    assert.ok(browserSource.includes('manager-gathering-task-tags-cell'), 'tags live in a dedicated tags-cell container');
    assert.ok(browserSource.includes('data-gathering-task-tags'), 'tags cell exposes a data attribute for tests');
    assert.equal(browserSource.includes('manager-gathering-task-info-cell'), false, 'info-cell wrapper should be removed in this iteration');
    assert.equal(browserSource.includes('manager-gathering-task-tags-row'), false, 'tags-row class should be replaced by tags-cell');
  });

  it('renders all tag dimensions in a single chip row via rowChips', () => {
    assert.ok(browserSource.includes('regionChips(task)'), 'region chip helper should exist');
    assert.ok(browserSource.includes('biomeChips(task)'), 'biome chip helper should exist');
    assert.ok(browserSource.includes('timeChips(task)'), 'time chip helper should exist');
    assert.ok(browserSource.includes('weatherChips(task)'), 'weather chip helper should exist');
    assert.ok(browserSource.includes('rowChips(task)'), 'rowChips concatenates all dimensions');
    assert.ok(browserSource.includes('data-gathering-task-tags'), 'tags chip row exposes a data attribute');
    assert.ok(/manager-availability-pill is-\$\{chip\.kind\}/.test(browserSource), 'chips render with per-kind variant class');
    assert.equal(browserSource.includes("' is-any'"), false, 'unrestricted dimensions render no chip (no is-any placeholder)');
    assert.equal(/function\s+anyChip\s*\(/.test(browserSource), false, 'anyChip helper should be removed');
  });

  it('removes the obsolete drops count, env count, and availability helpers', () => {
    assert.equal(/function\s+activeEnvironmentCount\s*\(/.test(browserSource), false, 'activeEnvironmentCount helper should be removed');
    assert.equal(/function\s+dropSummary\s*\(/.test(browserSource), false, 'dropSummary helper should be removed');
    assert.equal(/function\s+availabilityLabels\s*\(/.test(browserSource), false, 'availabilityLabels helper should be removed');
    assert.equal(/function\s+availabilityChips\s*\(/.test(browserSource), false, 'availabilityChips helper should be replaced by timeChips/weatherChips');
  });

  it('keeps drop component name search by retaining dropReferenceText in the haystack', () => {
    const haystackMatch = browserSource.match(/const\s+haystack\s*=\s*`([^`]*)`/);
    assert.ok(haystackMatch, 'search haystack template literal should still exist');
    assert.ok(haystackMatch[1].includes('${dropReferenceText(task)}'), 'haystack should still include dropReferenceText so drop names are searchable');
    assert.equal(haystackMatch[1].includes('${dropSummary(task)}'), false, 'haystack should not include dropSummary');
  });

  it('exposes the Tags localization key', () => {
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Tasks.Tags,
      'Tags',
      'Tags key should be present for the new column header'
    );
  });

  it('uses a four-column grid for the task table', () => {
    const gridMatch = css.match(/--fab-mv2-gathering-task-grid:\s*([^;]+);/);
    assert.ok(gridMatch, 'task grid CSS variable should be defined');
    const columns = gridMatch[1].split(/\s+(?![^()]*\))/).filter(Boolean);
    assert.equal(columns.length, 4, 'expected four grid columns (identity, tags, status, actions)');
  });

  it('makes the tags cell a scrollable wrapping flex container', () => {
    const block = css.match(/\.manager-gathering-task-tags-cell\s*\{[^}]*\}/);
    assert.ok(block, 'tags cell rule should be defined');
    assert.ok(/display:\s*flex/.test(block[0]), 'tags cell must be a flex container so chips do not stack vertically');
    assert.ok(/flex-wrap:\s*wrap/.test(block[0]), 'tags cell must wrap so chips spill onto additional rows');
    assert.ok(/align-content:\s*flex-start/.test(block[0]), 'wrapped rows pin to the top');
    assert.ok(/overflow-y:\s*auto/.test(block[0]), 'tags cell must be scrollable so absurd tag counts do not expand the row');
    assert.ok(/[^-]height:\s*\d+px/.test(block[0]), 'tags cell must use a fixed height so all rows match');
  });

  it('vertically centers status and action cells while keeping identity top-aligned', () => {
    assert.ok(
      /\.manager-status-cell[\s\S]{0,160}align-self:\s*center/.test(css),
      'status cell should be vertically centered'
    );
    assert.ok(
      /\.manager-action-group[\s\S]{0,160}align-self:\s*center/.test(css),
      'action group should be vertically centered'
    );
    assert.ok(
      /\.manager-gathering-task-identity\s*\{[^}]*align-self:\s*center/.test(css),
      'identity column should be vertically centered in the row'
    );
  });

  it('sizes the gathering task thumbnail to 76px so it fills the row height', () => {
    const sizeBlock = css.match(/\.manager-gathering-tasks-table\s+\.manager-gathering-task-identity\s+\.manager-gathering-task-thumb\s*\{[^}]*\}/);
    assert.ok(sizeBlock, 'card-layout thumb override should be defined');
    assert.ok(/width:\s*76px/.test(sizeBlock[0]), 'thumb width should be 76px');
    assert.ok(/height:\s*76px/.test(sizeBlock[0]), 'thumb height should be 76px');
  });
});
