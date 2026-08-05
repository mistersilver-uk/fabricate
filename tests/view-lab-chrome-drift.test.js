/**
 * The View Lab's frame builder is a TRANSCRIPTION of Foundry's `_renderFrame` / `_updateFrame` /
 * `#applyPosition`. A transcription is only as good as its last read of the source, and Foundry
 * upgrades on its own schedule — so this test re-reads the harvested `application.mjs` and fails
 * when the thing it was copied from has moved.
 *
 * The primary check is a digest comparison against the committed provenance record. That is
 * deliberately blunt: ANY change to Foundry's application module goes red, and the fix is to
 * re-harvest with `--write-provenance` and have a human read the diff. A structural check that
 * tried to be clever about which changes matter would quietly pass the one that mattered.
 *
 * The secondary checks are diagnostics. When the digest goes red they say WHAT moved, so the
 * failure is actionable instead of just alarming.
 *
 * SKIP POLICY. This test skips when no chrome has been harvested, because `npm test` must stay
 * runnable for anyone without a Foundry licence — that is most of the point of the main suite.
 * Two things compensate: the skip prints the command that would make it run, and setting
 * `VIEWLAB_REQUIRE_CHROME=1` turns the skip into a failure for a machine that is supposed to have
 * the cache. The provenance record itself is asserted unconditionally, so the metadata half of the
 * contract is gated everywhere.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { readProvenance, resolveChromeCache } from '../scripts/lib/foundryChromeCache.js';
import {
  APP_CHROME,
  FOUNDRY_CHROME_SPEC,
  FOUNDRY_DIALOG_SPEC,
  confirmDialogButtons,
  promptDialogButtons,
  frameClassesFor,
  resolveDialogChrome,
} from '../scripts/lib/foundryChromeSpec.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLICATION_MJS = 'client/applications/api/application.mjs';
const DIALOG_MJS = 'client/applications/api/dialog.mjs';
const HARVEST_HINT = 'run: npm run viewlab:chrome:harvest';

const cache = resolveChromeCache(ROOT);
const applicationPath = cache ? join(cache.dir, APPLICATION_MJS) : null;
const dialogPath = cache ? join(cache.dir, DIALOG_MJS) : null;
const haveSource = Boolean(applicationPath && existsSync(applicationPath));
const haveDialogSource = Boolean(dialogPath && existsSync(dialogPath));
const required = process.env.VIEWLAB_REQUIRE_CHROME === '1';

if (!haveSource && required) {
  test('harvested Foundry chrome is present (VIEWLAB_REQUIRE_CHROME=1)', () => {
    assert.fail(`no harvested chrome under .foundry-chrome/, but VIEWLAB_REQUIRE_CHROME=1; ${HARVEST_HINT}`);
  });
}

if (!haveDialogSource && required) {
  test('the harvested chrome includes the dialog module (VIEWLAB_REQUIRE_CHROME=1)', () => {
    assert.fail(
      `${DIALOG_MJS} is not in the harvested cache, but VIEWLAB_REQUIRE_CHROME=1. It was added to ` +
        `the harvest after the first View Lab increment, so an older cache predates it; ${HARVEST_HINT} -- --force`
    );
  });
}

const skip = haveSource ? false : `no harvested Foundry chrome; ${HARVEST_HINT}`;
const skipDialog = haveDialogSource ? false : `no harvested ${DIALOG_MJS}; ${HARVEST_HINT} -- --force`;
const source = haveSource ? readFileSync(applicationPath, 'utf8') : '';
const dialogSource = haveDialogSource ? readFileSync(dialogPath, 'utf8') : '';

/** Collapse whitespace so an indentation change is not reported as a semantic one. */
function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Slice a brace-balanced method body out of the source. Regex alone cannot do this: `_renderFrame`
 * contains nested braces in both a template literal and an `if`, so a non-greedy match stops early
 * and a greedy one runs to the end of the class.
 *
 * @param {string} text Module source.
 * @param {string} signature Text that opens the method.
 * @param {string} [where] Module name, for the failure message.
 * @returns {string} The method body, braces included.
 */
