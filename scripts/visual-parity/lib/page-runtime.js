/**
 * THE PAGE-SIDE RUNTIME — every routine that runs inside the measured document, as real code.
 *
 * ## Why this is one self-contained function
 *
 * Both passes read two documents (the prototype and the real app) and both must read them the
 * SAME way, or "the two sides were measured identically" is a hope rather than a fact. A
 * closure cannot cross into `page.evaluate`, so the previous version shipped these routines as
 * SOURCE STRINGS and reconstituted them in the page with `new Function`. That is dynamic code
 * execution (`javascript:S1523`), and it was not incidental: the spec expressed a region's
 * locator as an arbitrary JavaScript expression, so the page had to be able to run arbitrary
 * JavaScript. A fixture that can express any code can express a locator that does something
 * other than locate.
 *
 * So the source strings are gone. Playwright serialises a FUNCTION handed to `page.evaluate`,
 * which is all that was ever needed: `installParityRuntime` is passed as a function, evaluated
 * once per page, and publishes the runtime on `globalThis`. Everything it needs is declared
 * inside it, because nothing outside it exists in the page.
 *
 * ## Locators are DATA
 *
 * A locator is a CSS selector string, or a list of STEPS from a closed vocabulary
 * (`select`, `children`, `where`, `at`, `child`, `parent`, `sibling`). Steps are plain data:
 * they select, walk and filter, and there is no step that computes. A prototype that needs
 * "the card whose title is X" says so declaratively; it cannot say "and also click this".
 */

/**
 * Install the measurement runtime on `globalThis.__fabricateParity`.
 *
 * Self-contained on purpose: it is serialised into the page, where this module's scope, its
 * imports and its sibling exports do not exist.
 */
