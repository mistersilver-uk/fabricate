/**
 * The whole-header disclosure shape issue 1512 repaired at three sites: one real header button, a
 * decorative chevron, an `aria-controls` emitted only while the body it names is mounted, and an
 * accessible name that is the header's own copy plus a visually hidden phrase.
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

  // Foundry's `KeyboardManager#hasFocus` reads one property no `div role="button"` satisfies, so
  // the header has to be the element itself (issue 1512).
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

  // `aria-labelledby` would replace name-from-content, dropping the record copy the header draws
  // (its chips, its chance figure) from the name; the phrase appends to that copy instead.
  assert.ok(
    !header.hasAttribute('aria-labelledby'),
    why('the name is the header copy plus the phrase, not the phrase alone')
  );
  const phrase = header.querySelector('.visually-hidden');
  assert.ok(Boolean(phrase), why('the header carries a hidden phrase inside its own name'));
  const expectedKey = expanded ? COLLAPSE_PHRASE_KEY : EXPAND_PHRASE_KEY;
  assert.ok(
    phrase.textContent.includes(expectedKey),
    why(`the phrase is ${expectedKey}, so the state is read as well as the record`)
  );
  assert.ok(phrase.textContent.includes(recordName), why('and the phrase names the record'));
  assert.ok(
    header.textContent.includes(recordName),
    why('and the header announces the record from its own content')
  );

  if (!expanded) {
    assert.ok(
      !header.hasAttribute('aria-controls'),
      why('a collapsed row renders no body, so it points at no id rather than at a dangling one')
    );
    return null;
  }
  const controls = header.getAttribute('aria-controls');
  assert.ok(Boolean(controls), why('an open header points at the region it opened'));
  const body = root.querySelector(`[id="${controls}"]`);
  assert.ok(Boolean(body), why('aria-controls resolves to an element carrying that exact id'));
  assert.ok(
    body !== header && !header.contains(body),
    why('the body is the region beside the header, not part of it')
  );
  return body;
}