function methodBody(text, signature, where = APPLICATION_MJS) {
  // Anchor on the DECLARATION, not the first textual occurrence: `_updateFrame(options)` also
  // appears as a call site earlier in the module, and slicing from there balances braces over a
  // completely unrelated block — which fails in a way that reads like real drift.
  const declaration = `\n  ${signature} {`;
  const declarationIndex = text.indexOf(declaration);
  const start = declarationIndex === -1 ? text.indexOf(signature) : declarationIndex;
  assert.notEqual(start, -1, `could not find "${signature}" in ${where}`);
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced body for "${signature}"`);
}

test('the committed provenance record describes a harvestable chrome set', () => {
  const provenance = readProvenance(ROOT);
  assert.ok(provenance, 'tests/view-lab/chrome-provenance.json is missing');
  assert.match(provenance.foundryVersion, /^\d+\.\d+/, 'provenance must name a Foundry version');
  assert.match(
    provenance.chromeMarkup.applicationMjsSha256,
    /^[a-f0-9]{64}$/,
    'provenance must pin the digest of the application module the frame builder was transcribed from'
  );
  assert.match(
    provenance.chromeMarkup.dialogMjsSha256,
    /^[a-f0-9]{64}$/,
    'provenance must pin the digest of the dialog module the DialogV2 builder was transcribed from'
  );
  for (const member of [APPLICATION_MJS, DIALOG_MJS]) {
    assert.ok(
      provenance.assets.some((asset) => asset.path === member),
      `provenance must list ${member}`
    );
  }
});

test('the harvested application module still matches the recorded digest', { skip }, () => {
  const provenance = readProvenance(ROOT);
  const actual = createHash('sha256').update(readFileSync(applicationPath)).digest('hex');
  assert.equal(
    actual,
    provenance.chromeMarkup.applicationMjsSha256,
    `Foundry's application module has changed since the View Lab frame builder was written against it ` +
      `(harvested ${cache.version}, provenance records ${provenance.foundryVersion}).\n` +
      'Read the diff, update scripts/lib/foundryChromeSpec.js if the frame markup moved, then re-record:\n' +
      '  npm run viewlab:chrome:harvest -- --force --write-provenance'
  );
});

test('_renderFrame still emits the header markup the spec transcribes', { skip }, () => {
  const body = normalize(methodBody(source, 'async _renderFrame(options)'));
  const transcribed = normalize(
    FOUNDRY_CHROME_SPEC.frameInnerHtml({ toggleControls: '@TOGGLE@', close: '@CLOSE@' })
  )
    .split('@TOGGLE@')
    .join('${labels.toggleControls}')
    .split('@CLOSE@')
    .join('${labels.close}');

  assert.ok(
    body.includes(transcribed),
    'the frame header markup in scripts/lib/foundryChromeSpec.js no longer appears verbatim in ' +
      `${APPLICATION_MJS}. Re-transcribe frameInnerHtml from the harvested source.`
  );
});

test('_renderFrame still builds the content element and resize handle the same way', { skip }, () => {
  const body = normalize(methodBody(source, 'async _renderFrame(options)'));
  assert.match(body, /content\.classList\.add\("window-content", \.\.\.this\.options\.window\.contentClasses\)/);
  assert.ok(
    body.includes(`insertAdjacentHTML("beforeend", '${FOUNDRY_CHROME_SPEC.resizeHandleHtml}')`),
    'the resize-handle markup no longer matches FOUNDRY_CHROME_SPEC.resizeHandleHtml'
  );
});

test('_updateFrame still derives the window icon class the same way', { skip }, () => {
  const body = normalize(methodBody(source, '_updateFrame(options)'));
  // The spec's builder must produce the same string this template produces.
  assert.ok(
    body.includes('`window-icon fa-fw ${window.icon || "hidden"}`'),
    'the window-icon class template moved; re-transcribe FOUNDRY_CHROME_SPEC.windowIconClass'
  );
  assert.equal(FOUNDRY_CHROME_SPEC.windowIconClass('fa-solid fa-flask'), 'window-icon fa-fw fa-solid fa-flask');
  assert.equal(FOUNDRY_CHROME_SPEC.windowIconClass(''), 'window-icon fa-fw hidden');
});

test('_updateFrame still hides the controls button when there are no header controls', { skip }, () => {
  const body = normalize(methodBody(source, '_updateFrame(options)'));
  assert.match(
    body,
    /controls\.classList\.toggle\("hidden", !Array\.from\(this\._headerControlButtons\(\)\)\.length\)/,
    'the header-controls visibility rule moved. Fabricate registers no header controls, so the lab ' +
      'hides that button; if Foundry stopped doing this, every captured frame is now missing a control.'
  );
  for (const [appId, app] of Object.entries(APP_CHROME)) {
    assert.equal(app.window.controls.length, 0, `${appId} is expected to declare no header controls`);
  }
});

