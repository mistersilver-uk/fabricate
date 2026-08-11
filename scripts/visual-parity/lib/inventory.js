/**
 * The STRUCTURAL INVENTORY: the complement to the computed-style comparison.
 *
 * ## The gap this closes, stated as the defect it is
 *
 * `compare.mjs` measures the computed styles of regions that exist on BOTH sides. That shape
 * of gate is structurally incapable of seeing absence: a region the subject does not have is
 * either not in the map (so nothing is asserted) or reports as one missing selector, and a
 * region NOBODY NAMED is invisible either way. The nine `roll` regions of this repository's
 * own fixture all measured card chrome and tier rows and reported **no drift** while a whole
 * callout card was missing from the screen, two controls sat in the wrong card, and every tier
 * row was missing its drag handle.
 *
 * **A parity gate that only measures what both sides have will always report green on
 * something one side is missing.** The danger-family sweep is the same idea for colour — it
 * catches a colour on a region nobody thought to name. This is that complement for structure.
 *
 * ## What it asserts
 *
 * The prototype's own element tree is ENUMERATED (not mapped by hand) into an ordered list of
 * landmarks, and the subject is enumerated by the SAME classifier. Then, one-directionally:
 *
 * 1. every prototype CARD has a subject counterpart, under the same card ancestry, in the
 *    same relative order;
 * 2. every prototype LABEL (a card title, a micro-label, a control's visible name) appears
 *    inside the subject's counterpart card — a label found in a DIFFERENT card is reported as
 *    misplaced rather than as missing, which is what names a control that moved;
 * 3. every prototype GLYPH (a Font Awesome icon name) appears inside the counterpart card —
 *    which is what names a missing affordance such as a drag handle.
 *
 * ## Why it degrades usefully instead of demanding a 1:1 node map
 *
 * A hand-maintained map of every node would rot faster than the screen changes, and diffing
 * text nodes would fail on every piece of world data on screen. So:
 *
 * - The classifier is PRESENTATION-DERIVED, never class-derived. The prototype is a
 *   styled-components document whose every element is `class="sc"`; the subject wears semantic
 *   classes. Nothing but computed style, tag name, Font Awesome icon name and visible text
 *   crosses between them.
 * - Only LANDMARKS are enumerated. Prose (over `MAX_LABEL_LENGTH` characters) is skipped
 *   entirely, so the pass never diffs a sentence.
 * - Text is normalised, and DIGIT RUNS COLLAPSE TO `#`, so `Outcomes · 5 tiers` and
 *   `Outcomes · 3 tiers` are one landmark. A count is data; the sentence around it is design.
 * - Roll-data paths (`@abilities.int.mod`) and text with no letters are skipped: those are
 *   world content, and a gate that failed on them would fail on every world.
 * - The assertion is ONE-DIRECTIONAL. Subject landmarks with no prototype counterpart are
 *   reported as extras and never fail: the product legitimately says more than a mockup does.
 *
 * What survives all of that is exactly the class of defect the tool exists for: a missing
 * CARD, a control in the WRONG PARENT, and a missing AFFORDANCE.
 */

/** Prose starts here. A landmark is a name, not a sentence. */
export const MAX_LABEL_LENGTH = 40;

/** The shortest reason that can plausibly say WHY, matching `schema.js`. */
export const MINIMUM_REASON_LENGTH = 40;

/**
 * The in-page enumerator, as a SOURCE STRING because it has to cross into `page.evaluate`.
 *
 * Both sides are enumerated by this one function, which is what makes "the prototype and the
 * subject were read the same way" a fact rather than a hope.
 */
/* eslint-disable unicorn/no-incorrect-template-string-interpolation --
   This template literal is SOURCE CODE crossing into `page.evaluate`, not a message, and
   every `{L}` / `{N}` below is a Unicode property escape inside a regular expression rather
   than an interpolation missing its `$`. `String.raw` is not an option for it either: the
   block carries escaped backticks, which a raw string cannot express. */
