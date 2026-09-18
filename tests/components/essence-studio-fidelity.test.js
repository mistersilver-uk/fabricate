/** The GM Essence Studio's PROTOTYPE-FIDELITY contract (issue 1036). */
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
// The GRID card's anatomy and look now live in the shared studio-library primitive.
const cardSource = read('src/ui/svelte/apps/manager/library/LibraryCard.svelte');
const bulkPanelSource = read('src/ui/svelte/apps/manager/essences/EssenceBulkEditPanel.svelte');
// The delete CARD's anatomy and look now live in the shared bulk-delete primitive (issue
// 1132); the essence panel supplies the sentences and renders it. Assertions about the CARD
// read here, assertions about the panel's own axes still read `bulkPanelSource`. Same retarget
// as `LibraryCard` above, and for the same reason: Svelte scoping is per component, so the
// rule moved with the markup it styles and a pin left on the panel would assert on a selector
// that matches nothing.
const bulkDeleteCardSource = read('src/ui/svelte/apps/manager/BulkDeleteCard.svelte');
const identityTabSource = read('src/ui/svelte/apps/manager/essences/EssenceIdentityTab.svelte');
const inspectorSource = read('src/ui/svelte/apps/manager/essences/EssenceBrowserInspector.svelte');
const previewSource = read('src/ui/svelte/apps/manager/essences/EssenceBehaviorPreview.svelte');
const studioSource = read('src/ui/svelte/apps/manager/essences/essenceStudio.js');
const onCraftSource = read('src/ui/svelte/apps/manager/essences/EssenceOnCraftTab.svelte');
const segmentedControlSource = read('src/ui/svelte/components/SegmentedControl.svelte');
const globalCss = read('styles/fabricate.css');

// The scoped `<style>` block of a component.
function styleBlock(source) {
  const start = source.lastIndexOf('<style>');
  assert.ok(start >= 0, 'component should declare a scoped style block');
  return source.slice(start);
}