test('_renderFrame still emits no controls dropdown', { skip }, () => {
  // V13 appended `<menu class="controls-dropdown"></menu>` to the frame and filled it in
  // `_updateFrame`; V14 removed it in favour of a context menu. The transcription follows, so this
  // asserts the ABSENCE — a V15 that reinstated the element would otherwise be a silent omission
  // from every captured frame rather than a failure.
  const body = normalize(methodBody(source, 'async _renderFrame(options)'));
  assert.ok(
    !body.includes('controls-dropdown'),
    'ApplicationV2 emits a controls-dropdown again. Restore it in FOUNDRY_CHROME_SPEC.frameInnerHtml ' +
      'and in tests/view-lab/foundryFrame.js, or every captured frame is missing an element ' +
      'production draws.'
  );
  assert.ok(!FOUNDRY_CHROME_SPEC.frameInnerHtml({ toggleControls: 'a', close: 'b' }).includes('controls-dropdown'));
});

test('_getFrameButtons is still empty, so no extra header button is drawn', { skip }, () => {
  // V14 added `_renderFrameButtons`, which inserts `_getFrameButtons(options)` before the close
  // button. ApplicationV2's returns nothing and neither Fabricate window overrides it — which is
  // both why the frame has no extra button and why `templates/generic/frame-buttons.hbs` is not
  // harvested. If core starts returning one by default, every frame gains a control the lab omits.
  assert.match(
    normalize(methodBody(source, '_getFrameButtons(options)')),
    /^\{ return \[\]; \}$/,
    'ApplicationV2._getFrameButtons no longer returns an empty list. The lab draws no frame buttons, ' +
      'so a non-empty default means every captured frame is missing one.'
  );
});

test('the application class is still unshifted onto framed windows', { skip }, () => {
  assert.match(
    normalize(source),
    /if \( applicationOptions\.window\.frame \) applicationOptions\.classes\.unshift\("application"\)/,
    'ApplicationV2 no longer prepends the "application" class. Every .application rule in foundry2.css ' +
      'hangs off it, so the lab would render a window with no chrome at all.'
  );
  assert.equal(frameClassesFor(APP_CHROME['fabricate-app'])[0], 'application');
});

test('the max-height ceiling the geometry assertion relies on is unchanged', { skip }, () => {
  const css = readFileSync(join(cache.dir, 'css/foundry2.css'), 'utf8');
  assert.match(
    css,
    /max-height:\s*calc\(100vh - 1\.5 \* var\(--hotbar-height\)\)/,
    'the .application max-height rule moved; minimumViewportFor() and the geometry assertion are ' +
      'derived from it, so a capture could be silently clamped'
  );
  assert.match(
    css,
    new RegExp(`--hotbar-height:\\s*${FOUNDRY_CHROME_SPEC.hotbarHeightPx}px`),
    `--hotbar-height is no longer ${FOUNDRY_CHROME_SPEC.hotbarHeightPx}px`
  );
});

/* -------------------------------------------------------------------------- */
/*  DialogV2 (client/applications/api/dialog.mjs)                              */
/* -------------------------------------------------------------------------- */

const RETRANSCRIBE = 'Re-transcribe FOUNDRY_DIALOG_SPEC in scripts/lib/foundryChromeSpec.js and the ' +
  'builder in tests/view-lab/foundryDialog.js from the harvested source.';

test('the harvested dialog module still matches the recorded digest', { skip: skipDialog }, () => {
  const provenance = readProvenance(ROOT);
  const actual = createHash('sha256').update(readFileSync(dialogPath)).digest('hex');
  assert.equal(
    actual,
    provenance.chromeMarkup.dialogMjsSha256,
    `Foundry's dialog module has changed since the View Lab DialogV2 was written against it ` +
      `(harvested ${cache.version}, provenance records ${provenance.foundryVersion}).\n` +
      'Read the diff, update scripts/lib/foundryChromeSpec.js if the dialog markup moved, then re-record:\n' +
      '  npm run viewlab:chrome:harvest -- --force --write-provenance'
  );
});

