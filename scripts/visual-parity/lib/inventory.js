/** The structural inventory: the complement to the computed-style comparison. */

import { locatorProblems } from './schema.js';

/** Prose starts here. A landmark is a name, not a sentence. */
export const MAX_LABEL_LENGTH = 40;

/** The shortest reason that can plausibly say WHY, matching `schema.js`. */
export const MINIMUM_REASON_LENGTH = 40;

/**
 * The enumerator itself lives in `page-runtime.js`, because it runs inside the measured document
 * and both documents are enumerated by that one function — which is what makes "the prototype and
 * the subject were read the same way" a fact rather than a hope.
 */

/** The thresholds the classifier uses, exported so a spec can state its own. */
export const DEFAULT_INVENTORY_LIMITS = Object.freeze({
  maxLabelLength: MAX_LABEL_LENGTH,
  minCardWidthRatio: 0.6,
  minCardRadius: 8,
  minTitleWeight: 600,
  minTitleSize: 12,
});

/** The stable identity of one prototype landmark, for exemptions and for reading a report. */
export function landmarkKey(screen, path, kind, value) {
  return `${screen}|${path.join('>')}|${kind}:${value}`;
}

function indexByTitle(cards) {
  const index = new Map();
  for (const [position, card] of cards.entries()) {
    const list = index.get(card.title) ?? [];
    list.push({ card, position });
    index.set(card.title, list);
  }
  return index;
}

