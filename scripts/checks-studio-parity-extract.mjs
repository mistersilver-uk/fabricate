#!/usr/bin/env node
/**
 * Regenerate the Checks Studio VISUAL PARITY fixture from the standalone prototype.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────
 * Every review of the Checks Studio asked "does this control exist and behave
 * correctly". None could ask "does it RENDER like the prototype", because no gate in
 * the repository could fail on visual drift: the reviewer's authority table passed rows
 * on presence and behaviour, and the two frame sets were captured at different viewport
 * widths, so even a side-by-side was distorted. This script and the fixture it writes
 * are the missing measurement.
 *
 * ── What it does ─────────────────────────────────────────────────────────────────
 * It loads the prototype in real Chromium, drives it to the Outcomes section, and reads
 * `getComputedStyle` for a fixed set of NAMED REGIONS — the same names the parity test
 * asserts against Fabricate's own surfaces. It records computed values, never
 * screenshots: a screenshot diff cannot survive a different app width, and the two apps
 * legitimately have different widths.
 *
 * ── The width question ───────────────────────────────────────────────────────────
 * The prototype is a FIXED 1480px app window (1478px inside its 1px border). It is
 * measured at its own natural width and never scaled. Fabricate's equivalent surfaces
 * are measured at THEIR width. Nothing width-derived is compared: the recorded
 * properties are colours, type, borders, radii, padding, gaps and fixed control
 * geometry — every one of which is width-invariant in both apps. A region whose value
 * IS width-derived is recorded as an exemption rather than as a number.
 *
 * ── Regenerating ─────────────────────────────────────────────────────────────────
 *   node scripts/checks-studio-parity-extract.mjs
 *
 * The prototype lives at `tmp/GM Checks Studio (standalone).html`, and `tmp` is
 * GITIGNORED — the prototype is a design artefact, not a repository asset. So this
 * script is a maintainer tool that cannot run in CI, and that is deliberate: the FIXTURE
 * is what is checked in and what the gate reads. Losing the prototype does not silently
 * disable the gate; it only prevents regenerating it.
 *
 * Pass `--out <path>` to write elsewhere (used when diffing a regeneration against the
 * committed fixture without clobbering it).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const PROTOTYPE = resolve(repoRoot, 'tmp/GM Checks Studio (standalone).html');
const DEFAULT_OUT = resolve(repoRoot, 'tests/fixtures/checks-studio-parity.json');

// The prototype's own natural width. Its outer container is `width:1480px` and the app
// window inside it carries a 1px border, so the app's INTERIOR is 1478px. Both numbers are
// recorded because the second is the one a reader compares against a Fabricate frame.
const PROTOTYPE_APP_WIDTH = 1480;
const VIEWPORT = { width: 1600, height: 1500 };

/**
 * The properties read for each region, keyed by a PROPERTY GROUP rather than restated per
 * region. Grouping is what keeps a region's declaration to a name, a locator and a list of
 * groups, so adding a region cannot quietly record a narrower property set than its
 * siblings.
 */
const PROPERTY_GROUPS = {
  surface: ['backgroundColor'],
  border: ['borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderTopLeftRadius'],
  type: ['color', 'fontSize', 'fontWeight', 'textTransform'],
  tracking: ['letterSpacing'],
  box: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
  gap: ['columnGap'],
  size: ['width', 'height'],
  blockSize: ['height'],
  // The SCROLLER's own paint. Nothing selected a token for it, so Foundry core's crimson
  // scrollbar leaked into the studio as two full-height vertical rules at the pane's edges.
  scroll: ['scrollbarColor', 'scrollbarWidth'],
};

/**
 * Every region this fixture measures.
 *
 * `locator` is evaluated IN THE PAGE against the prototype and returns one element. It is
 * written as a source string because it has to cross into `page.evaluate`.
 *
 * `effectiveBackground: true` walks up to the nearest ancestor that actually PAINTS a
 * background. Both apps leave their pane transparent and inherit it, so comparing the
 * declared `rgba(0,0,0,0)` on each would be a vacuous assertion that passes on any
 * background whatsoever.
 */