test('DialogV2 DEFAULT_OPTIONS still match the transcription', { skip: skipDialog }, () => {
  const { defaultOptions } = FOUNDRY_DIALOG_SPEC;
  const transcribed =
    `static DEFAULT_OPTIONS = { id: "${defaultOptions.id}", ` +
    `classes: ["${defaultOptions.classes.join('", "')}"], ` +
    `tag: "${defaultOptions.tag}", ` +
    `form: { closeOnSubmit: ${defaultOptions.form.closeOnSubmit} }, ` +
    `window: { frame: ${defaultOptions.window.frame}, positioned: ${defaultOptions.window.positioned}, ` +
    `minimizable: ${defaultOptions.window.minimizable} } };`;
  assert.ok(
    normalize(dialogSource).includes(transcribed),
    `DialogV2's DEFAULT_OPTIONS no longer read as transcribed. ${RETRANSCRIBE}`
  );
  // The tag and the class list are what make the CSS apply at all: `.application.dialog` is the
  // only selector that unpads the frame, and `<dialog>` is what `show()` can open.
  const chrome = resolveDialogChrome({});
  assert.equal(chrome.tag, 'dialog');
  assert.deepEqual(chrome.classes, ['application', 'dialog']);
  assert.deepEqual(resolveDialogChrome({ classes: ['fabricate'] }).classes, [
    'application',
    'dialog',
    'fabricate',
  ]);
});

test('_renderHTML still builds the form the spec transcribes', { skip: skipDialog }, () => {
  const body = normalize(methodBody(dialogSource, 'async _renderHTML(_context, _options)', DIALOG_MJS));
  assert.ok(
    body.includes(`form.className = "${FOUNDRY_DIALOG_SPEC.formClassName}"`),
    `the dialog form's class list moved. ${RETRANSCRIBE}`
  );
  assert.ok(
    body.includes(`form.autocomplete = "${FOUNDRY_DIALOG_SPEC.formAutocomplete}"`),
    `the dialog form's autocomplete setting moved. ${RETRANSCRIBE}`
  );

  // Feed the spec's template Foundry's own expressions, so each fragment it produces must appear
  // verbatim in the method. Two fragments rather than one string: the source interposes the
  // `: ""` arm of the content ternary between them.
  const withExpressions = normalize(
    FOUNDRY_DIALOG_SPEC.formInnerHtml('${this.options.content}', '${this._renderButtons()}')
  );
  for (const fragment of withExpressions.split(/\s+(?=<footer)/)) {
    assert.ok(
      body.includes(fragment),
      `${fragment} no longer appears in _renderHTML. ${RETRANSCRIBE}`
    );
  }
  // The content wrapper is conditional; a dialog with no content emits the footer alone.
  assert.ok(body.includes(': ""}'), `the content ternary moved. ${RETRANSCRIBE}`);
  assert.ok(!FOUNDRY_DIALOG_SPEC.formInnerHtml('', 'B').includes('dialog-content'));

  assert.ok(
    normalize(methodBody(dialogSource, '_replaceHTML(result, content, _options)', DIALOG_MJS)).includes(
      'content.replaceChildren(result);'
    ),
    `the dialog no longer replaces the window-content children with its form. ${RETRANSCRIBE}`
  );
});

test('_renderButtons still builds each button the same way', { skip: skipDialog }, () => {
  const body = normalize(methodBody(dialogSource, '_renderButtons()', DIALOG_MJS));
  const { buttonDefaults } = FOUNDRY_DIALOG_SPEC;
  const expected = [
    `class: cls="${buttonDefaults.class}"`,
    `type="${buttonDefaults.type}"`,
    'const isDefault = !!buttonOptions.default || ((i === 0) && !buttons.some(b => b.default));',
    'button.setAttribute("type", type); button.setAttribute("data-action", action); button.setAttribute("class", cls);',
    // V14 interposes the tooltip branch between the two toggles. Asserted as three fragments so a
    // future reordering shows up as the specific line that moved, and so the branch itself is
    // pinned — the lab transcribes it even though no Fabricate dialog passes a tooltip yet.
    'button.toggleAttribute("disabled", !!disabled);',
    'if ( tooltip ) { button.setAttribute("data-tooltip", ""); button.setAttribute("aria-label", _loc(tooltip)); }',
    'button.toggleAttribute("autofocus", isDefault);',
    'i.className = icon;',
    // V14 localizes through the module-local `_loc` helper rather than reaching for the `game`
    // global. Same resolution; the lab's `renderButtons` passes its own localizer either way.
    'span.innerText = _loc(label);',
    'return button.outerHTML;',
  ];
  for (const fragment of expected) {
    assert.ok(body.includes(fragment), `"${fragment}" is gone from _renderButtons. ${RETRANSCRIBE}`);
  }
  // The attribute ORDER above is what decides the order in the captured markup, and the default
  // rule is what decides which button carries `autofocus`.
  assert.equal(FOUNDRY_DIALOG_SPEC.isDefaultButton([{}, {}], 0), true);
  assert.equal(FOUNDRY_DIALOG_SPEC.isDefaultButton([{}, { default: true }], 0), false);
  assert.equal(FOUNDRY_DIALOG_SPEC.isDefaultButton([{}, { default: true }], 1), true);
});

