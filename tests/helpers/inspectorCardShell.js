/**
 * The Overview section shell assertions (issue 3044). Every Overview section is one `InspectorCard`:
 * a `section.fabricate-card` that holds no card, under a head whose title and note the card draws
 * itself. The mounted suites share this one check so each shell is pinned the same way.
 */
import assert from 'node:assert/strict';

/**
 * Assert the Overview section `sectionName` is one `InspectorCard`, titled `title`, with no card
 * inside it and no nested card anywhere under `root`.
 *
 * @param {Element} root The mount target.
 * @param {string} sectionName The `data-recipe-section` value.
 * @param {string} title The card's title, as the rendered `.fab-card-title` reads it.
 * @param {{ note?: boolean }} [options] `note: true` also requires a non-empty `.fab-card-note`.
 */
export function assertOneCard(root, sectionName, title, { note = false } = {}) {
  const section = root.querySelector(`[data-recipe-section="${sectionName}"]`);
  assert.ok(section, `${sectionName} renders`);
  assert.ok(section.matches('section.fabricate-card'), `${sectionName} is an InspectorCard`);
  assert.equal(
    section.querySelectorAll(':scope .fabricate-card').length,
    0,
    `${sectionName} holds a card`
  );
  assert.equal(
    root.querySelectorAll(':scope .fabricate-card .fabricate-card').length,
    0,
    'nested cards'
  );
  assert.equal(
    section.querySelector(':scope > .fab-card-head .fab-card-title')?.textContent.trim(),
    title,
    `${sectionName} is titled "${title}"`
  );
  if (note) {
    const noteText = section
      .querySelector(':scope > .fab-card-head .fab-card-note')
      ?.textContent.trim();
    assert.ok(noteText, `${sectionName} carries a note`);
  }
}
