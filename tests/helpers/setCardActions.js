/**
 * Drives a mounted `SetCard`'s kebab (issue 2512): open it, and choose the portalled item a caller
 * stamped with `hook`, a selector such as `[data-recipe-remove="result-set"]`.
 */
import assert from 'node:assert/strict';

const flush = () => new Promise((done) => setTimeout(done, 0));

/** The open kebab's item matching `hook`, after opening `card`'s kebab. */
export async function openSetCardAction(card, hook, settle = flush) {
  const trigger = card.querySelector('[data-set-card-actions]');
  assert.ok(Boolean(trigger), 'the set card draws its kebab');
  trigger.click();
  await settle();
  const item = card.ownerDocument.querySelector(`[role="menuitem"]${hook}`);
  assert.ok(Boolean(item), `the kebab offers ${hook}`);
  return item;
}

/** Open `card`'s kebab and choose the item matching `hook`. */
export async function chooseSetCardAction(card, hook, settle = flush) {
  const item = await openSetCardAction(card, hook, settle);
  item.click();
  await settle();
}
