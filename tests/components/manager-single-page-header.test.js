/**
 * ONE PAGE HEADER PER MANAGER ROUTE (issue 1515).
 *   4. Each slice must still reach real manager markup — at least one `class="manager-*"` — so a
 *      slice that landed past the end of the template, or on a file whose classes were renamed
 *      wholesale, is reported rather than passing on an absence of markup.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const managerDir = 'src/ui/svelte/apps/manager';

/**
 * The six views, each with the route it draws and what its deleted header used to say. They are
 * named individually rather than globbed because the claim is about these six screens: a glob
 * would quietly widen to every future view, and quietly narrow to none the day its pattern broke.
 */
const VIEWS = [
  {
    file: 'SystemsBrowserView.svelte',
    route: 'systems',
    was: 'Browse / System library / Select a row to view counts and enabled features.',
  },
  {
    file: 'AccessTabView.svelte',
    route: 'access',
    was: 'the system name / Recipe access / the grant sentence',
  },
  {
    file: 'CraftingSettingsView.svelte',
    route: 'crafting-settings',
    was: 'the system name / Crafting settings / Control how players get access ...',
  },
  {
    file: 'EnvironmentsBrowserView.svelte',
    route: 'environments, and world (Parties)',
    was: 'a per-tab kicker, title and hint computed by two helpers in the view',
  },
  {
    file: 'SystemEditView.svelte',
    route: 'system-edit, settings tab',
    was: 'the system name / Edit base settings / the admin-store persistence sentence',
  },
  {
    file: 'SystemOverviewView.svelte',
    route: 'system-edit, validation tab',
    was: 'System overview / Validation overview / the review-every-issue sentence',
  },
];

const readView = (file) => readFileSync(resolve(repoRoot, managerDir, file), 'utf8');

describe('one page header per manager route', () => {
  it('renders no second page header in any of the six views that used to draw one', () => {
    const scanned = [];

    for (const { file, route, was } of VIEWS) {
      const source = readView(file);
      scanned.push(file);

      // Anchored on the tag NAME, not on `<main class="manager-main`: three of these views write
      // their attributes one per line, so the class is not on the opening tag's own line.
      const mainIndex = source.search(/<main\b/);
      assert.notEqual(mainIndex, -1, `${file} should still render a <main> element`);
      assert.ok(
        /<main\b[^<]*class="manager-main[\s"]/.test(source),
        `${file} should still render its content region as .manager-main`
      );

      const main = source.slice(mainIndex);
      assert.ok(main.length > 0, `${file} produced an empty <main> slice; the read is broken`);

      assert.equal(
        main.includes('manager-section-header'),
        false,
        `${file} draws a second page header on the ${route} route. The shell already renders the ` +
          `breadcrumb, eyebrow, title and lede for it; this one used to say "${was}". The copy ` +
          'that survives belongs in viewKicker/viewTitle/viewSubtitle in ' +
          'CraftingSystemManagerRoot.svelte rather than restated here.'
      );
      assert.equal(
        source.includes('manager-section-header'),
        false,
        `${file} writes manager-section-header outside its <main>, which the slice above cannot ` +
          'see. A page header is a page header wherever it is nested.'
      );

      // The slice has to land on markup for its absence claim to mean anything. These views no
      // longer write `manager-title` or `manager-subtitle` at all — that is the point of the
      // change — so the floor is the class PREFIX the whole module is written in.
      assert.match(
        main,
        /class="manager-[a-z-]/,
        `${file} renders no manager-prefixed class inside its <main>, so either the slice landed ` +
          'past the template or the module vocabulary was renamed under this gate'
      );
    }

    assert.ok(
      scanned.length >= VIEWS.length && scanned.length >= 6,
      `the gate scanned ${scanned.length} views; it is written against six, and an emptied or ` +
        'shortened list would make every assertion above vacuous'
    );
  });

  it('leaves no rule for the deleted class in the shared sheet', () => {
    // Comments are stripped first: the sheet's own history notes name the class by name.
    const sheet = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
    const rules = sheet.replace(/\/\*[\s\S]*?\*\//g, '');

    assert.ok(rules.length > 0, 'the comment strip emptied the sheet; the read is broken');
    assert.ok(
      rules.includes('.manager-kicker'),
      'the stripped sheet still holds manager class rules, or the absence below is vacuous'
    );
    assert.equal(
      rules.includes('manager-section-header'),
      false,
      'styles/fabricate.css still declares the deleted second-header class, so the next view to ' +
        'write it would be painted rather than left visibly wrong'
    );
  });
});