test('confirm still unshifts the yes/no buttons the spec transcribes', { skip: skipDialog }, () => {
  const normalized = normalize(dialogSource);
  const [yes, no] = confirmDialogButtons();
  assert.ok(
    normalized.includes(
      `action: "${yes.action}", label: "${yes.label}", icon: "${yes.icon}", callback: () => ${yes.callback()}`
    ),
    `DialogV2.confirm's YES button moved. ${RETRANSCRIBE}`
  );
  assert.ok(
    normalized.includes(
      `action: "${no.action}", label: "${no.label}", icon: "${no.icon}", ` +
        `type: "${no.type}", default: ${no.default}, callback: () => ${no.callback()}`
    ),
    `DialogV2.confirm's NO button moved. ${RETRANSCRIBE}`
  );
  assert.ok(
    normalized.includes(
      `return this.wait(foundry.utils.mergeObject({ position: { width: ${FOUNDRY_DIALOG_SPEC.factoryPosition.width} } }, config));`
    ),
    `DialogV2.confirm's default width moved. ${RETRANSCRIBE}`
  );
  // A caller override must survive the merge — Fabricate relabels both buttons on every confirm.
  const [relabelled] = confirmDialogButtons({ yes: { label: 'Delete' } });
  assert.equal(relabelled.label, 'Delete');
  assert.equal(relabelled.icon, yes.icon);
});

test('prompt still unshifts the ok button the spec transcribes', { skip: skipDialog }, () => {
  const normalized = normalize(dialogSource);
  const [ok] = promptDialogButtons();
  assert.ok(
    normalized.includes(
      `action: "${ok.action}", label: "${ok.label}", icon: "${ok.icon}", default: ${ok.default}`
    ),
    `DialogV2.prompt's OK button moved. ${RETRANSCRIBE}`
  );
  // BOTH factories end on that identical `return this.wait(...)` line, so a bare `includes` here
  // would be satisfied by confirm's copy and would still pass if prompt's were deleted. Count them.
  const waitLines = normalized.split(
    `return this.wait(foundry.utils.mergeObject({ position: { width: ${FOUNDRY_DIALOG_SPEC.factoryPosition.width} } }, config));`
  ).length;
  assert.equal(
    waitLines,
    3,
    `expected confirm and prompt to each end on the ${FOUNDRY_DIALOG_SPEC.factoryPosition.width}px ` +
      `wait; found ${waitLines - 1}. ${RETRANSCRIBE}`
  );
  // The import dialog relabels it to "Import" and supplies the callback that reads the file input,
  // so a caller override has to survive the merge — as it does for confirm.
  const [relabelled] = promptDialogButtons({ label: 'Import' });
  assert.equal(relabelled.label, 'Import');
  assert.equal(relabelled.icon, ok.icon);
  assert.equal(relabelled.default, true);
});

test('the dialog is still opened and closed the way the lab opens it', { skip: skipDialog }, () => {
  const firstRender = normalize(
    methodBody(dialogSource, 'async _onFirstRender(_context, _options)', DIALOG_MJS)
  );
  assert.ok(
    firstRender.includes(
      'if ( this.options.modal ) this.element.showModal(); else this.element.show();'
    ),
    `DialogV2 no longer opens with show()/showModal(). The lab calls the same pair, and without the ` +
      `resulting [open] attribute foundry2.css keeps the dialog display:none. ${RETRANSCRIBE}`
  );
  assert.ok(
    normalize(dialogSource).includes(
      'return this.options.form.closeOnSubmit ? this.close({ submitted: true }) : this;'
    ),
    `_onSubmit no longer closes on submit. ${RETRANSCRIBE}`
  );
});

test('foundry2.css still hides a dialog that has not been opened', { skip }, () => {
  const css = readFileSync(join(cache.dir, 'css/foundry2.css'), 'utf8');
  assert.match(
    css,
    /\.application\.dialog:not\(\[open\]\)\s*\{\s*display:\s*none/,
    'the .application.dialog[open] rule moved; the lab calls show() to satisfy it, and without the ' +
      'rule a dialog would be visible before it is positioned'
  );
  assert.match(
    css,
    /\.application\.dialog\s*\{\s*padding:\s*0;\s*margin:\s*0/,
    'the .application.dialog reset moved; a <dialog> carries UA padding and auto margins, and ' +
      'this rule is what removes them'
  );
});
