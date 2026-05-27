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
  it('renders exactly three column headers (Task / Status / Actions) with chips inside the task column', () => {
    const headBlockStart = browserSource.indexOf('manager-table-head manager-gathering-task-table-head');
    assert.ok(headBlockStart >= 0, 'head block should be present');
    const headBlockEnd = browserSource.indexOf('</div>', headBlockStart);
    const headBlock = browserSource.slice(headBlockStart, headBlockEnd);
    const headerMatches = headBlock.match(/role="columnheader"/g) || [];
    assert.equal(headerMatches.length, 3, 'expected three column headers');
    for (const removed of ['Drops', 'Environments', 'Tags', 'Availability']) {
      assert.equal(
        headBlock.includes(`FABRICATE.Admin.Manager.Environment.Tasks.${removed}`),
        false,
        `${removed} column header should not be present`
      );
    }
  });

  it('wraps the identity button and tags row in a single info cell so chips share the identity column width', () => {
    assert.ok(browserSource.includes('manager-gathering-task-info-cell'), 'row should use an info-cell wrapper');
    assert.ok(browserSource.includes('manager-gathering-task-tags-row'), 'tags live in a dedicated tags-row container');
    assert.ok(browserSource.includes('data-gathering-task-tags'), 'tags row exposes a data attribute for tests');
  });

  it('renders all tag dimensions in a single chip row via rowChips', () => {
    assert.ok(browserSource.includes('regionChips(task)'), 'region chip helper should exist');
    assert.ok(browserSource.includes('biomeChips(task)'), 'biome chip helper should exist');
    assert.ok(browserSource.includes('timeChips(task)'), 'time chip helper should exist');
    assert.ok(browserSource.includes('weatherChips(task)'), 'weather chip helper should exist');
    assert.ok(browserSource.includes('rowChips(task)'), 'rowChips concatenates all dimensions');
    assert.ok(browserSource.includes('data-gathering-task-tags'), 'tags chip row exposes a data attribute');
    assert.ok(/manager-availability-pill is-\$\{chip\.kind\}/.test(browserSource), 'chips render with per-kind variant class');
    assert.ok(browserSource.includes("' is-any'"), 'rowChips placeholders carry an isAny flag rendered as is-any');
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

  it('uses a three-column grid for the task table', () => {
    const gridMatch = css.match(/--fab-mv2-gathering-task-grid:\s*([^;]+);/);
    assert.ok(gridMatch, 'task grid CSS variable should be defined');
    const columns = gridMatch[1].split(/\s+(?![^()]*\))/).filter(Boolean);
    assert.equal(columns.length, 3, 'expected three grid columns (info, status, actions)');
  });

  it('makes the tags row itself a wrapping flex container so chips flow horizontally', () => {
    const block = css.match(/\.manager-gathering-task-tags-row\s*\{[^}]*\}/);
    assert.ok(block, 'tags row rule should be defined');
    assert.ok(/display:\s*flex/.test(block[0]), 'tags row must be a flex container so chips do not stack vertically');
    assert.ok(/flex-wrap:\s*wrap/.test(block[0]), 'tags row must wrap so chips spill onto additional rows');
    assert.ok(/align-content:\s*flex-start/.test(block[0]), 'tags row wrapped rows should pin to the top');
  });

  it('grows the gathering task thumbnail to 64px for the card layout', () => {
    const sizeBlock = css.match(/\.manager-gathering-tasks-table\s+\.manager-gathering-task-identity\s+\.manager-gathering-task-thumb\s*\{[^}]*\}/);
    assert.ok(sizeBlock, 'card-layout thumb override should be defined');
    assert.ok(/width:\s*64px/.test(sizeBlock[0]), 'thumb width should be 64px');
    assert.ok(/height:\s*64px/.test(sizeBlock[0]), 'thumb height should be 64px');
  });
});