/** Compare one screen's two inventories. */
export function compareInventories({ screen, prototype, subject, exemptions = {} }) {
  const failures = [];
  const extras = [];
  const exempt = (key) => Object.hasOwn(exemptions, key);

  const subjectByTitle = indexByTitle(subject.cards);
  const claimed = new Set();
  const matched = [];

  for (const card of prototype.cards) {
    const key = landmarkKey(screen, card.path.slice(0, -1), 'card', card.title);
    const candidates = subjectByTitle.get(card.title) ?? [];
    const samePath = candidates.find(
      (entry) =>
        !claimed.has(entry.position) &&
        JSON.stringify(entry.card.path) === JSON.stringify(card.path)
    );
    if (samePath) {
      claimed.add(samePath.position);
      matched.push({ prototype: card, subject: samePath.card, position: samePath.position, key });
      continue;
    }
    const elsewhere = candidates.find((entry) => !claimed.has(entry.position));
    if (elsewhere) {
      claimed.add(elsewhere.position);
      matched.push({
        prototype: card,
        subject: elsewhere.card,
        position: elsewhere.position,
        key,
      });
      if (!exempt(key)) {
        failures.push(
          `MISPLACED CARD "${card.rawTitle}": the prototype nests it under ` +
            `[${card.path.slice(0, -1).join(' > ') || 'the pane'}], the subject under ` +
            `[${elsewhere.card.path.slice(0, -1).join(' > ') || 'the pane'}]  (${key})`
        );
      }
      continue;
    }
    if (!exempt(key)) {
      failures.push(
        `MISSING CARD "${card.rawTitle}": the prototype draws it under ` +
          `[${card.path.slice(0, -1).join(' > ') || 'the pane'}]; the subject has no card ` +
          `with that title  (${key})`
      );
    }
  }

  // ORDER, over the cards that matched. Reported separately from absence because a card that
  // moved is a different defect from a card that is gone.
  let highWater = -1;
  for (const entry of matched) {
    if (entry.position < highWater) {
      const key = `${entry.key}#order`;
      if (!exempt(key)) {
        failures.push(
          `OUT OF ORDER "${entry.prototype.rawTitle}": it follows the cards above it in the ` +
            `prototype and precedes them in the subject  (${key})`
        );
      }
    }
    highWater = Math.max(highWater, entry.position);
  }

  // Where each subject landmark actually lives, so a missing one can be reported as MISPLACED when
  // it exists somewhere else.
  const homeOf = new Map();
  for (const card of subject.cards) {
    for (const label of card.labels) {
      if (!homeOf.has(`label:${label}`)) homeOf.set(`label:${label}`, card.rawTitle);
    }
    for (const glyph of card.glyphs) {
      if (!homeOf.has(`glyph:${glyph}`)) homeOf.set(`glyph:${glyph}`, card.rawTitle);
    }
  }

  const KINDS = [
    ['label', 'labels', 'LABEL'],
    ['glyph', 'glyphs', 'GLYPH'],
  ];
  for (const entry of matched) {
    for (const [kind, field, noun] of KINDS) {
      const present = new Set(entry.subject[field]);
      for (const value of entry.prototype[field]) {
        if (present.has(value)) continue;
        const key = landmarkKey(screen, entry.prototype.path, kind, value);
        if (exempt(key)) continue;
        const home = homeOf.get(`${kind}:${value}`);
        failures.push(
          home
            ? `MISPLACED ${noun} "${value}": the prototype puts it in "${entry.prototype.rawTitle}", ` +
                `the subject in "${home}"  (${key})`
            : `MISSING ${noun} "${value}": the prototype draws it in "${entry.prototype.rawTitle}"; ` +
                `the subject draws it nowhere  (${key})`
        );
      }
      // First-occurrence ORDER within the card, over the landmarks that are present on both.
      const shared = entry.prototype[field].filter((value) => present.has(value));
      const positions = shared.map((value) => entry.subject[field].indexOf(value));
      for (let index = 1; index < positions.length; index += 1) {
        if (positions[index] >= positions[index - 1]) continue;
        const key = `${landmarkKey(screen, entry.prototype.path, kind, shared[index])}#order`;
        if (exempt(key)) continue;
        failures.push(
          `OUT OF ORDER ${noun} "${shared[index]}" in "${entry.prototype.rawTitle}": the ` +
            `prototype draws it after "${shared[index - 1]}"  (${key})`
        );
      }
    }
  }

  // Loose landmarks — outside every card — are held to the same rule, because the pane head
  // and the section strip live there.
  for (const [kind, field, noun] of KINDS) {
    const present = new Set(subject.loose[field]);
    for (const value of prototype.loose[field]) {
      if (present.has(value)) continue;
      const key = landmarkKey(screen, [], kind, value);
      if (exempt(key)) continue;
      const home = homeOf.get(`${kind}:${value}`);
      failures.push(
        home
          ? `MISPLACED ${noun} "${value}": the prototype draws it outside every card, the ` +
              `subject inside "${home}"  (${key})`
          : `MISSING ${noun} "${value}": the prototype draws it outside every card; the ` +
              `subject draws it nowhere  (${key})`
      );
    }
  }

  // The one-directional rule below — a product legitimately says more than a mockup — is true of
  // leaf content and false of cards.
  const prototypeTitles = new Set(prototype.cards.map((card) => card.title));
  for (const card of subject.cards) {
    if (prototypeTitles.has(card.title)) continue;
    const key = landmarkKey(screen, card.path.slice(0, -1), 'extra-card', card.title);
    if (exempt(key)) {
      extras.push(`exempted extra card "${card.rawTitle}"`);
      continue;
    }
    failures.push(
      `EXTRA CARD "${card.rawTitle}": the subject draws it under ` +
        `[${card.path.slice(0, -1).join(' > ') || 'the pane'}] and the prototype has no card ` +
        `with that title  (${key})`
    );
  }

  return { failures, extras };
}

/** Every inventory exemption names a landmark the prototype actually has, and says why. */
export function inventoryExemptionProblems(exemptions = {}, observedKeys = new Set()) {
  const problems = [];
  for (const [key, reason] of Object.entries(exemptions)) {
    const base = key.endsWith('#order') ? key.slice(0, -'#order'.length) : key;
    if (!observedKeys.has(base)) {
      problems.push(
        `inventory exemption "${key}" names a landmark this prototype does not draw: ` +
          `delete it rather than carrying a claim about nothing`
      );
    }
    if (typeof reason !== 'string' || reason.trim().length < MINIMUM_REASON_LENGTH) {
      problems.push(
        `inventory exemption "${key}" needs a stated reason of at least ` +
          `${MINIMUM_REASON_LENGTH} characters, not a placeholder`
      );
    }
  }
  return problems;
}

