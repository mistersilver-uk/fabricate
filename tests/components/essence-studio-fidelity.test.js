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
const onCraftSource = read('src/ui/svelte/apps/manager/essences/EssenceOnCraftTab.svelte');
const segmentedControlSource = read('src/ui/svelte/apps/manager/SegmentedControl.svelte');
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
      /\.manager-essence-row\.is-card \.manager-essence-description \{[^}]*min-height: calc\(1\.4em \* 3\);/s.test(
        styleBlock(rowSource)
      ),
      'and the card reserves a fixed 3-line description box so every card is the same height regardless of content'
    );
    // Neither of the two above is SUFFICIENT, which is the whole lesson of the maintainer's
    // second round: both declarations were already in place while the published frame showed
    // one card 4px taller than its row siblings. What actually varied was Foundry's `<li>`
    // margin, which the last card is exempt from. The rendered proof is
    // `tests/components/essence-grid-card-height.test.js`, which measures the cards in
    // Chromium; this pins the declaration that test exists to protect, so deleting the rule
    // fails here with the reason attached rather than only there with a number.
    assert.ok(
      /\.fabricate-manager \.manager-essence-row\.is-card \{[^}]*margin: 0;/s.test(globalCss),
      'and the card zeroes the Foundry li margin that made its last member taller'
    );
  });

  // ── The five items from the maintainer's SECOND review round ────────────────────

  it('removes the colour-name chip everywhere it merely restated a tinted tile', () => {
    // The rendered symptom: "Lavender", "Sage", "Peach", "Aqua", "Butter" chips beside every
    // essence name in the row, the grid card and the inspector hero, plus a colour-name
    // sub-line in the live preview's identity block. The medallion beside each already
    // carries the colour, so the chip was a maintained display name per theme colour with
    // no reader — and in the inspector it wrapped the `In use` pill onto a second line.
    for (const [label, source] of [
      ['row/card', rowSource],
      ['inspector', inspectorSource],
      ['preview identity', previewSource],
    ]) {
      assert.equal(
        /managerColorTokenLabel/.test(source),
        false,
        `${label} must not resolve a colour display name`
      );
      assert.equal(
        source.includes('data-essence-colour='),
        false,
        `${label} must not render a colour chip`
      );
    }
    // The colour itself is NOT removed — only the word. The tile still carries it in both
    // presentations, which is what makes this a removal of duplication rather than of state.
    assert.ok(rowSource.includes('tint={essence.colorToken'), 'the row tile stays tinted');
    assert.ok(
      inspectorSource.includes("tint={essence.colorToken || ''}"),
      'and so does the inspector tile'
    );
    // The EDITOR's palette caption keeps its name, and that is a decision rather than an
    // oversight: there the name labels the swatch the GM is choosing, and the No-colour cell
    // has no tile to speak for it at all.
    assert.ok(
      identityTabSource.includes('managerColorTokenLabel(colorToken, localize)'),
      'the palette caption still names the selected swatch'
    );
  });

  it('truncates a grid card name rather than letting it re-size its row', () => {
    // The rendered symptom the maintainer named as the mechanism: "name should be truncated".
    // Equal-height-within-a-row does not cover this — an unclamped name wraps and every card
    // in the row grows WITH it, which still satisfies "all the same height".
    const styles = styleBlock(rowSource);
    assert.ok(
      /\.manager-essence-row\.is-card \.manager-system-name \{[^}]*white-space: nowrap;/s.test(
        styles
      ),
      'the card name is one line'
    );
    assert.ok(
      /\.manager-essence-row\.is-card \.manager-system-name \{[^}]*text-overflow: ellipsis;/s.test(
        styles
      ),
      'with an ellipsis'
    );
    assert.ok(
      /\.manager-essence-row\.is-card \.manager-system-name \{[^}]*min-width: 0;/s.test(styles),
      'and the min-width without which overflow never engages on a flex item'
    );
    // The full name stays reachable. Truncation that loses text is a defect, not a fix.
    assert.ok(rowSource.includes('title={essence.name}'), 'the whole name survives as a title');
    // LIST rows are untouched: a 76px row beside a clamped description has the width, and
    // truncating there would hide names the list can show.
    assert.equal(
      /\.manager-essence-row \.manager-system-name \{/.test(styles),
      false,
      'and the list row keeps its full name'
    );
  });

  it('renders every inspector action through the shared point-of-arrival button', () => {
    // The rendered symptom: chunky rail buttons at the app's inherited body size beside a
    // Tool Studio whose header buttons are 0.72rem, and a PRIMARY painted in the success
    // family — `Edit essence` was green where the design's primary, and the recipe and
    // component inspectors one click away, are the accent.
    assert.ok(
      inspectorSource.includes(
        "import InspectorActionButton from '../InspectorActionButton.svelte';"
      ),
      'the inspector imports the shared button'
    );
    assert.equal(
      /class="manager-button/.test(inspectorSource),
      false,
      'and hand-rolls no manager button of its own'
    );
    const primitive = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/InspectorActionButton.svelte'),
      'utf8'
    );
    const styles = styleBlock(primitive);
    assert.ok(
      /\.fab-inspector-action \{[^}]*font-size: 0\.72rem;/s.test(styles),
      'at the Tool Studio header label size, which is the treatment the maintainer named'
    );
    assert.ok(
      /\.fab-inspector-action\.is-primary \{[^}]*background: var\(--fab-accent\);/s.test(styles),
      'with the primary in the ACCENT family'
    );
    assert.ok(
      /\.fab-inspector-action\.is-danger \{[^}]*color: var\(--fab-danger-text\);/s.test(styles),
      'and the danger treatment preserved on delete'
    );
    // It must beat Foundry's host button geometry itself, because it is not `.manager-button`
    // and therefore inherits none of the manager's reset.
    for (const declaration of ['appearance: none;', 'height: auto;', 'font-family: inherit;']) {
      assert.ok(styles.includes(declaration), `the Foundry button reset states ${declaration}`);
    }
    // Its CSS is co-located, never in the global sheet: required-screenshot detection maps
    // file paths to views, and a global rule would widen every tweak to a theme-wide frame set.
    assert.equal(
      globalCss.includes('fab-inspector-action'),
      false,
      'the primitive owns its appearance in its own scoped block'
    );
  });

  it('gives the editor icon control a SQUARE tile its column is sized to', () => {
    // The rendered symptom (maintainer round 3): the round-2 `block` filled the column WIDTH
    // and kept `size` only as the height, so a widened column stretched the icon tile into a
    // rectangle. The icon must read as a square, with the column narrowed to that width so
    // the picker + reset row shrinks to fit beneath it.
    const medallionTag = identityTabSource.match(/<Medallion[^>]*\/>/)?.[0] ?? '';
    assert.ok(medallionTag, 'the identity tab renders a Medallion tile');
    assert.equal(
      /\bblock\b/.test(medallionTag),
      false,
      'the tile is a square (size sets both dims), not the block fill-width variant'
    );
    assert.ok(
      /size=\{124\}/.test(medallionTag) && /glyph=\{\d+\}/.test(medallionTag),
      'sized 124px square with a glyph scaled for the tile it now is'
    );
    assert.ok(
      /\.manager-essence-icon-panel \{[^}]*align-items: stretch;/s.test(
        styleBlock(identityTabSource)
      ),
      'so the picker + reset row beneath fills the tile width instead of sizing itself'
    );
    assert.ok(
      globalCss.includes(
        'grid-template-columns: var(--fab-mv2-essence-icon-column, 124px) minmax(0, 1fr);'
      ),
      'in a column narrowed to the square tile width so the controls sit under it'
    );
    // Unset must stay byte-identical, or this re-types ~40 medallions across the manager.
    const medallion = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/components/Medallion.svelte'),
      'utf8'
    );
    assert.ok(
      styleBlock(medallion).includes('font-size: var(--fab-medallion-glyph, 0.9rem);'),
      'the glyph size reads its token through a fallback, so an unset medallion is unchanged'
    );
  });

  it('renders a linked active-effect source the way the Tool Studio renders a linked Item', () => {
    // The rendered symptom, four ways: a raw-uuid sub-line, one square clear button where the
    // Tool Studio has a grouped pair, a duplicate `Drop or pick` zone under the linked card,
    // and a macro card whose title and sub-line were the same uuid.
    assert.ok(
      onCraftSource.includes('kind="essence-source"'),
      'the linked source is the shared ItemDropZone, as ToolOverviewTab is'
    );
    assert.equal(
      onCraftSource.includes('data-essence-source-clear'),
      false,
      'the hand-rolled single clear button is gone'
    );
    assert.equal(
      /class="manager-essence-source-summary"/.test(onCraftSource),
      false,
      'and so is the hand-rolled summary card it sat in'
    );
    // The second zone renders ONLY in the unlinked branch. An earlier round called the
    // duplicate "ItemDropZone's shipped behaviour"; the Tool Studio proves otherwise, so the
    // branch is what this pins.
    const linkedBranch = onCraftSource.indexOf('{#if sourceLinked}');
    const elseBranch = onCraftSource.indexOf('{:else}', linkedBranch);
    const zone = onCraftSource.indexOf('manager-essence-source-drop-zone');
    assert.ok(linkedBranch > 0 && elseBranch > linkedBranch, 'the source has two branches');
    assert.ok(zone > elseBranch, 'and the drop-or-pick zone renders only when nothing is linked');
    // `ItemDropZone` itself must not have been bent to do it — it has other consumers.
    assert.equal(
      readFileSync(
        resolve(repoRoot, 'src/ui/svelte/apps/manager/ItemDropZone.svelte'),
        'utf8'
      ).includes('essence-source'),
      false,
      'the primitive is used as shipped, never special-cased for this caller'
    );
    // And the macro card's sub-line is an instruction rather than its own title again.
    assert.equal(
      onCraftSource.includes('hint={macroUuid}'),
      false,
      'the macro card no longer repeats its uuid as its sub-line'
    );
    assert.ok(
      onCraftSource.includes("'FABRICATE.Admin.Manager.Essence.Macro.ReplaceHint'"),
      'it instructs instead'
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

  // ── The two defects the maintainer read off the published frames ────────────────

  it('compacts the presentation toggle to glyph tiles without losing its name', () => {
    // The rendered symptom: the prototype draws list/grid as two compact glyph tiles
    // (~86px for the pair); the shipped toggle spelled out "List" and "Grid" and measured
    // ~135px, which made a presentation switch shout as loudly as the status FILTER beside
    // it and pushed row one to the edge of the 1280px capture.
    const viewControl = browserSource.slice(browserSource.indexOf('options={viewModeOptions}'));
    assert.ok(
      /^[^/]*?\biconOnly\b/s.test(viewControl.slice(0, viewControl.indexOf('/>'))),
      'the view-mode segmented control opts into the compact variant'
    );
    // Opt-IN, so the status filter one line above must not have been swept along: "All /
    // Enabled / Disabled" is a vocabulary, not two glyphs, and it has no icons to fall back
    // on — an icon-only status filter would render three empty tiles.
    const statusControl = browserSource.slice(
      browserSource.indexOf('options={statusOptions}'),
      browserSource.indexOf('options={viewModeOptions}')
    );
    assert.equal(
      /\biconOnly\b/.test(statusControl),
      false,
      'the status filter keeps its words — its options are not glyphs'
    );

    // The label is CLIPPED, never removed. The `<label>` IS the radio's accessible name, so
    // `display: none` (or dropping the span) would leave every tile anonymous to a screen
    // reader — the defect this variant must not trade the width saving for.
    const segmentedStyles = styleBlock(segmentedControlSource);
    const clipRule = segmentedStyles.slice(
      segmentedStyles.indexOf('.manager-segmented.is-icon-only .manager-segment-label {')
    );
    const clipBlock = clipRule.slice(0, clipRule.indexOf('}'));
    assert.ok(clipBlock.length > 0, 'the icon-only variant must state how it hides the label');
    assert.ok(clipBlock.includes('clip-path: inset(50%);'), 'the label is clipped out of view');
    assert.equal(
      /display: none|visibility: hidden/.test(clipBlock),
      false,
      'and never removed from the accessibility tree'
    );
    assert.ok(
      /\.manager-segmented\.is-icon-only \.manager-segment \{[^}]*min-width: 32px;/s.test(
        segmentedStyles
      ),
      'the tile is sized as a square target, not left to hug a ~12px glyph'
    );
  });

  it('joins the essence row to the selected-row bar opt-out it now qualifies for', () => {
    // The rendered symptom: a 3px accent bar inset into the LEFT edge of a selected essence
    // row, biting into the 40px Medallion this redesign gave it — the exact defect the
    // recipe and component rows opted out of in issue 676, on a row that only acquired the
    // medallion here. On a GRID CARD it is not even the right axis.
    assert.ok(
      globalCss.includes(
        '.fabricate-manager .manager-recipe-row.is-selected,\n.fabricate-manager .manager-component-row.is-selected,\n.fabricate-manager .manager-essence-row.is-selected {\n  box-shadow: none;\n}'
      ),
      'the essence row joins the medallion-led rows that drop the inset bar'
    );
    // And the ticked-row treatment it was already asking for: `EssenceRow` writes
    // `class:is-bulk-selected`, and until now nothing in either sheet matched it, so a
    // ticked essence looked exactly like an unticked one in the one studio whose bulk panel
    // can delete what is ticked.
    assert.ok(
      rowSource.includes('class:is-bulk-selected={bulkSelected}'),
      'the row writes the ticked class'
    );
    assert.ok(
      globalCss.includes('.fabricate-manager .manager-essence-row.is-bulk-selected {'),
      'and the sheet now answers it'
    );
    assert.equal(
      styleBlock(rowSource).includes('.is-bulk-selected'),
      false,
      'the answer is the shared joined rule, never a per-studio copy scoped to the row'
    );
  });
});
