/**
 * What a posted crafting chat card states, read from its HTML without a DOM, for the real-Foundry
 * chat card smoke cases (issues 2005 and 2006). Pure and Playwright-free, so the smoke's
 * assertions are unit-tested against cards the shipped renderer builds.
 */

function attributesOf(tag) {
  const attributes = {};
  for (const [, name, value] of tag.matchAll(/\s([\w-]+)(?:="([^"]*)")?/g)) {
    attributes[name] = value ?? '';
  }
  return attributes;
}

/** Every opening tag of `html` with its attributes. */
function tagsOf(html) {
  return [...String(html ?? '').matchAll(/<(\w+)\b[^>]*>/g)].map(([tag, name]) => ({
    name,
    attributes: attributesOf(tag),
  }));
}

const hasClass = (tag, name) => (tag.attributes.class ?? '').split(/\s+/).includes(name);

const ENTITIES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" });

/** Markup-free text as a reader sees it: entities decoded, invisible joiners and breaks removed. */
function visibleText(html) {
  return String(html ?? '')
    .replaceAll(/<[^>]*>/g, '')
    .replaceAll(/&(amp|lt|gt|quot|#39);/g, (_match, name) => ENTITIES[name])
    .replaceAll(/[\u{200B}\u{2060}]/gu, '')
    .trim();
}

/** Each evidence row as `{ id, label, text }`, in card order. */
function evidenceRowsOf(html) {
  const row =
    /<div class="fabricate-craft-chat__evidence-row[^"]*" data-check-evidence="([^"]*)"><dt[^>]*>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd><\/div>/g;
  return [...String(html ?? '').matchAll(row)].map(([, id, label, text]) => ({
    id,
    label: visibleText(label),
    text: visibleText(text),
  }));
}

/** The summed dice line's text, or null when the card states none. */
function diceLineOf(html) {
  const match = /<div class="fabricate-craft-chat__dice">([\s\S]*?)<\/div>/.exec(
    String(html ?? '')
  );
  return match ? visibleText(match[1]) : null;
}

/**
 * What a posted crafting card states: its tiles (`{ face, marks, generated }`), evidence row ids
 * and `rows` (`{ id, label, text }`), its summed `diceLine`, whether it carries a count summary
 * line or a numeric roll row, and its result pill.
 */
export function summarizeCraftCard(html) {
  const tags = tagsOf(html);
  const pill = tags.find((tag) => hasClass(tag, 'fabricate-craft-chat__result'));
  let result = null;
  if (pill)
    result = hasClass(pill, 'fabricate-craft-chat__result--success') ? 'success' : 'failure';
  return {
    isCraftCard: tags.some((tag) => hasClass(tag, 'fabricate-craft-chat')),
    tiles: tags
      .filter((tag) => hasClass(tag, 'fabricate-dice-tiles__tile'))
      .map(({ attributes }) => ({
        face: Number(attributes['data-dice-tile-face']),
        marks: (attributes['data-dice-tile-marks'] ?? '').split(/\s+/).filter(Boolean),
        generated: 'data-dice-tile-generated' in attributes,
      })),
    evidence: tags
      .filter((tag) => hasClass(tag, 'fabricate-craft-chat__evidence-row'))
      .map((tag) => tag.attributes['data-check-evidence']),
    rows: evidenceRowsOf(html),
    diceLine: diceLineOf(html),
    countSummary: tags.some((tag) => 'data-check-count-summary' in tag.attributes),
    rollValue: tags.some((tag) => hasClass(tag, 'fabricate-craft-chat__roll-value')),
    result,
    botched: tags.some((tag) => hasClass(tag, 'fa-skull')),
  };
}

/**
 * The one crafting card among the messages an execute created, or an error naming how many there
 * were: every assertion binds to that message and never to the newest card in the log.
 */
export function pickCraftCardMessage(messages) {
  const cards = messages.filter((message) => summarizeCraftCard(message.content).isCraftCard);
  if (cards.length !== 1) {
    return { error: `the execute created ${cards.length} crafting cards, expected exactly 1` };
  }
  return { message: cards[0] };
}