export const COLLECT_INVENTORY_SOURCE = `
function collectInventory(root, limits) {
  const MAX_LABEL = limits.maxLabelLength;
  const MIN_CARD_WIDTH_RATIO = limits.minCardWidthRatio;
  const MIN_CARD_RADIUS = limits.minCardRadius;
  const MIN_TITLE_WEIGHT = limits.minTitleWeight;
  const MIN_TITLE_SIZE = limits.minTitleSize;

  const px = (value) => Number.parseFloat(value) || 0;

  // A landmark's KEY. Lower-cased, whitespace-collapsed, and every digit run replaced by '#'
  // so a count is not mistaken for copy. Leading/trailing punctuation goes because the
  // prototype separates facts with a middle dot that the subject may render as a border.
  const normalise = (raw) =>
    String(raw)
      .replace(/\\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/\\d+/g, '#')
      .replace(/^[^\\p{L}\\p{N}#@]+/u, '')
      .replace(/[^\\p{L}\\p{N}#%)]+$/u, '')
      .trim();

  // The element's OWN text: direct text-node children only, so a container never inherits
  // its descendants' words and every sentence is attributed once.
  const ownText = (el) =>
    [...el.childNodes]
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent)
      .join(' ')
      .replace(/\\s+/g, ' ')
      .trim();

  // WORLD CONTENT is not design. A roll-data path, a dice expression and a bare number are
  // all authored per world, so a gate that compared them would fail on every world that is
  // not the mockup's — which is every world. Applied to the NORMALISED key, because the chips
  // that carry them are drawn with a leading '+' the raw text starts with.
  const isDataKey = (key) =>
    key.includes('@') || /^[#d\\s+-]+$/.test(key) || !/\\p{L}/u.test(key);

  const isLabelText = (raw) => {
    if (!raw || raw.length > MAX_LABEL) return false;
    return /\\p{L}/u.test(raw);
  };

  // Font Awesome is the ONE vocabulary both documents share: the prototype writes
  // 'fa-solid fa-grip-vertical' and the subject 'fas fa-grip-vertical'. Style and sizing
  // tokens are dropped; the icon name is kept.
  const STYLE_TOKENS = new Set([
    'fa', 'fas', 'far', 'fal', 'fab', 'fad', 'fak',
    'fa-solid', 'fa-regular', 'fa-light', 'fa-thin', 'fa-duotone', 'fa-brands', 'fa-sharp',
    'fa-fw', 'fa-fixed-width', 'fa-spin', 'fa-pulse', 'fa-lg', 'fa-sm', 'fa-xs',
    'fa-2x', 'fa-3x', 'fa-inverse', 'fa-border', 'fa-stack',
  ]);
  const iconNames = (el) => {
    const classes = typeof el.className === 'string' ? el.className.split(/\\s+/) : [];
    return classes.filter((token) => token.startsWith('fa-') && !STYLE_TOKENS.has(token));
  };

  const rootWidth = root.clientWidth || root.getBoundingClientRect().width || 1;

  // A HEADING is a heading. Two rules, because the two documents say it differently:
  //
  //  - a real \`h1\`–\`h6\` element, which is what the subject uses — including for a card whose
  //    heading is an UPPERCASE MICRO-LABEL rather than a sentence-case title, which is this
  //    product's own inspector convention and is far below the presentational size floor;
  //  - a presentational one, which is all the prototype has: it is a styled-components
  //    document with no heading elements at all, so weight and size are the only signal.
  //
  // Without the first rule a card headed by a micro-label reads as having no title, folds
  // into its parent, and is then reported MISSING while sitting on the screen.
  const isTitleLeaf = (el, text) => {
    if (!isLabelText(text)) return false;
    if (/^h[1-6]$/.test(el.tagName.toLowerCase())) return true;
    const cs = getComputedStyle(el);
    return (
      Number.parseInt(cs.fontWeight, 10) >= MIN_TITLE_WEIGHT && px(cs.fontSize) >= MIN_TITLE_SIZE
    );
  };

  // A CARD is a bordered, rounded, near-full-width container that OWNS A TITLE. The title
  // requirement is what separates a card from a list row: the prototype's tier rows are 97%
  // of the pane wide with a 9px radius and a 1px border, and the only thing that tells them
  // apart from a card is that their name is an <input> rather than a heading.
  const isCard = (el) => {
    const cs = getComputedStyle(el);
    if (cs.borderTopStyle === 'none' || px(cs.borderTopWidth) < 1) return false;
    if (px(cs.borderTopLeftRadius) < MIN_CARD_RADIUS) return false;
    const width = el.getBoundingClientRect().width;
    if (width < rootWidth * MIN_CARD_WIDTH_RATIO) return false;
    return true;
  };

  // The nearest enclosing card of an element, stopping at the root.
  const cards = [];
  const loose = { labels: [], glyphs: [] };

  const walk = (el, cardStack) => {
    // A landmark NOBODY CAN SEE is not a landmark. A mockup routinely carries a hidden
    // branch of an alternative state — this one hides a second hint sentence behind
    // \`display: none\` — and a walk that read it would demand the subject build a control
    // the prototype does not draw. \`visibility: hidden\` goes with it; the clip-path
    // visually-hidden idiom deliberately does NOT, because that content is announced.
    const display = getComputedStyle(el);
    if (display.display === 'none' || display.visibility === 'hidden') return;

    let ownCard = null;
    if (el !== root && isCard(el)) {
      // Provisional: a candidate with no title of its own is not a card, and its contents
      // belong to the card above it.
      ownCard = {
        element: el,
        title: '',
        rawTitle: '',
        path: [],
        labels: [],
        glyphs: [],
      };
    }
    const target = ownCard ?? cardStack[cardStack.length - 1] ?? null;
    const nextStack = ownCard ? [...cardStack, ownCard] : cardStack;

    const text = ownText(el);
    if (isLabelText(text)) {
      const key = normalise(text);
      if (!key || isDataKey(key)) {
        // nothing to record
      } else if (target && !target.title && isTitleLeaf(el, text)) {
        target.title = key;
        target.rawTitle = text;
      } else if (key && target) {
        target.labels.push(key);
      } else if (key) {
        loose.labels.push(key);
      }
    }
    for (const icon of iconNames(el)) {
      if (target) target.glyphs.push(icon);
      else loose.glyphs.push(icon);
    }

    for (const child of el.children) walk(child, nextStack);

    if (ownCard) {
      if (ownCard.title) {
        ownCard.path = [...cardStack.filter((c) => c.title).map((c) => c.title), ownCard.title];
        cards.push(ownCard);
      } else {
        // A titleless candidate is a ROW, not a card: fold what it collected into its parent
        // so nothing is lost and no phantom card is reported.
        const parent = cardStack[cardStack.length - 1] ?? null;
        if (parent) {
          parent.labels.push(...ownCard.labels);
          parent.glyphs.push(...ownCard.glyphs);
        } else {
          loose.labels.push(...ownCard.labels);
          loose.glyphs.push(...ownCard.glyphs);
        }
      }
    }
  };

  walk(root, []);

  // Document order, which the post-order walk above does not produce.
  cards.sort((a, b) => {
    const relation = a.element.compareDocumentPosition(b.element);
    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  const dedupe = (values) => [...new Set(values)];
  return {
    cards: cards.map((card) => ({
      title: card.title,
      rawTitle: card.rawTitle,
      path: card.path,
      labels: dedupe(card.labels),
      glyphs: dedupe(card.glyphs),
    })),
    loose: { labels: dedupe(loose.labels), glyphs: dedupe(loose.glyphs) },
  };
}`;

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