/** Every landmark key one screen's prototype inventory can produce. */
export function observableKeys(screen, inventory, subject = null) {
  const keys = [];
  // A SUBJECT-only card's key is observable too, or an `extra-card` exemption would always
  // read as stale and the run could never be made green by deciding about one.
  for (const card of subject?.cards ?? []) {
    keys.push(landmarkKey(screen, card.path.slice(0, -1), 'extra-card', card.title));
  }
  for (const card of inventory.cards) {
    keys.push(landmarkKey(screen, card.path.slice(0, -1), 'card', card.title));
    for (const label of card.labels) keys.push(landmarkKey(screen, card.path, 'label', label));
    for (const glyph of card.glyphs) keys.push(landmarkKey(screen, card.path, 'glyph', glyph));
  }
  for (const label of inventory.loose.labels) keys.push(landmarkKey(screen, [], 'label', label));
  for (const glyph of inventory.loose.glyphs) keys.push(landmarkKey(screen, [], 'glyph', glyph));
  return keys;
}

/** An inventory root is one locator, or a declared SET of them under `parts`. */
export function inventoryRootProblems(root, label, pane) {
  if (!root || !Object.hasOwn(root, 'parts')) return locatorProblems(root, label);
  if (!Array.isArray(root.parts) || root.parts.length === 0) {
    return [`${label}: a root set declares a non-empty \`parts\` list`];
  }
  const problems = root.parts.flatMap((part, index) =>
    locatorProblems(part, `${label} part ${index}`)
  );
  // A SET has no "the root", so its pane cannot be derived.
  if (!pane) {
    problems.push(
      `${label}: a root SET must declare its pane — with no single root there is no box to ` +
        `derive the card ratio from, and the first part's width would set it by accident`
    );
  }
  return problems;
}

/**
 * The coverage rule, restated for the inventory: every declared screen owns a root on both sides.
 */
export function inventoryCoverageProblems(spec) {
  const problems = [];
  const roots = spec?.inventory?.roots ?? null;
  if (!roots) return ['spec.inventory.roots is missing: the structural pass has nothing to walk'];
  for (const screen of spec?.screens ?? []) {
    const entry = roots[screen];
    // A ROOT'S `unreachable` NOTE ANSWERS TO THE SAME RULE EVERY OTHER REASON HERE DOES: at
    // least 40 characters, so it is a decision somebody wrote down rather than a placeholder.
    if (
      entry?.unreachable !== undefined &&
      (typeof entry.unreachable !== 'string' ||
        entry.unreachable.trim().length < MINIMUM_REASON_LENGTH)
    ) {
      problems.push(
        `inventory root "${screen}": an unreachable note needs a stated reason of at least ` +
          `${MINIMUM_REASON_LENGTH} characters, not a placeholder`
      );
    }
    if (entry?.prototype && entry.subject) {
      problems.push(
        ...inventoryRootProblems(
          entry.prototype,
          `inventory root "${screen}" (prototype)`,
          entry.prototypePane
        ),
        ...inventoryRootProblems(
          entry.subject,
          `inventory root "${screen}" (subject)`,
          entry.subjectPane
        ),
        // A declared PANE is the box the card ratio is taken from, for a root that generates
        // none of its own. It is a locator like any other, so it is checked like one.
        ...(entry.prototypePane
          ? locatorProblems(entry.prototypePane, `inventory pane "${screen}" (prototype)`)
          : []),
        ...(entry.subjectPane
          ? locatorProblems(entry.subjectPane, `inventory pane "${screen}" (subject)`)
          : [])
      );
      continue;
    }
    problems.push(
      `screen "${screen}" has no inventory root on both sides: an unwalked screen must ` +
        `FAIL, not pass silently`
    );
  }
  for (const screen of Object.keys(roots)) {
    if (!(spec?.screens ?? []).includes(screen)) {
      problems.push(`inventory root "${screen}" names a screen the spec does not declare`);
    }
  }
  return problems;
}
