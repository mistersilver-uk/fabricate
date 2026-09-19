/**
 * The whole-header disclosure shape issue 1512 repaired at three sites: one real header button, a
 * decorative chevron, an `aria-controls` that resolves while the row is open, and an accessible name
 * taken from a visually hidden phrase rather than the header's concatenated copy. One helper, not
 * three copies, because three near-identical blocks fail the new-code duplication gate.
 */
import assert from 'node:assert/strict';

/** The two keys every repaired header names itself with. */
export const EXPAND_PHRASE_KEY = 'FABRICATE.Common.Disclosure.Expand';
export const COLLAPSE_PHRASE_KEY = 'FABRICATE.Common.Disclosure.Collapse';

/** @returns {Element|null} The body region, when the header is open. */
export function assertWholeHeaderDisclosure({
  root,
  header,
  recordName,
  expanded,
  chevronSelector,
  site,
}) {
  const why = (clause) => `${site}: ${clause}`;

  // A `div role="button" tabindex="0"` is what this replaced: Foundry's `KeyboardManager#hasFocus`
  // reads one property and a div fails it, so Space paused the game behind the open window.
  assert.equal(header.tagName, 'BUTTON', why('the whole header is the button'));
  assert.equal(header.getAttribute('type'), 'button', why('it submits no enclosing form'));
  assert.equal(
    header.getAttribute('data-keyboard-focus'),
    'true',
    why('it declares itself focused to Foundry')
  );
  assert.ok(!header.hasAttribute('role'), why('a button needs no role'));
  assert.ok(!header.hasAttribute('tabindex'), why('a button is in the tab order already'));

  const doc = header.ownerDocument;
  header.focus();
  assert.ok(doc.activeElement === header, why('it takes focus with no tabindex of its own'));

  assert.equal(
    header.getAttribute('aria-expanded'),
    String(expanded),
    why('it states its own disclosure state')
  );

  const chevron = header.querySelector(chevronSelector);
  assert.ok(Boolean(chevron), why('the visible chevron cue survives inside the header'));
  assert.ok(
    Boolean(chevron.closest('[aria-hidden="true"]')),
    why('and the chevron is decorative, so it adds nothing to the name')
  );

  const phraseId = header.getAttribute('aria-labelledby');
  assert.ok(Boolean(phraseId), why('the name is delegated to a phrase'));
  const phrase = root.querySelector(`[id="${phraseId}"]`);
  assert.ok(Boolean(phrase), why('and that phrase resolves'));
  assert.ok(
    phrase.classList.contains('visually-hidden'),
    why('the phrase is hidden rather than drawn')
  );
  const expectedKey = expanded ? COLLAPSE_PHRASE_KEY : EXPAND_PHRASE_KEY;
  assert.ok(
    phrase.textContent.includes(expectedKey),
    why(`the phrase is ${expectedKey}, so the state is read as well as the record`)
  );
  assert.ok(phrase.textContent.includes(recordName), why('and the phrase names the record'));

  const controls = header.getAttribute('aria-controls');
  assert.ok(Boolean(controls), why('it points at the region it opens'));
  const body = root.querySelector(`[id="${controls}"]`);
  if (!expanded) {
    assert.ok(!body, why('a collapsed whole-header row renders no body, so nothing carries the id'));
    return null;
  }
  assert.ok(Boolean(body), why('aria-controls resolves to an element carrying that exact id'));
  assert.ok(
    body !== header && !header.contains(body),
    why('the body is the region beside the header, not part of it')
  );
  return body;
}