describe('essence studio prototype fidelity (issue 1036)', () => {
  it('sizes the INLINE colour palette instead of letting its container size it', () => {
    const styles = styleBlock(colourPopoverSource);

    // The rendered symptom: the palette took the width of whatever hosted it.
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

    // The POPOVER call sites are untouched.
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
    // The rendered symptom: `align-items: start` sized each card to its own copy.
    assert.ok(
      // `:global(...)` because the `<ul>` is rendered by `LibraryShelf` now.
      /:global\(\.manager-essences-table\.is-grid\) \{[^}]*align-items: stretch;/s.test(
        styleBlock(browserSource)
      ),
      'the grid stretches every card to its row'
    );
    assert.ok(
      /\.fab-library-card-description \{[^}]*min-height: calc\(1\.4em \* 2\);/s.test(
        styleBlock(cardSource)
      ),
      'and the card reserves a fixed 2-line description box so every card is the same height regardless of content'
    );
    // Neither of the two above is SUFFICIENT.
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
    // The colour itself is NOT removed.
    assert.ok(rowSource.includes('tint={essence.colorToken'), 'the row tile stays tinted');
    assert.ok(
      inspectorSource.includes("tint={essence.colorToken || ''}"),
      'and so does the inspector tile'
    );
  });

  it('drops the editor and bulk-panel colour-name caption too (later maintainer feedback)', () => {
    // The maintainer's follow-up round.
    for (const [label, source] of [
      ['editor identity caption', identityTabSource],
      ['bulk edit panel', bulkPanelSource],
    ]) {
      assert.equal(
        /managerColorTokenLabel/.test(source),
        false,
        `${label} must not resolve a colour display name`
      );
    }
    // The EDITOR's caption keeps the Authored/Unset sentence — it names no colour.
    assert.equal(
      /<strong>\s*\{colourName\}\s*<\/strong>/.test(identityTabSource),
      false,
      'the editor no longer renders a colour-name element in the caption'
    );
    assert.ok(
      identityTabSource.includes("'FABRICATE.Admin.Manager.Essence.Colour.Authored'") &&
        identityTabSource.includes("'FABRICATE.Admin.Manager.Essence.Colour.Unset'"),
      'the Authored/Unset explanatory sentence survives, since it names no colour'
    );
    // The No-colour vocabulary key stays too — it is the inline palette's `noneLabel`.
    assert.ok(
      identityTabSource.includes("'FABRICATE.Admin.Manager.Essence.Colour.None'"),
      'the palette keeps its no-colour cell label'
    );
  });

  it('truncates a grid card name rather than letting it re-size its row', () => {
    // The rendered symptom the maintainer named as the mechanism: "name should be truncated".
    const styles = styleBlock(cardSource);
    assert.ok(
      /\.fab-library-card-name \{[^}]*white-space: nowrap;/s.test(styles),
      'the card name is one line'
    );
    assert.ok(
      /\.fab-library-card-name \{[^}]*text-overflow: ellipsis;/s.test(styles),
      'with an ellipsis'
    );
    assert.ok(
      /\.fab-library-card-name \{[^}]*min-width: 0;/s.test(styles),
      'and the min-width without which overflow never engages on a flex item'
    );
    // The full name stays reachable. Truncation that loses text is a defect, not a fix.
    assert.ok(
      rowSource.includes('nameTitle={essence.name}'),
      'the whole name survives as a title'
    );
    // LIST rows are untouched: a 76px row beside a clamped description has the width.
    assert.equal(
      /\.manager-system-name \{/.test(styleBlock(rowSource)),
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
    // TOKEN-AWARE, not a prefix (issue 1502). The family is rooted at the class the primitive
    // emits, so a hand-rolled site now spells `class="fabricate-button manager-button …"` — and
    // `class="manager-button` no longer matches it. The probe would have gone quietly blind at
    // exactly the moment the spelling it guards against changed, which is the failure mode this
    // whole family of guards exists to prevent. Bounded to one `<tag …>` span so that a message
    // literal or a JS string mentioning the class cannot pose as fixture markup: this file holds
    // a `'<BulkEditSection'` string whose unterminated attribute run would otherwise swallow the
    // prose below it.
    const handRolled = [...inspectorSource.matchAll(/<[a-zA-Z][\w-]*\b[^<>]*>/g)]
      .flatMap((tag) => [...tag[0].matchAll(/class="([^"]*)"/g)].map(([, value]) => value))
      .filter((value) => value.split(/\s+/).includes('manager-button'));
    assert.deepEqual(handRolled, [], 'and hand-rolls no manager button of its own');
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
    // THE TWO UNFILLED TONES STAY UNFILLED (issue 1372, maintainer parity round 6).
    for (const [selector, pattern] of [
      ['neutral', /\.fab-inspector-action \{[^}]*background: transparent;/s],
      ['danger', /\.fab-inspector-action\.is-danger \{[^}]*background: transparent;/s],
    ]) {
      assert.ok(
        pattern.test(styles),
        `the ${selector} tone must sit ON the pane, not a rung above it — an unfilled button ` +
          'bounded by --fab-border is what the rail and the prototype both already use'
      );
    }
    // It must beat Foundry's host button geometry itself.
    for (const declaration of ['appearance: none;', 'height: auto;', 'font-family: inherit;']) {
      assert.ok(styles.includes(declaration), `the Foundry button reset states ${declaration}`);
    }
    // Its CSS is co-located, never in the global sheet.
    assert.equal(
      globalCss.includes('fab-inspector-action'),
      false,
      'the primitive owns its appearance in its own scoped block'
    );
  });

  it('matches the bulk-delete armed danger button to the inspector-action label size', () => {
    // The rendered symptom (maintainer feedback).
    const styles = styleBlock(bulkDeleteCardSource);
    assert.ok(
      /:global\(\.manager-inspector-card\.fab-bulk-delete-card \.manager-button\) \{[^}]*font-size: 0\.72rem;/s.test(
        styles
      ),
      'the delete card scopes its button to the shared inspector-action label size'
    );
    // Scoped to the delete card only.
    assert.equal(
      styles.includes('.manager-button.is-danger'),
      false,
      'the colour treatment is not re-declared here, only the type scale'
    );
    // The impact list's treatment moved with it, and it is the other half of the same frame:
    assert.ok(
      /\.fab-bulk-delete-impact \{[^}]*padding-left: var\(--fab-space-4\);/s.test(styles),
      'and the impact list keeps its indent'
    );
    assert.ok(
      /\.fab-bulk-delete-impact \{[^}]*color: var\(--fab-text-secondary\);[^}]*font-weight: 600;/s.test(
        styles
      ),
      'its secondary colour and its heavier face'
    );
    // The panel must NOT still be declaring them.
    assert.equal(
      /manager-essence-bulk-(?:delete|impact)/.test(styleBlock(bulkPanelSource)),
      false,
      'and the panel no longer declares a rule for markup it no longer renders'
    );
  });

  it('gives the editor icon control a SQUARE tile its column is sized to', () => {
    // The rendered symptom (maintainer round 3).
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
        'grid-template-columns: 124px minmax(0, 1fr);'
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
    // The rendered symptom, four ways: a raw-uuid sub-line.
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
        resolve(repoRoot, 'src/ui/svelte/components/ItemDropZone.svelte'),
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
    // The rendered symptom: three stacked FULL-WIDTH elements per axis — a sub-hint.
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
    // This used to pin the ABSENCE of `class="manager-button" data-essence-bulk-`.
    for (const hook of ['data-essence-bulk-icon-reset', 'data-essence-bulk-colour-reset']) {
      const start = bulkPanelSource.lastIndexOf('<', bulkPanelSource.indexOf(hook));
      // The tag ends at the first `>` that is not the tail of an `=>`.
      let end = start;
      do {
        end = bulkPanelSource.indexOf('>', end + 1);
      } while (end > 0 && bulkPanelSource[end - 1] === '=');
      const tag = bulkPanelSource.slice(start, end + 1);
      assert.ok(tag.includes(hook), `${hook} should sit in one opening tag`);
      assert.equal(
        /\bis-full-width\b|\bfullWidth\b/.test(tag),
        false,
        `${hook} must not be full width — it is a trailing chip on the label row, not a ` +
          'second stacked button under the control'
      );
      assert.equal(
        /\bmanager-button\b/.test(tag),
        false,
        `${hook} must not be a manager button at all; it is a Chip`
      );
    }
  });

  it('composes the editor icon control as a picker row under a tile whose own reset overlays it', () => {
    // The rendered symptom, round 1: a full-width picker trigger that reads as a bare
    // dropdown, with a second full-width `Clear icon` button stacked under it. Round 2
    // (this maintainer round): even the icon-only reset beside the picker was a second
    // control — the prototype has a tile and ONE affordance, so the reset now overlays the
    // tile itself rather than sharing the row below it with the picker.
    const identityStyles = styleBlock(identityTabSource);
    assert.ok(
      /<div class="manager-essence-icon-tile">/.test(identityTabSource),
      'the tile is wrapped so the closed-leaf Medallion has something to overlay'
    );
    assert.ok(
      /\.manager-essence-icon-tile \{[^}]*position: relative;/s.test(identityStyles),
      'the tile wrapper is the positioning context for the overlay'
    );
    assert.ok(
      // The reset became an `<IconButton>` at issue 1422.
      /<IconButton\s+class="manager-essence-icon-reset"\s+data-essence-icon-reset=""/.test(
        identityTabSource
      ),
      'the reset is still the icon-only control, now rendered inside the tile wrapper'
    );
    // The reset must render BEFORE the actions row closes, i.e. inside the tile.
    const tileOpen = identityTabSource.indexOf('<div class="manager-essence-icon-tile">');
    const resetHook = identityTabSource.indexOf('data-essence-icon-reset');
    const actionsOpen = identityTabSource.indexOf('<div class="manager-essence-icon-actions">');
    assert.ok(
      tileOpen >= 0 && resetHook > tileOpen && resetHook < actionsOpen,
      'the reset sits inside the tile wrapper, ahead of the separate actions row'
    );
    assert.ok(
      identityTabSource.includes("ariaLabel={text('FABRICATE.Admin.Manager.Essence.ClearIcon'"),
      'and its label survives as the accessible name'
    );
    // Hidden by default, and revealed by hover AND by keyboard focus independently.
    assert.ok(
      /\.manager-essence-icon-tile :global\(\.manager-essence-icon-reset\) \{[^}]*opacity: 0;/s.test(
        identityStyles
      ),
      'the overlay starts hidden'
    );
    assert.ok(
      /\.manager-essence-icon-tile:hover :global\(\.manager-essence-icon-reset\),\s*\n\s*\.manager-essence-icon-tile :global\(\.manager-essence-icon-reset:focus-visible\) \{[^}]*opacity: 1;/s.test(
        identityStyles
      ),
      'and reveals on tile hover or button focus-visible, independent of pointer'
    );
    // The hidden state must hide with `pointer-events`.
    assert.ok(
      /\.manager-essence-icon-tile :global\(\.manager-essence-icon-reset\) \{[^}]*pointer-events: none;/s.test(
        identityStyles
      ),
      'the hidden overlay uses pointer-events so it stays keyboard-focusable'
    );
    assert.equal(
      /\.manager-essence-icon-tile \.manager-essence-icon-reset \{[^}]*visibility: hidden;/s.test(
        identityStyles
      ),
      false,
      'visibility: hidden would strand a keyboard user — the button could never be focused to reveal it'
    );
    // The actions row is left with the picker alone.
    const actionsClose = identityTabSource.indexOf('</div>', actionsOpen);
    const actionsBody = identityTabSource.slice(actionsOpen, actionsClose);
    assert.ok(actionsOpen > 0 && actionsClose > actionsOpen, 'the actions row is found intact');
    assert.equal(
      actionsBody.includes('manager-icon-button'),
      false,
      'no manager-icon-button remains beside the picker in the actions row'
    );
    assert.ok(
      /\.fabricate-manager \.manager-essence-icon-actions \{[^}]*display: flex;/s.test(globalCss),
      'the actions row under the tile lays out the picker, still as a row'
    );
  });

  it('puts the inspector primary action above its reference cards', () => {
    // The rendered symptom: `Edit essence` — the loudest control the rail has.
    const actions = inspectorSource.indexOf('data-essence-section="actions"');
    const source = inspectorSource.indexOf('data-essence-section="source"');
    const usage = inspectorSource.indexOf('data-essence-section="usage"');
    const onCraft = inspectorSource.indexOf('data-essence-section="oncraft"');
    assert.ok(onCraft > 0 && actions > onCraft, 'the actions follow the behaviour summary');
    assert.ok(actions < source, 'and precede the source card');
    assert.ok(actions < usage, 'and the usage card');
  });

  it('titles the behaviour list once, and offers no prop with which to title it twice', () => {
    // The rendered symptom this began as.
    for (const prop of ['showEffectiveKicker', 'showIdentity', 'showLiveNote']) {
      assert.ok(
        // `\\s`, not `\s`: this is a TEMPLATE LITERAL.
        !new RegExp(`${prop}\\s*=`).test(previewSource),
        `${prop} is declared with no call site that passes it`
      );
    }
    assert.ok(
      previewSource.includes("'FABRICATE.Admin.Manager.Essence.Preview.Effective'"),
      'NON-VACUITY: the kicker the prop used to gate is still rendered, unconditionally'
    );
  });

  it('gives the inspector ON CRAFT section the system name and the layer per card', () => {
    // ── B2 (issue 1372, maintainer parity round 8) ──────────────────────────────────────────
    // The reference titles this section `ON CRAFT IN <system>` and each card after the VALUE
    // that section resolves to, with `· overridden here` or `· world default` under it
    // (`tmp/proto/essence-rules.png`). The shipped section was titled `On craft` and rendered
    // the generic behaviour preview with no provenance at all, on the one screen whose whole
    // subject is inherit-versus-override.
    assert.ok(
      !inspectorSource.includes('<EssenceBehaviorPreview'),
      'the inspector no longer answers a different question with the preview component'
    );
    assert.ok(
      inspectorSource.includes('projectEssenceOnCraftCards'),
      'it projects the resolved-rule cards instead'
    );
    assert.ok(
      inspectorSource.includes("'FABRICATE.Admin.Manager.Essence.OnCraftIn'"),
      'and its heading names the system'
    );
    // The PROVENANCE half, at the projection.
    assert.ok(
      studioSource.includes('SuffixOverridden') && studioSource.includes('SuffixWorldDefault'),
      'the projection reads the same two suffix keys the row summary and the editor already use'
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
    // Opt-IN, so the status filter one line above must not have been swept along.
    const statusControl = browserSource.slice(
      browserSource.indexOf('options={statusOptions}'),
      browserSource.indexOf('options={viewModeOptions}')
    );
    assert.equal(
      /\biconOnly\b/.test(statusControl),
      false,
      'the status filter keeps its words — its options are not glyphs'
    );

    // The label is CLIPPED, never removed. The `<label>` IS the radio's accessible name.
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
    // And the ticked-row treatment it was already asking for.
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

  it('left-aligns the grid card body instead of inheriting the shared centred identity', () => {
    // The rendered symptom: the shared `.manager-essence-identity` reset (styles/fabricate.css)
    // is a grid with `align-items: center`, and the card's own rule only reflows it into a
    // flex COLUMN without stating `align-items`, so the centred cross-axis value survives the
    // reflow and centres the name, description and usage counts. The prototype (and the
    // maintainer) want them flush left.
    assert.ok(
      /\.fab-library-card-body \{[^}]*align-items: stretch;/s.test(styleBlock(cardSource)),
      'the card identity stretches its children to the card width so their left-aligned content is not centred'
    );
    // And it must WIN against the shared identity reset.
    assert.ok(
      /\.fabricate-manager \.fab-library-card-body \{[^}]*flex-direction: column;/s.test(globalCss),
      'the shared sheet re-stacks the card body over the identity reset'
    );
    // The LIST row must stay untouched — it keeps the shared grid's centred cross-axis.
    assert.equal(
      /\.manager-essence-identity \{[^}]*align-items:/s.test(styleBlock(rowSource)),
      false,
      'the list row identity is not given its own align-items override'
    );
  });
});
