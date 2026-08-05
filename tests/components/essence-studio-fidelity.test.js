/**
 * The GM Essence Studio's PROTOTYPE-FIDELITY contract (issue 1036).
 *
 * Every assertion here exists because the defect it pins shipped, was reviewed, and was
 * not caught — the Stage C review compared SOURCE to the prototype PNGs and could render
 * nothing, and none of these defects is visible in source unless you already know to look
 * for it. They are all geometry or composition, which is exactly what a source read is
 * blind to and what happy-dom cannot compute either: it has no cascade, so a mounted test
 * sees the markup and never the size.
 *
 * So these are SOURCE assertions on purpose, and each one names the rendered symptom it
 * stands for. The rendered proof is the re-captured frame; this file is what stops the
 * frame silently regressing between captures.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const read = (relative) => readFileSync(resolve(repoRoot, relative), 'utf8');

const colourPopoverSource = read('src/ui/svelte/components/ManagerColorPopover.svelte');
const browserSource = read('src/ui/svelte/apps/manager/EssenceBrowserView.svelte');
const rowSource = read('src/ui/svelte/apps/manager/essences/EssenceRow.svelte');
const bulkPanelSource = read('src/ui/svelte/apps/manager/essences/EssenceBulkEditPanel.svelte');
const identityTabSource = read('src/ui/svelte/apps/manager/essences/EssenceIdentityTab.svelte');
const inspectorSource = read('src/ui/svelte/apps/manager/essences/EssenceBrowserInspector.svelte');
const previewSource = read('src/ui/svelte/apps/manager/essences/EssenceBehaviorPreview.svelte');
const globalCss = read('styles/fabricate.css');

// The scoped `<style>` block of a component, so an assertion about its CSS cannot be
// satisfied by a class name mentioned in its markup or in a comment above it.
function styleBlock(source) {
  const start = source.lastIndexOf('<style>');
  assert.ok(start >= 0, 'component should declare a scoped style block');
  return source.slice(start);
}

describe('essence studio prototype fidelity (issue 1036)', () => {
  it('sizes the INLINE colour palette instead of letting its container size it', () => {
    const styles = styleBlock(colourPopoverSource);

    // The rendered symptom: the palette took the width of whatever hosted it, and the
    // global cell is `aspect-ratio: 1`. In the editor's main column that made ten ~165px
    // SQUARES — taller than every other control on the tab combined — and ~62px squares in
    // the bulk rail. The prototype draws compact rounded rectangles roughly one control
    // high.
    assert.ok(
      styles.includes('.manager-color-picker-popover.is-inline .manager-color-preset {'),
      'the inline palette must size its own cell'
    );
    assert.ok(
      /\.manager-color-picker-popover\.is-inline \.manager-color-preset \{[^}]*aspect-ratio: auto;/s.test(
        styles
      ),
      'and release the square constraint that made the cell as tall as the column is wide'
    );
    assert.ok(
      /\.manager-color-picker-popover\.is-inline \.manager-color-preset \{[^}]*height: 28px;/s.test(
        styles
      ),
      'at a fixed swatch height rather than a derived one'
    );
    assert.ok(
      /\.manager-color-picker-popover\.is-inline \.manager-color-preset-grid \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(44px, 1fr\)\);/s.test(
        styles
      ),
      'over auto-fit tracks, which is one row in the editor and two in the rail'
    );

    // The POPOVER call sites are untouched: their 220px width already made the shared
    // square a ~46px cell, and three surfaces outside this studio render them.
    assert.ok(
      globalCss.includes('grid-template-columns: repeat(4, 1fr);'),
      'the popover keeps the shipped four-column grid'
    );
  });

  it('does not re-derive the shared filter bar in the browser view scoped block', () => {
    const styles = styleBlock(browserSource);

    // The rendered symptom: `BulkSelectionToolbar` renders `<div class="{rowClass}
    // is-selection">` in ITS OWN template, so a scoped rule here never reached it. The
    // selection row shipped with no `display: flex`, no `width: 100%` and no hairline — it
    // floated centred in the panel with `Clear`'s `margin-left: auto` inert.
    for (const selector of [
      '.manager-essence-toolbar {',
      '.manager-essence-filter-row {',
      '.manager-essence-filter-field {',
      '.manager-essence-filter-label {',
    ]) {
      assert.equal(
        styles.includes(selector),
        false,
        `${selector} must be authored where the shared primitive can see it, not scoped here`
      );
    }
    assert.ok(
      globalCss.includes('.fabricate-manager .manager-essence-filter-row {'),
      'the row class the shared toolbar wears is authored in the global sheet'
    );
    assert.equal(
      (globalCss.match(/\.fabricate-manager \.manager-essence-toolbar select \{/g) || []).length,
      2,
      'and so is the select treatment (the shared control font, and the Fabricate select chrome)'
    );
  });

  it('keeps the grid presentation a level shelf rather than a ragged one', () => {
    // The rendered symptom: `align-items: start` sized each card to its own copy, so a row
    // of four ran four different heights with four footers at four different baselines.
    assert.ok(
      /\.manager-essences-table\.is-grid \{[^}]*align-items: stretch;/s.test(
        styleBlock(browserSource)
      ),
      'the grid stretches every card to its row'
    );
    assert.ok(
      /\.manager-essence-row\.is-card \.manager-essence-cluster \{[^}]*margin-top: auto;/s.test(
        styleBlock(rowSource)
      ),
      'and the card pushes its footer to the bottom of the height it was given'
    );
  });

  it('stages each bulk axis as one control with its reset on the section label row', () => {
    // The rendered symptom: three stacked FULL-WIDTH elements per axis — a sub-hint, the
    // control, and a second full-width `Leave unchanged` button under it — where the
    // prototype draws one compact row. `BulkEditSection.trailing` is the shipped slot for a
    // staged-axis control and the Component Studio already uses it for the same meaning.
    assert.ok(
      bulkPanelSource.includes('data-essence-bulk-icon-reset'),
      'the icon axis keeps its reset'
    );
    assert.ok(
      bulkPanelSource.includes('data-essence-bulk-colour-reset'),
      'and so does the colour axis'
    );
    for (const hook of ['data-essence-bulk-icon-reset', 'data-essence-bulk-colour-reset']) {
      const index = bulkPanelSource.indexOf(hook);
      const enclosingSnippet = bulkPanelSource.lastIndexOf('{#snippet trailing()}', index);
      const enclosingSection = bulkPanelSource.lastIndexOf('<BulkEditSection', index);
      assert.ok(
        enclosingSnippet > enclosingSection && enclosingSection >= 0,
        `${hook} must render in its section's trailing slot, not as a full-width button below it`
      );
    }
    assert.equal(
      /class="manager-button"\s+data-essence-bulk-/.test(bulkPanelSource),
      false,
      'neither reset is a full-width manager button any more'
    );
  });

  it('composes the editor icon control as one row', () => {
    // The rendered symptom: a full-width picker trigger that reads as a bare dropdown, with
    // a second full-width `Clear icon` button stacked under it. The prototype has a tile
    // and one affordance.
    assert.ok(
      /class="manager-icon-button"\s+data-essence-icon-reset/.test(identityTabSource),
      'the icon reset is an icon-only control beside the picker'
    );
    assert.ok(
      identityTabSource.includes("aria-label={text('FABRICATE.Admin.Manager.Essence.ClearIcon'"),
      'and its label survives as the accessible name'
    );
    assert.ok(
      /\.fabricate-manager \.manager-essence-icon-actions \{[^}]*display: flex;/s.test(globalCss),
      'the actions under the tile are a row, not a stack of full-width buttons'
    );
  });

  it('puts the inspector primary action above its reference cards', () => {
    // The rendered symptom: `Edit essence` — the loudest control the rail has — sat after
    // `Source` and `Usage` and fell past the fold at every captured window size.
    const actions = inspectorSource.indexOf('data-essence-section="actions"');
    const source = inspectorSource.indexOf('data-essence-section="source"');
    const usage = inspectorSource.indexOf('data-essence-section="usage"');
    const onCraft = inspectorSource.indexOf('data-essence-section="oncraft"');
    assert.ok(onCraft > 0 && actions > onCraft, 'the actions follow the behaviour summary');
    assert.ok(actions < source, 'and precede the source card');
    assert.ok(actions < usage, 'and the usage card');
  });

  it('titles the inspector behaviour list once', () => {
    // The rendered symptom: an `On craft` card heading with an `Effective behaviour` kicker
    // immediately under it, for one list of three rows — the prototype's single `ON CRAFT`
    // kicker drawn twice.
    assert.ok(
      previewSource.includes('showEffectiveKicker = true'),
      'the preview can suppress its own kicker'
    );
    assert.ok(
      /\{#if showEffectiveKicker\}/.test(previewSource),
      'and actually gates it rather than declaring an unused prop'
    );
    assert.ok(
      inspectorSource.includes('showEffectiveKicker={false}'),
      'and the inspector, whose card already carries the heading, suppresses it'
    );
  });
});