export function installParityRuntime() {
  const doc = globalThis.document;
  const styleOf = (el) => globalThis.getComputedStyle(el);
  const px = (value) => Number.parseFloat(value) || 0;

  // ── Locators ─────────────────────────────────────────────────────────────────────────

  function matchesText(el, rule) {
    const text = el.textContent.trim();
    if (rule.equals !== undefined && text !== rule.equals) return false;
    if (rule.startsWith !== undefined && !text.startsWith(rule.startsWith)) return false;
    if (rule.nonEmpty === true && text.length === 0) return false;
    return (rule.includes ?? []).every((part) => text.includes(part));
  }

  function matchesRect(el, rule) {
    const rect = el.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const left = Math.round(rect.left);
    if (rule.width !== undefined && width !== rule.width) return false;
    if (rule.height !== undefined && height !== rule.height) return false;
    if (rule.minWidth !== undefined && width < rule.minWidth) return false;
    if (rule.maxWidth !== undefined && width > rule.maxWidth) return false;
    if (rule.minHeight !== undefined && height < rule.minHeight) return false;
    if (rule.maxHeight !== undefined && height > rule.maxHeight) return false;
    if (rule.minLeft !== undefined && left < rule.minLeft) return false;
    return true;
  }

  function matchesStyle(el, rule, negated) {
    const computed = styleOf(el);
    for (const [property, value] of Object.entries(rule)) {
      const same = computed[property] === value;
      if (negated ? same : !same) return false;
    }
    return true;
  }

  function matchesWhere(el, rule) {
    if (rule.tag && el.tagName.toLowerCase() !== rule.tag) return false;
    if (rule.text && !matchesText(el, rule.text)) return false;
    if (rule.rect && !matchesRect(el, rule.rect)) return false;
    if (rule.style && !matchesStyle(el, rule.style, false)) return false;
    if (rule.styleNot && !matchesStyle(el, rule.styleNot, true)) return false;
    if (rule.has && !el.querySelector(rule.has)) return false;
    if (rule.childCount !== undefined && el.children.length !== rule.childCount) return false;
    if (rule.leaf === true && el.children.length > 0) return false;
    return true;
  }

  function walkUp(el, times) {
    let node = el;
    for (let step = 0; step < times && node; step += 1) node = node.parentElement;
    return node;
  }

  function walkAside(el, offset) {
    let node = el;
    for (let step = 0; step < Math.abs(offset) && node; step += 1) {
      node = offset < 0 ? node.previousElementSibling : node.nextElementSibling;
    }
    return node;
  }

  const STEPS = {
    select: (nodes, step) => nodes.flatMap((node) => [...node.querySelectorAll(step.css)]),
    children: (nodes) => nodes.flatMap((node) => [...node.children]),
    where: (nodes, step) => nodes.filter((node) => matchesWhere(node, step)),
    at: (nodes, step) => [nodes.at(step.index)].filter(Boolean),
    child: (nodes, step) => nodes.map((node) => [...node.children].at(step.index)).filter(Boolean),
    parent: (nodes, step) => nodes.map((node) => walkUp(node, step.times ?? 1)).filter(Boolean),
    sibling: (nodes, step) => nodes.map((node) => walkAside(node, step.offset)).filter(Boolean),
  };

  /**
   * Resolve a locator to its first matching element, or null.
   *
   * @param {string|object[]} locator CSS selector, or a list of steps.
   * @param {object} scope Element the locator starts from.
   * @returns {object|null} The element.
   */
  function locate(locator, scope) {
    const root = scope ?? doc;
    if (typeof locator === 'string') return root.querySelector(locator);
    let nodes = [root];
    for (const step of locator) nodes = STEPS[step.op](nodes, step);
    return nodes[0] ?? null;
  }

  // ── Measurement ──────────────────────────────────────────────────────────────────────

  /**
   * Walk to the nearest ancestor that actually PAINTS a background.
   *
   * Without this, a pane that inherits its surface reports `rgba(0, 0, 0, 0)` on BOTH sides
   * and the comparison passes on any background whatsoever — a vacuous assertion that looks
   * like coverage. Regions opt in with `effectiveBackground: true`.
   */
  function paintedBackground(el) {
    let node = el;
    while (node) {
      const background = styleOf(node).backgroundColor;
      if (background && background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') {
        return background;
      }
      node = node.parentElement;
    }
    return 'rgba(0, 0, 0, 0)';
  }

  /**
   * One box's horizontal EDGES, for the alignment rule.
   *
   * Read rather than derived from padding and width because an inset that moves a whole
   * subtree changes none of the subtree's own computed values — which is exactly why a
   * per-region comparison cannot see it. Viewport coordinates are fine: an alignment compares
   * two boxes in the SAME document, never across the two, whose widths deliberately differ.
   */
  function edgesOf(el) {
    const rect = el.getBoundingClientRect();
    return { left: rect.left, right: rect.right };
  }

  function propertiesOf(entry, propertyGroups) {
    if (entry.properties) return entry.properties;
    return (entry.groups ?? []).flatMap((group) => propertyGroups[group] ?? []);
  }

  function readRegion(el, entry, propertyGroups) {
    const computed = styleOf(el);
    const values = {};
    for (const property of propertiesOf(entry, propertyGroups)) {
      values[property] =
        property === 'backgroundColor' && entry.effectiveBackground
          ? paintedBackground(el)
          : computed[property];
    }
    return { tag: el.tagName.toLowerCase(), properties: values };
  }

  /**
   * The DANGER-FAMILY SWEEP, and its generalisation.
   *
   * A per-region list can only ever catch a colour on a region someone thought to NAME. This
   * is the complement: given a set of chrome selectors and a set of forbidden colour
   * substrings, it reports every border, outline and scrollbar on those elements that paints
   * one. In this repository it caught two full-height crimson rules at a pane's edges —
   * Foundry core's scrollbar showing through because nothing had ever selected a token for it.
   */
  function chromeSweep(selectors, forbidden, root) {
    const scope = root ?? doc;
    const found = [];
    for (const selector of selectors) {
      for (const el of scope.querySelectorAll(selector)) {
        const computed = styleOf(el);
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
          const width = computed[`border${side}Width`];
          const color = computed[`border${side}Color`];
          if (width !== '0px' && forbidden.some((rgb) => color.includes(rgb))) {
            found.push(`${selector} border-${side.toLowerCase()}: ${width} ${color}`);
          }
        }
        if (
          computed.outlineWidth !== '0px' &&
          forbidden.some((rgb) => computed.outlineColor.includes(rgb))
        ) {
          found.push(`${selector} outline: ${computed.outlineWidth} ${computed.outlineColor}`);
        }
        if (forbidden.some((rgb) => computed.scrollbarColor.includes(rgb))) {
          found.push(`${selector} scrollbar-color: ${computed.scrollbarColor}`);
        }
      }
    }
    return found;
  }

  /**
   * Read one screen: every region mapped onto it, the chrome sweep, the required ancestors
   * and every alignment group's member edges.
   *
   * ONE routine for both sides, which is what makes "the prototype and the subject were
   * measured the same way" a fact.
   */
  function measure(payload) {
    const scope = payload.root ? doc.querySelector(payload.root) : doc.documentElement;
    if (!scope) return { missingRoot: payload.root };
    const groups = payload.propertyGroups ?? {};
    const regions = {};
    for (const [name, entry] of Object.entries(payload.regions ?? {})) {
      const el = locate(entry.locator, scope);
      // An UNREACHABLE region is not measured, but its absence IS asserted: the moment the
      // app renders it, the note excusing it has outlived the gap and must go.
      if (entry.unreachable) {
        regions[name] = el ? { reachableAfterAll: true } : { unreachable: true };
      } else if (el) {
        regions[name] = readRegion(el, entry, groups);
      } else {
        regions[name] = { missing: true };
      }
    }
    const alignments = {};
    for (const [name, members] of Object.entries(payload.alignments ?? {})) {
      const edges = {};
      const missing = [];
      for (const [member, locator] of Object.entries(members)) {
        const el = locate(locator, scope);
        if (el) edges[member] = edgesOf(el);
        else missing.push(member);
      }
      alignments[name] = { edges, missing };
    }
    return {
      regions,
      alignments,
      chrome: payload.sweep
        ? chromeSweep(payload.sweep.selectors, payload.sweep.forbidden, scope)
        : [],
      // THE REAL ANCESTOR CHAIN, mechanised. A harness that starts at the panel under test
      // cannot see an inset that lives above it, and the first version of this one passed
      // while 36px of stacked dead space was on screen for exactly that reason.
      missingAncestors: (payload.ancestors ?? []).filter(
        (selector) => !(scope.matches?.(selector) || scope.querySelector(selector))
      ),
    };
  }

  // ── The structural inventory's enumerator ────────────────────────────────────────────

  /**
   * Enumerate a tree into ordered LANDMARKS: cards, the labels inside them, and the icon
   * glyphs inside them. Both documents are enumerated by this one function.
   *
   * The classifier is PRESENTATION-DERIVED, never class-derived: the prototype is a
   * styled-components document whose every element is `class="sc"`, and only tag name,
   * computed style, Font Awesome icon name and short visible text cross between the two.
   */
  function collectInventory(root, limits) {
    const cards = [];
    const loose = { labels: [], glyphs: [] };

    // A landmark's KEY. Lower-cased, whitespace-collapsed, and every digit run replaced by
    // '#' so a count is not mistaken for copy. Leading and trailing punctuation goes because
    // the prototype separates facts with a middle dot the subject may render as a border.
    const normalise = (raw) =>
      String(raw)
        .replaceAll(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replaceAll(/\d+/g, '#')
        .replace(/^[^\p{L}\p{N}#@]+/u, '')
        .replace(/[^\p{L}\p{N}#%)]+$/u, '')
        .trim();

    // The element's OWN text: direct text-node children only, so a container never inherits
    // its descendants' words and every sentence is attributed once.
    const ownText = (el) =>
      [...el.childNodes]
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent)
        .join(' ')
        .replaceAll(/\s+/g, ' ')
        .trim();

    // WORLD CONTENT is not design. A roll-data path, a dice expression and a bare number are
    // all authored per world, so a gate that compared them would fail on every world that is
    // not the mockup's — which is every world.
    const isDataKey = (key) => key.includes('@') || /^[#d\s+-]+$/.test(key) || !/\p{L}/u.test(key);
    const isLabelText = (raw) =>
      Boolean(raw) && raw.length <= limits.maxLabelLength && /\p{L}/u.test(raw);

    // Font Awesome is the ONE vocabulary both documents share: the prototype writes
    // 'fa-solid fa-grip-vertical' and the subject 'fas fa-grip-vertical'. Style and sizing
    // tokens are dropped; the icon name is kept.
    const STYLE_TOKENS = new Set([
      'fa',
      'fas',
      'far',
      'fal',
      'fab',
      'fad',
      'fak',
      'fa-solid',
      'fa-regular',
      'fa-light',
      'fa-thin',
      'fa-duotone',
      'fa-brands',
      'fa-sharp',
      'fa-fw',
      'fa-fixed-width',
      'fa-spin',
      'fa-pulse',
      'fa-lg',
      'fa-sm',
      'fa-xs',
      'fa-2x',
      'fa-3x',
      'fa-inverse',
      'fa-border',
      'fa-stack',
    ]);
    const iconNames = (el) => {
      const classes = typeof el.className === 'string' ? el.className.split(/\s+/) : [];
      return classes.filter((token) => token.startsWith('fa-') && !STYLE_TOKENS.has(token));
    };

    const rootWidth = root.clientWidth || root.getBoundingClientRect().width || 1;

    // A HEADING is a heading. Two rules, because the two documents say it differently: a real
    // `h1`–`h6`, which is what the subject uses — including for a card headed by an UPPERCASE
    // MICRO-LABEL, this product's own inspector convention, which sits far below any size
    // floor — and a presentational one, which is all a styled-components prototype has.
    const isTitleLeaf = (el, text) => {
      if (!isLabelText(text)) return false;
      if (/^h[1-6]$/.test(el.tagName.toLowerCase())) return true;
      const computed = styleOf(el);
      return (
        Number.parseInt(computed.fontWeight, 10) >= limits.minTitleWeight &&
        px(computed.fontSize) >= limits.minTitleSize
      );
    };

    // A CARD is a bordered, rounded, near-full-width container that OWNS A TITLE. The title
    // requirement is what separates a card from a list row: the prototype's tier rows are 97%
    // of the pane wide with a 9px radius and a 1px border, and the only thing that tells them
    // apart from a card is that their name is an `<input>` rather than a heading.
    const isCard = (el) => {
      const computed = styleOf(el);
      if (computed.borderTopStyle === 'none' || px(computed.borderTopWidth) < 1) return false;
      if (px(computed.borderTopLeftRadius) < limits.minCardRadius) return false;
      return el.getBoundingClientRect().width >= rootWidth * limits.minCardWidthRatio;
    };

    const recordText = (el, target, text) => {
      const key = normalise(text);
      if (!key || isDataKey(key)) return;
      if (target && !target.title && isTitleLeaf(el, text)) {
        target.title = key;
        target.rawTitle = text;
      } else if (target) target.labels.push(key);
      else loose.labels.push(key);
    };

    // A titleless card candidate is a ROW, not a card: fold what it collected into its parent
    // so nothing is lost and no phantom card is reported.
    const closeCard = (card, stack) => {
      if (card.title) {
        card.path = [
          ...stack.filter((entry) => entry.title).map((entry) => entry.title),
          card.title,
        ];
        cards.push(card);
        return;
      }
      const parent = stack.at(-1) ?? loose;
      parent.labels.push(...card.labels);
      parent.glyphs.push(...card.glyphs);
    };

    const walk = (el, cardStack) => {
      // A landmark NOBODY CAN SEE is not a landmark. A mockup routinely carries a hidden
      // branch of an alternative state, and a walk that read it would demand the subject build
      // a control the prototype does not draw. The clip-path visually-hidden idiom
      // deliberately does NOT count as hidden, because that content is announced.
      const computed = styleOf(el);
      if (computed.display === 'none' || computed.visibility === 'hidden') return;

      const ownCard =
        el !== root && isCard(el)
          ? { element: el, title: '', rawTitle: '', path: [], labels: [], glyphs: [] }
          : null;
      const target = ownCard ?? cardStack.at(-1) ?? null;
      const nextStack = ownCard ? [...cardStack, ownCard] : cardStack;

      const text = ownText(el);
      if (isLabelText(text)) recordText(el, target, text);
      for (const icon of iconNames(el)) (target ?? loose).glyphs.push(icon);
      for (const child of el.children) walk(child, nextStack);
      if (ownCard) closeCard(ownCard, cardStack);
    };

    walk(root, []);

    // Document order, which the post-order walk above does not produce.
    cards.sort((left, right) => {
      const relation = left.element.compareDocumentPosition(right.element);
      if (relation & globalThis.Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (relation & globalThis.Node.DOCUMENT_POSITION_PRECEDING) return 1;
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
  }

  /** The inventory entry point: resolve the root by locator, then enumerate it. */
  function inventoryOf(payload) {
    const root = locate(payload.locator, null);
    if (!root) return { missingRoot: true };
    return collectInventory(root, payload.limits);
  }

  // Published on the page global because that is the only scope a later `page.evaluate` can
  // reach. `defineProperty` rather than assignment so a re-install replaces it cleanly.
  Object.defineProperty(globalThis, '__fabricateParity', {
    value: { locate, measure, inventoryOf },
    writable: true,
    configurable: true,
  });
}

/**
 * Install the runtime in a page. Called once per page, after it has loaded.
 *
 * @param {object} page Playwright page.
 * @returns {Promise<void>} Resolves once the runtime is published.
 */
export async function installRuntime(page) {
  await page.evaluate(installParityRuntime);
}