const REGIONS = [
  {
    name: 'pane-background',
    // WIDENED after the maintainer reported rogue whitespace and two red vertical rules the
    // gate had passed straight over (issue 1096). `surface` alone could not see either: the
    // gaps live in the pane's own box and its container's gutter, and the rules were the
    // scroller. Every one of those is now a recorded property.
    groups: ['surface', 'box', 'border', 'scroll'],
    effectiveBackground: true,
    locator: `pane()`,
  },
  // The pane's CONTAINER — the body grid. The prototype butts rail, pane and inspector
  // against each other with no gutter and no padding at all; every separation is a 1px
  // border. Fabricate had 12px of shell padding, a 12px grid gap and a 12px panel inset
  // stacked on top of each other, which is the "dead space at the body's edges".
  {
    name: 'pane-container',
    groups: ['box', 'gap'],
    locator: `pane().parentElement`,
  },
  {
    name: 'studio-shell',
    groups: ['box'],
    locator: `pane().parentElement.parentElement`,
  },
  { name: 'pane-heading', groups: ['type'], locator: `paneHeading()` },
  { name: 'pane-description', groups: ['type'], locator: `paneHeading().nextElementSibling` },
  { name: 'card-surface', groups: ['surface', 'border', 'box'], locator: `bandsCard()` },
  { name: 'card-title', groups: ['type'], locator: `cardTitle(bandsCard())` },
  {
    name: 'card-description',
    groups: ['type'],
    locator: `cardTitle(checkTypeCard()).parentElement.nextElementSibling`,
  },
  { name: 'check-type-card', groups: ['surface', 'border', 'box'], locator: `optionCard(1)` },
  {
    name: 'check-type-card-selected',
    groups: ['surface', 'border', 'box'],
    locator: `optionCard(0)`,
  },
  {
    name: 'check-type-icon-tile',
    groups: ['surface', 'size', 'border'],
    locator: `optionCard(0).firstElementChild`,
  },
  {
    name: 'check-type-title',
    groups: ['type'],
    locator: `optionCard(0).children[1].firstElementChild`,
  },
  {
    name: 'check-type-description',
    groups: ['type'],
    locator: `optionCard(0).children[1].children[1]`,
  },
  {
    name: 'preview-against-label',
    groups: ['type', 'tracking'],
    locator: `previewAgainstLabel()`,
  },
  {
    name: 'preview-against-select',
    groups: ['surface', 'border', 'blockSize'],
    locator: `previewAgainstLabel().nextElementSibling`,
  },
  { name: 'band-strip', groups: ['surface', 'border', 'blockSize'], locator: `bandStrip()` },
  { name: 'tier-row', groups: ['surface', 'border', 'box', 'gap'], locator: `tierRow(0)` },
  { name: 'tier-swatch', groups: ['size', 'border'], locator: `tierRow(0).children[0]` },
  {
    name: 'tier-name-input',
    groups: ['type', 'surface', 'border', 'blockSize'],
    locator: `tierRow(0).children[1]`,
  },
  { name: 'stepper', groups: ['surface', 'border', 'blockSize'], locator: `stepper()` },
  { name: 'stepper-value', groups: ['type'], locator: `stepper().children[1]` },
  {
    name: 'segmented-toggle',
    groups: ['surface', 'border', 'box', 'gap', 'size'],
    locator: `segmented()`,
  },
  {
    name: 'segmented-option-selected',
    groups: ['surface', 'border', 'type', 'blockSize'],
    locator: `segmentedOption(true)`,
  },
  {
    name: 'segmented-option-unselected',
    groups: ['surface', 'border', 'type', 'blockSize'],
    locator: `segmentedOption(false)`,
  },
  {
    name: 'tier-delete-button',
    groups: ['surface', 'border', 'size'],
    locator: `tierRow(0).lastElementChild`,
  },
  {
    name: 'add-tier-button',
    groups: ['surface', 'border', 'type', 'blockSize'],
    locator: `addTierButton()`,
  },
  {
    name: 'inspector-surface',
    groups: ['surface', 'box', 'border', 'scroll'],
    effectiveBackground: true,
    locator: `inspector()`,
  },
  { name: 'inspector-card', groups: ['surface', 'border'], locator: `inspectorCard()` },
  {
    name: 'inspector-section-heading',
    groups: ['type', 'tracking'],
    locator: `inspectorSectionHeading()`,
  },
];