/**
 * Compare one screen's two inventories.
 *
 * ONE-DIRECTIONAL by design: every prototype landmark must have a subject counterpart, and a
 * subject landmark with no prototype counterpart is an EXTRA rather than a failure. A mockup
 * is a smaller document than a product, and a gate that failed on the difference would be
 * unusable within a day.
 *
 * @param {object} options Screen name, both inventories, and the exemption map.
 * @returns {{failures: string[], extras: string[]}} Findings.
 */
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

  // Where each subject landmark actually lives, so a missing one can be reported as MISPLACED
  // when it exists somewhere else. This is the assertion that names a control moved into the
  // wrong card, which is invisible to any per-region measurement.
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

  const prototypeTitles = new Set(prototype.cards.map((card) => card.title));
  for (const card of subject.cards) {
    if (!prototypeTitles.has(card.title)) extras.push(`extra card "${card.rawTitle}"`);
  }

  return { failures, extras };
}

/**
 * Every inventory exemption names a landmark the PROTOTYPE actually has, and says why.
 *
 * The second half is what stops an exemption outliving the difference it excused: once the
 * prototype stops drawing that landmark, the exemption is a claim about nothing and the run
 * fails until someone deletes it.
 *
 * @param {object} exemptions Exemption map, key → reason.
 * @param {Set<string>} observedKeys Every key this run's prototype inventories can produce.
 * @returns {string[]} Problems, empty when every exemption is well formed.
 */
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

/**
 * Every landmark key one screen's prototype inventory can produce.
 *
 * @param {string} screen Screen name.
 * @param {object} inventory Prototype inventory for that screen.
 * @returns {string[]} Keys.
 */
export function observableKeys(screen, inventory) {
  const keys = [];
  for (const card of inventory.cards) {
    keys.push(landmarkKey(screen, card.path.slice(0, -1), 'card', card.title));
    for (const label of card.labels) keys.push(landmarkKey(screen, card.path, 'label', label));
    for (const glyph of card.glyphs) keys.push(landmarkKey(screen, card.path, 'glyph', glyph));
  }
  for (const label of inventory.loose.labels) keys.push(landmarkKey(screen, [], 'label', label));
  for (const glyph of inventory.loose.glyphs) keys.push(landmarkKey(screen, [], 'glyph', glyph));
  return keys;
}

/**
 * The COVERAGE rule, restated for the inventory: every declared screen owns a root on both
 * sides. Without it a structural pass that reached two screens out of six would read as
 * coverage in exactly the way the region map already can.
 *
 * @param {object} spec Loaded spec module.
 * @returns {string[]} Problems, empty when every screen is rooted.
 */
export function inventoryCoverageProblems(spec) {
  const problems = [];
  const roots = spec?.inventory?.roots ?? null;
  if (!roots) return ['spec.inventory.roots is missing: the structural pass has nothing to walk'];
  for (const screen of spec?.screens ?? []) {
    const entry = roots[screen];
    if (!entry?.prototype || !entry?.subject) {
      problems.push(
        `screen "${screen}" has no inventory root on both sides: an unwalked screen must ` +
          `FAIL, not pass silently`
      );
    }
  }
  for (const screen of Object.keys(roots)) {
    if (!(spec?.screens ?? []).includes(screen)) {
      problems.push(`inventory root "${screen}" names a screen the spec does not declare`);
    }
  }
  return problems;
}