async function main() {
  const outIndex = process.argv.indexOf('--out');
  const outPath =
    outIndex === -1 ? DEFAULT_OUT : resolve(process.cwd(), process.argv[outIndex + 1]);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  try {
    await page.goto(pathToFileURL(PROTOTYPE).href, { waitUntil: 'load' });
    await page.waitForSelector('[data-screen-label="Checks"]', { timeout: 60_000 });
    await page.waitForTimeout(1500);

    // Drive the prototype to the Outcomes section. The tab is the only clickable element
    // in the section strip whose text starts with `Outcomes`; the pane heading that
    // follows is an `<h2>` and the resolution fact is a `<span>`.
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll('div')].find(
        (el) =>
          el.textContent.trim().startsWith('Outcomes') &&
          getComputedStyle(el).cursor === 'pointer' &&
          el.getBoundingClientRect().height < 60
      );
      if (!tab) throw new Error('Outcomes section tab not found in the prototype');
      tab.click();
    });
    await page.waitForTimeout(600);

    const measured = await page.evaluate(
      ({ regions, groups }) => {
        const pane = () => {
          const heading = [...document.querySelectorAll('h2')].find(
            (el) => el.textContent.trim() === 'Outcomes'
          );
          if (!heading) throw new Error('Outcomes pane heading not found');
          // The pane is the heading's grandparent: the head block wraps the `<h2>` and its
          // lead paragraph, and the pane wraps that block. `closest()` cannot express "two
          // divs up" — every ancestor here is a `<div>` — so the chain is the accurate walk.
          // eslint-disable-next-line unicorn/better-dom-traversing -- see above
          return heading.parentElement.parentElement;
        };
        const paneHeading = () =>
          [...document.querySelectorAll('h2')].find((el) => el.textContent.trim() === 'Outcomes');
        const sectionStack = () => pane().lastElementChild;
        const cards = () => [...sectionStack().children];
        const cardTitle = (card) => {
          const found = [...card.querySelectorAll('div')].find(
            (el) => el.children.length === 0 && el.textContent.trim().length > 0
          );
          if (!found) throw new Error('card title not found');
          return found;
        };
        const byTitle = (title) => {
          const card = cards().find((el) => cardTitle(el).textContent.trim() === title);
          if (!card) throw new Error(`card "${title}" not found`);
          return card;
        };
        const checkTypeCard = () => byTitle('Check type');
        const bandsCard = () => byTitle('Outcome bands');
        // The two option cards live in the check-type card's own 2-column grid, which is
        // the element after its heading block.
        const optionCard = (i) => checkTypeCard().lastElementChild.children[i];
        const previewAgainstLabel = () => {
          const span = [...bandsCard().querySelectorAll('span')].find(
            (el) => el.textContent.trim() === 'Preview against'
          );
          if (!span) throw new Error('Preview against label not found');
          return span;
        };
        const bandStrip = () =>
          [...bandsCard().querySelectorAll('div')].find(
            (el) =>
              getComputedStyle(el).position === 'relative' &&
              Math.round(el.getBoundingClientRect().height) === 46
          );
        const tierRows = () => {
          const rows = [...bandsCard().lastElementChild.children];
          // The first child is the column-header row (no input), the last is the dashed
          // add-tier button.
          return rows.filter((el) => el.querySelector('input'));
        };
        const tierRow = (i) => tierRows()[i];
        const stepper = () => {
          const row = tierRow(0);
          const found = [...row.children].find(
            (el) =>
              el.tagName === 'DIV' &&
              el.children.length === 3 &&
              Math.round(el.getBoundingClientRect().height) === 28
          );
          if (!found) throw new Error('tier stepper not found');
          return found;
        };
        const segmented = () => {
          const row = tierRow(0);
          const found = [...row.children].find(
            (el) =>
              el.children.length === 2 &&
              /Success/.test(el.textContent) &&
              /Failure/.test(el.textContent)
          );
          if (!found) throw new Error('tier segmented toggle not found');
          return found;
        };
        // WHICH segment is selected is data, not position: the prototype's first tier is a
        // failure tier, so its `Failure` segment is the lit one. Selecting by index would
        // have recorded the unselected treatment under the selected name.
        const segmentedOption = (selected) => {
          const found = [...segmented().children].find((el) => {
            const lit = getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)';
            return lit === selected;
          });
          if (!found) throw new Error(`segmented option (selected=${selected}) not found`);
          return found;
        };
        const addTierButton = () => bandsCard().lastElementChild.lastElementChild;
        const inspector = () => {
          const anchor = [...document.querySelectorAll('span')].find(
            (el) => el.textContent.trim() === 'Preview as'
          );
          if (!anchor) throw new Error('preview rail not found');
          return anchor.closest('div.sc');
        };
        const inspectorSectionHeading = () =>
          [...document.querySelectorAll('span')].find(
            (el) => el.textContent.trim() === 'Preview as'
          );
        const inspectorCard = () => inspectorSectionHeading().closest('div').parentElement;

        const scope = {
          pane,
          paneHeading,
          cardTitle,
          checkTypeCard,
          bandsCard,
          optionCard,
          previewAgainstLabel,
          bandStrip,
          tierRow,
          stepper,
          segmented,
          segmentedOption,
          addTierButton,
          inspector,
          inspectorCard,
          inspectorSectionHeading,
        };

        function paintedBackground(el) {
          let node = el;
          while (node) {
            const bg = getComputedStyle(node).backgroundColor;
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
            node = node.parentElement;
          }
          return 'rgba(0, 0, 0, 0)';
        }

        const out = {};
        for (const region of regions) {
          // The locator is authored in THIS file and never derived from input; it is a
          // source string only because it has to cross the page boundary into `evaluate`.
          const fn = new Function(...Object.keys(scope), `return (${region.locator});`);
          const el = fn(...Object.values(scope));
          if (!el) throw new Error(`region ${region.name}: locator resolved to nothing`);
          const cs = getComputedStyle(el);
          const props = {};
          for (const group of region.groups) {
            for (const prop of groups[group]) {
              props[prop] =
                prop === 'backgroundColor' && region.effectiveBackground
                  ? paintedBackground(el)
                  : cs[prop];
            }
          }
          out[region.name] = { tag: el.tagName.toLowerCase(), properties: props };
        }
        return out;
      },
      { regions: REGIONS, groups: PROPERTY_GROUPS }
    );

    // Exemptions are HAND-AUTHORED and live in the fixture beside the measurement they
    // suspend, so a reader of one region sees both. They are carried across a regeneration
    // rather than rewritten, because losing them silently is exactly the failure the whole
    // fixture exists to prevent: the gate would come back one property narrower and green.
    const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : null;
    const carriedExemptions = Object.fromEntries(
      Object.entries(previous?.regions || {})
        .filter(([, region]) => region.exemptions)
        .map(([name, region]) => [name, region.exemptions])
    );

    /** One region's fixture entry: what it is, what was measured, what is exempt. */
    function describe(region) {
      const entry = {
        groups: region.groups,
        prototypeLocator: region.locator,
        ...measured[region.name],
      };
      if (region.effectiveBackground) entry.effectiveBackground = true;
      if (carriedExemptions[region.name]) entry.exemptions = carriedExemptions[region.name];
      return entry;
    }

    const fixture = {
      provenance: {
        prototype: 'tmp/GM Checks Studio (standalone).html',
        prototypeAppWidth: PROTOTYPE_APP_WIDTH,
        prototypeAppInteriorWidth: PROTOTYPE_APP_WIDTH - 2,
        viewport: VIEWPORT,
        screen: 'Checks · Crafting · Outcomes',
        generator: 'scripts/checks-studio-parity-extract.mjs',
        command: 'node scripts/checks-studio-parity-extract.mjs',
        engine: 'chromium (playwright)',
        note: [
          'Computed styles, never screenshots. The prototype is a FIXED 1480px app and is',
          'measured at its own natural width; Fabricate is measured at its own. Only',
          'width-invariant properties are recorded, so the two widths never enter the',
          'comparison. `tmp/` is gitignored, so this fixture is the checked-in artefact and',
          'the gate reads it, not the prototype.',
        ].join(' '),
      },
      propertyGroups: PROPERTY_GROUPS,
      regions: Object.fromEntries(REGIONS.map((region) => [region.name, describe(region)])),
    };

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
    process.stdout.write(`wrote ${outPath}\n`);
  } finally {
    await browser.close();
  }
}

await main();
