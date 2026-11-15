#!/usr/bin/env node
// Builds the Fabricate Design System artifact's files from this repository's design-system sources:
// the shipped theme tokens (`styles/fabricate-tokens.css`), the build reference
// (`openspec/specs/design-system/library.html`, whose kit CSS and specimens become the component
// cards), the shipped-primitive manifest (`scripts/lib/designSystemPrimitives.json`), the self-hosted
// fonts and the brand images. Hand-written brand-book prose and the cover live under
// `scripts/design-system-artifact/static/` and are copied over the generated tree.
//
//   node scripts/design-system-artifact.mjs --out <dir> [--measure] [--chromium <path>]
//
// It writes `<dir>/project/**` (the artifact's files, served at those paths) and
// `<dir>/files.json` (the `files` map for one Artifact publish, the index excluded).
// `--measure` renders every preview in Chromium (Playwright) and writes each card's measured
// height into its `@dsCard` marker; without it a card keeps an estimated height.
// `--chromium` points Playwright at a browser binary other than its own download.
// The output is a build product: never commit it.

import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = join(REPO, 'scripts/design-system-artifact/static');
const ASSETS = join(REPO, 'scripts/design-system-artifact/assets.json');

function parseArgs(argv) {
  const opts = { out: null, measure: false, chromium: null };
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--out': {
        opts.out = argv[++i];
        break;
      }
      case '--measure': {
        opts.measure = true;
        break;
      }
      case '--chromium': {
        opts.chromium = argv[++i];
        break;
      }
      case '-h':
      case '--help': {
        opts.help = true;
        break;
      }
      default: {
        throw new Error(`Unknown argument: ${argv[i]}`);
      }
    }
  }
  return opts;
}

// ---------------------------------------------------------------- text helpers

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  mdash: '—',
  ndash: '–',
  middot: '·',
  times: '×',
  hellip: '…',
  rarr: '→',
  larr: '←',
  uarr: '↑',
  darr: '↓',
  crarr: '↵',
  deg: '°',
  sect: '§',
  minus: '−',
  ge: '≥',
  le: '≤',
};

function unescapeHtml(s) {
  return s.replaceAll(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#')
      return String.fromCodePoint(
        e[1] === 'x' ? Number.parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      );
    if (!(e in ENTITIES)) throw new Error(`Unmapped HTML entity ${m}`);
    return ENTITIES[e];
  });
}

function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;');
}

function text(x) {
  return unescapeHtml(x.replaceAll(/<[^>]+>/g, '').replaceAll(/\s+/g, ' ')).trim();
}

// Private-use code points that mark a code span while the surrounding HTML is stripped.
const SPAN_OPEN = '\u{E000}';
const SPAN_CLOSE = '\u{E001}';

// Inline HTML to Markdown: `<b>`/`<code>` become code spans (or `<b>` bold), and a bare
// `<Name>` becomes a code span so a renderer cannot read it as a tag.
function mdInline(x, bold = false) {
  let s = x;
  if (bold)
    s = s.replaceAll(/<b[^>]*>([\s\S]*?)<\/b>/g, (m, inner) => `**${escapeHtml(text(inner))}**`);
  s = s.replaceAll(
    /<(b|code)[^>]*>([\s\S]*?)<\/\1>/g,
    (m, tag, inner) => `${SPAN_OPEN}${escapeHtml(text(inner))}${SPAN_CLOSE}`
  );
  s = s.replaceAll(/<br\s*\/?>/g, ' ');
  let t = text(s);
  t = t.replaceAll(/(?<![\u{E000}`])<(\/?[A-Za-z][\w.-]*)>/gu, '`<$1>`');
  const out = t
    .split(/(\u{E000}[\s\S]*?\u{E001})/u)
    .map((p) =>
      p.startsWith(SPAN_OPEN)
        ? `\`${p.slice(1, -1).replaceAll('`', "'")}\``
        : p.replaceAll('<', '&lt;')
    );
  return out.join('').replaceAll('`` `', '`').replaceAll('`` ', '` ');
}

function balancedDiv(s, start) {
  let depth = 0;
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = start;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  throw new Error(`Unbalanced <div> at ${start}`);
}

// ---------------------------------------------------------------- tokens

const THEMES = [
  ['fabricate', 'Fabricate'],
  ['mythwright', 'Mythwright'],
  ['ironblood-forge', 'Ironblood Forge'],
  ['hearth-herb', 'Hearth & Herb'],
  ['starglass-arcana', 'Starglass Arcana'],
  ['foundry-native', 'Foundry Native'],
  ['sovereign', 'Sovereign'],
];

function decls(body) {
  const out = new Map();
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

function normColor(v) {
  const s = v.trim();
  if (s.startsWith('#')) return s.toLowerCase();
  const m = /^rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)%\)$/.exec(s);
  if (!m) throw new Error(`Unreadable colour ${v}`);
  const a = (Number(m[4]) / 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`;
}

const normShadow = (v) => v.replaceAll(/rgb\([^)]*\)/g, (m) => normColor(m));

const USAGE = {
  'fab-bg-0': 'Page ground: the window body, a stage behind everything. The base depth level.',
  'fab-bg-1':
    'Rails, rows and wells. A well inside a card, a list row, the nav rail, a modal body.',
  'fab-bg-2': 'Cards and panels. A card sits on bg-0; a well on a modal body (bg-1) takes bg-2.',
  'fab-bg-3': 'Icon chips (IconChip / Medallion tiles) and the deepest raised mark.',
  'fab-surface':
    'The solid window surface; equals bg-1 in every theme. Prefer the bg ladder in new work.',
  'fab-surface-soft':
    'Interaction ladder, REST: translucent fill of a control at rest (buttons, fields, segmented, chips). Reads on any bg level.',
  'fab-surface-raised': 'Interaction ladder, HOVER: a control or row under the pointer.',
  'fab-surface-active':
    'Interaction ladder, PRESSED or SELECTED: a selected row, the chosen segment, an active nav item.',
  'fab-border': 'Default 1px hairline for cards, wells, rows and controls.',
  'fab-border-strong': 'Hover border, section dividers, dashed adders and empty-state outlines.',
  'fab-text':
    'Primary ink: names, values, headings. Clears 4.5:1 on every bg level in every theme.',
  'fab-text-secondary':
    'Ink ladder rank 1, "the rule the GM is reading": button labels, body of a Notice/Callout at danger tone. Use where muted would fail on a danger fill.',
  'fab-text-muted':
    'Ink ladder rank 2 ("neutral", a fact merely present): small text, hints, descriptions, kickers. MUST clear 4.5:1 on bg-1, bg-2, surface-soft over bg-2; NOT on danger-soft over bg-2 (use text-secondary there).',
  'fab-text-subtle':
    'Ink ladder rank 3, a quiet non-actionable state: captions, counts, idle icons. Under 4.5:1 on several grounds in six themes — never for running small text.',
  'fab-text-disabled':
    'Ink ladder rank 4, "muted"/unavailable: disabled control labels. No background change on disable.',
  'fab-accent':
    'Action, active nav, selection, the 2px focus ring and a toggle that is on. The identity colour of each theme.',
  'fab-accent-hover': 'Accent under hover.',
  'fab-accent-strong': 'Accent pressed / emphasised edge.',
  'fab-accent-text':
    'Accent ink for small marks on accent-soft (chip accent tone, badges). Readable where raw accent is not.',
  'fab-accent-soft':
    'Accent tinted fill: selected chip, accent badge. Pair with accent-border and accent-text.',
  'fab-accent-border':
    'Accent tinted edge: a selected row, a focused field, the chosen option card.',
  'fab-on-accent': 'Ink on a solid accent fill (checked checkbox, primary button on success).',
  'fab-on-danger': 'Ink on a solid danger fill.',
  'fab-on-info': "Ink on a solid info fill (e.g. the info segmented control's chosen segment).",
  'fab-on-success': 'Ink on a solid success fill (completed checkbox, primary button).',
  'fab-biome-icon-foreground':
    "Fixed glyph ink drawn on a gathering biome's free customColor swatch.",
  'fab-success': "Semantic SUCCESS base: save, valid, enabled; the primary button's fill.",
  'fab-success-strong': 'Success edge on a solid success fill (done checkbox border).',
  'fab-success-text': 'Success ink on success-soft.',
  'fab-success-soft': 'Success tinted fill (Notice/Chip/Status at success tone).',
  'fab-success-border': 'Success tinted edge.',
  'fab-info': 'Semantic INFO base: DC values, neutral facts.',
  'fab-info-text': 'Info ink on info-soft.',
  'fab-info-soft': 'Info tinted fill.',
  'fab-info-border': 'Info tinted edge.',
  'fab-warning': 'Semantic WARNING base: unsaved, attention, incomplete.',
  'fab-warning-text': 'Warning ink on warning-soft.',
  'fab-warning-soft': 'Warning tinted fill (warning button, incomplete status, issue badge).',
  'fab-warning-border': 'Warning tinted edge.',
  'fab-danger': 'Semantic DANGER base: destructive, invalid, blocked.',
  'fab-danger-text':
    'Danger ink on danger-soft; the ink of a destructive button label and error lines.',
  'fab-danger-soft':
    'Danger tinted fill: invalid field, danger Notice. Text on it inks text-secondary, never text-muted.',
  'fab-danger-border': 'Danger tinted edge.',
  'fab-purple': 'The TAG hue: tag segmented edges and tag chips.',
  'fab-purple-soft': 'Tag wash: the selected tag segment.',
  'fab-purple-text':
    'Tag ink for a lit tag chip with no tint of its own, and the tag row\'s "+ Tag".',
  'fab-warning-focus': 'Focus ring drawn on a warning-toned surface.',
  'fab-badge-gold': 'The PREMIUM mark fill (AppTitleBar). Bound to the premium tier only.',
  'fab-on-badge-gold': 'Ink on badge-gold.',
  'fab-hazard-mid': 'The middle stop of a hazard/risk reading.',
  'fab-control-outline':
    "Derived, declared once outside the palettes: outline of an unchecked radio ring, checkbox box and a switch's off track. 3:1 on bg-0/1/2 in every theme.",
};
const TAG_OFFERED = [
  'sage',
  'mist',
  'lavender',
  'rose',
  'peach',
  'butter',
  'aqua',
  'mauve',
  'verdant',
  'azure',
];
const DROP = {
  guaranteed: 'Guaranteed',
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very rare',
  legendary: 'Legendary',
  none: 'None (no drop)',
};

function usageFor(n) {
  if (n in USAGE) return USAGE[n];
  let m = /^fab-tag-(\w+)$/.exec(n);
  if (m) {
    const t = m[1];
    if (TAG_OFFERED.includes(t)) {
      return `Entity tint "${t}" — offered in TintPicker (position ${TAG_OFFERED.indexOf(t) + 1} of 10). Colours a glyph, badge ink or bar fill; never a chip background. A tint name is a hue promise across themes.`;
    }
    if (t === 'ember')
      return 'Entity tint "ember" — declared but WITHHELD: bound to the Downtime companion tint.';
    return `Entity tint "${t}" — declared but WITHHELD from pickers as a neutral (reads as text or disabled).`;
  }
  m = /^fab-drop-rate-([\w-]+)$/.exec(n);
  if (m) {
    return `Drop-rate ramp, band "${DROP[m[1]]}". Seven fixed hues, identical in every theme; a reading is banded to one hue, never interpolated.`;
  }
  m = /^fab-overlay-dark-(\d+)$/.exec(n);
  if (m)
    return `Dark overlay at ${Number(m[1])}% of the theme ground: scrims, shading inside tracks and tiles.`;
  m = /^fab-overlay-light-(\d+)$/.exec(n);
  if (m) {
    const pct = m[1] === '035' ? '3.5' : String(Number(m[1]));
    return `Light overlay at ${pct}% of the theme ink: hairline washes and lit fills on dark grounds.`;
  }
  throw new Error(`No usage note for --${n}`);
}

const SPACE_USE = {
  'fab-space-2xs': 'Hairline spacing (2px): stepper inner padding, icon segmented padding.',
  'fab-space-1': 'Tight gap (4px): segmented padding, badge padding, meta rows.',
  'fab-space-chip': 'Dense optical unit (6px): icon+label gaps, chip gaps.',
  'fab-space-2': '8px: dense row padding, small gaps.',
  'fab-space-3': '12px: the default row and well padding; button side padding.',
  'fab-space-4': '16px: card padding; row inline padding.',
  'fab-space-5': '20px.',
  'fab-space-6': '24px: between page regions.',
};

const ART = [
  [22, 6, 10],
  [24, 6, 10],
  [26, 7, 11],
  [28, 7, 11],
  [30, 7, 12],
  [32, 7, 13],
  [34, 9, 14],
  [36, 9, 14],
  [38, 9, 15],
  [44, 11, 18],
];

function style(name, fontSize, lineHeight, fontWeight, letterSpacing, usage, sample) {
  const s = { name, fontSize, fontWeight };
  if (lineHeight !== null) s.lineHeight = lineHeight;
  if (letterSpacing !== null) s.letterSpacing = letterSpacing;
  if (usage) s.usage = usage;
  if (sample) s.sample = sample;
  return s;
}

function buildTokens(css, ref) {
  const nc = css.replaceAll(/\/\*[\s\S]*?\*\//g, '');
  const themeVals = {};
  for (const [t] of THEMES) {
    const re = new RegExp(String.raw`\[data-fabricate-theme="${t}"\][^{]*\{([\s\S]*?)\}`);
    themeVals[t] = decls(re.exec(nc)[1]);
  }
  const names = [...themeVals.fabricate.keys()];
  for (const [t] of THEMES) {
    if ([...themeVals[t].keys()].join(',') !== names.join(','))
      throw new Error(`Theme ${t} declares a different token set`);
  }
  const perTheme = (fn, n) => Object.fromEntries(THEMES.map(([t]) => [t, fn(themeVals[t].get(n))]));
  const colorTokens = [];
  const shadowTokens = [];
  for (const n of names) {
    if (n.startsWith('fab-shadow')) {
      shadowTokens.push({
        name: n,
        value: perTheme(normShadow, n),
        usage: {
          'fab-shadow-md': 'Elevation for an anchored menu. Only things that float get a shadow.',
          'fab-shadow-lg': 'Elevation for a popover, picker panel or modal.',
        }[n],
      });
    } else {
      colorTokens.push({ name: n, value: perTheme(normColor, n), usage: usageFor(n) });
    }
  }
  colorTokens.push({
    name: 'fab-control-outline',
    value: Object.fromEntries(THEMES.map(([t]) => [t, '{fab-text-subtle}'])),
    usage: USAGE['fab-control-outline'],
  });
  shadowTokens.push({
    name: 'fab-shadow-none',
    value: 'none',
    usage:
      'Cards, wells and rows: a surface that merely sits on the page uses a border, not a shadow.',
  });

  const root = decls(/:root\s*\{([\s\S]*?)\}/.exec(nc)[1]);
  const spacing = [
    'fab-space-2xs',
    'fab-space-1',
    'fab-space-chip',
    'fab-space-2',
    'fab-space-3',
    'fab-space-4',
    'fab-space-5',
    'fab-space-6',
  ].map((n) => ({ name: n, value: root.get(n), usage: SPACE_USE[n] }));
  const radius = [
    {
      name: 'fab-radius-chip',
      value: '6px',
      usage:
        'Rung 6: chips and controls at or below 24px (24px icon button, checkbox box, art 22–24).',
    },
    {
      name: 'fab-radius-control-sm',
      value: '7px',
      usage: 'Rung 7: controls 26–32px (28 button, 30 inline field, stepper, art 26–32).',
    },
    {
      name: 'fab-radius-control',
      value: '9px',
      usage:
        'Rung 9: controls 34–38px (body/page buttons, form field, search), rows and wells, art 34–38, every portrait.',
    },
    {
      name: 'fab-radius-card',
      value: '11px',
      usage: 'Rung 11: a 44px control, cards, panels, callouts, notices, empty states, art 44.',
    },
    {
      name: 'fab-radius-pill',
      value: '999px',
      usage:
        "Pills and tracks whose contents are text alone (chips, badges, toggles, meters). A pill holding a square element takes its height's control rung instead.",
    },
    {
      name: 'fab-books-control-radius',
      value: root.get('fab-books-control-radius'),
      usage:
        'Shipped token: the control rung (7) shared by the Books & Scrolls tab and the item-page inspector.',
    },
    {
      name: 'fab-books-panel-radius',
      value: root.get('fab-books-panel-radius'),
      usage:
        'Shipped token: the panel rung (11) shared by the Books & Scrolls tab and the item-page inspector.',
    },
  ];
  const control = [
    {
      name: 'fab-control-26',
      value: '26px',
      usage: 'Control height 26: dense in-row controls, segmented button. Radius 7.',
    },
    {
      name: 'fab-control-28',
      value: '28px',
      usage: 'Control height 28: stepper, row action, the 28 adder, chip. Radius 7.',
    },
    {
      name: 'fab-control-30',
      value: '30px',
      usage: 'Control height 30: inline field, token, status button. Radius 7.',
    },
    {
      name: 'fab-control-34',
      value: '34px',
      usage:
        'Control height 34: form field, body (manager) button, toolbar Select/Search. Radius 9.',
    },
    {
      name: 'fab-control-38',
      value: '38px',
      usage: 'Control height 38: page action, primary field, the search field. Radius 9.',
    },
    {
      name: 'fab-control-44',
      value: '44px',
      usage:
        'Control height 44: the comfortable rung, only for a control a spec marks touch-reachable. Radius 11. 32, 36 and 40 are RETIRED.',
    },
    {
      name: 'fab-target-min',
      value: '24px',
      usage:
        'Minimum hit target (WCAG 2.2 §2.5.8). The hit area may exceed the paint; a bare × is 24px around a 9px glyph.',
    },
    {
      name: 'fab-icon-picker-chip',
      value: root.get('fab-icon-picker-chip'),
      usage: "Shipped token: the icon picker's chip.",
    },
    {
      name: 'fab-icon-picker-row',
      value: '38px',
      usage:
        'Shipped token, DERIVED: chip + 2 × space-1 + 2px border = 38px (the source writes it as a calc()).',
    },
  ];
  const art = ART.map(([s, r, g]) => ({
    name: `fab-art-${s}`,
    value: `${s}px`,
    usage: `Art ladder (record tile / IconChip) rung ${s}: radius ${r}, glyph ${g}px.${s === 26 ? ' The default.' : ''}`,
  }));
  const portrait = [
    {
      name: 'fab-portrait-32',
      value: '32px',
      usage:
        'Portrait (Avatar) as a single mark. Square portraits take radius 9 at every rung; round is the person carve-out.',
    },
    { name: 'fab-portrait-30', value: '30px', usage: 'Portrait leading a row.' },
    { name: 'fab-portrait-28', value: '28px', usage: 'Portrait leading a row.' },
    { name: 'fab-portrait-26', value: '26px', usage: 'Portrait stacked (several actors).' },
  ];

  return {
    name: 'Fabricate',
    version: 1,
    meta: {
      source: 'github',
      repo: 'mistersilver-uk/fabricate',
      ref,
      paths: {
        tokens: [
          'styles/fabricate-tokens.css',
          'openspec/specs/design-system/spec.md',
          'openspec/specs/ui-visual-style/spec.md',
        ],
        components: [
          'openspec/specs/design-system/library.html',
          'scripts/lib/designSystemPrimitives.json',
          'tests/view-lab/primitives/catalogue/',
        ],
        fonts: ['assets/fonts/'],
        assets: ['docs/img/fabricate-logo.jpg', 'assets/premium/'],
      },
      synced: new Date().toISOString().slice(0, 10),
    },
    color: { themes: THEMES.map(([id, name]) => ({ id, name })), tokens: colorTokens },
    type: {
      fonts: [
        {
          family: 'Spectral',
          file: 'fonts/spectral-latin-600-normal.woff2',
          weight: '600',
          style: 'normal',
        },
        {
          family: 'Spectral',
          file: 'fonts/spectral-latin-700-normal.woff2',
          weight: '700',
          style: 'normal',
        },
        {
          family: 'JetBrains Mono',
          file: 'fonts/jetbrains-mono-latin-400-normal.woff2',
          weight: '400',
          style: 'normal',
        },
        {
          family: 'JetBrains Mono',
          file: 'fonts/jetbrains-mono-latin-500-normal.woff2',
          weight: '500',
          style: 'normal',
        },
      ],
      families: {
        serif: '"Spectral", "Georgia", "Times New Roman", serif',
        mono: '"JetBrains Mono", ui-monospace, sfmono-regular, menlo, monospace',
        ui: '"Signika", system-ui, sans-serif',
      },
      groups: [
        {
          name: 'Serif — names things',
          family: 'serif',
          styles: [
            style(
              'page-title',
              '22px',
              1.15,
              600,
              null,
              'Page title (PageHeader).',
              'Ironvale Smithing'
            ),
            style('section-heading', '19px', 1.2, 600, null, 'Section heading.', 'Ingredient sets'),
            style('stat-value', '17px', 1.1, 700, null, 'StatBox value.', '412'),
            style(
              'card-title',
              '15px',
              1.25,
              600,
              null,
              'Card title, empty-state title, row name in a roomy list.',
              'Tempered steel blade'
            ),
            style(
              'row-name',
              '13px',
              1.3,
              600,
              null,
              'Row name; the brand line in the app title bar.',
              'Karrun Forgecraft'
            ),
          ],
        },
        {
          name: 'UI face — interface text (host-owned)',
          family: 'ui',
          styles: [
            style(
              'body',
              '13px',
              1.6,
              400,
              null,
              'Body prose, one reading measure (66ch).',
              'Each set names exactly one result set; several sets may name the same one.'
            ),
            style(
              'control-label',
              '12.5px',
              1.4,
              600,
              null,
              'Control label; field text in a 38px field is 12.5/500.',
              'Save recipe'
            ),
            style(
              'button-label',
              '11.52px',
              1.2,
              700,
              null,
              'Button label (the kit .k-btn).',
              'Add ingredient'
            ),
            style(
              'field-text',
              '11.5px',
              1.4,
              500,
              null,
              'Field text in compact fields, nav items.',
              'Recipes'
            ),
            style(
              'helper',
              '10.5px',
              1.5,
              400,
              null,
              'Helper line under a control (k-hint). Ink text-muted when it is running text.',
              'A template name must be unique.'
            ),
            style(
              'kicker',
              '8.5px',
              1.3,
              700,
              '0.11em',
              'Kicker: UPPERCASE, letter-spacing .11em, ink text-muted (accent variant inks accent). Sizes 8 / 8.5 / 9 only.',
              'INGREDIENTS'
            ),
          ],
        },
        {
          name: 'Mono — every number a GM compares or tunes',
          family: 'mono',
          styles: [
            style(
              'headline-figure',
              '18px',
              1.2,
              500,
              null,
              'Headline figure. Always tabular-nums.',
              '43'
            ),
            style(
              'emphasised-value',
              '13px',
              1.3,
              500,
              null,
              'Emphasised value (InfoStrip facts).',
              'DC 15'
            ),
            style('stepper-value', '11.5px', 1.3, 500, null, 'Stepper value, counts in nav.', '2'),
            style('expression', '10.5px', 1.4, 400, null, 'Roll expressions.', '1d20 + @str.mod'),
            style(
              'log-line',
              '9.5px',
              1.4,
              400,
              null,
              'Log lines, LogList time.',
              '+12 · 3 ticks ago'
            ),
          ],
        },
      ],
    },
    spacing: {
      note: 'Padding, margin and gap only. Radius, width, height, borders, font sizes, grid tracks and breakpoints are NOT spacing members. Exempt literals: 1px hairlines and one-off 34–42px fixed clearances.',
      tokens: spacing,
    },
    radius: {
      note: 'Radius tracks the size of the thing. Five rungs: 6, 7, 9, 11, 999.',
      tokens: radius,
    },
    shadow: { note: 'Elevation is only for things that float over content.', tokens: shadowTokens },
    controlHeight: {
      note: 'The closed control-height ladder: 26, 28, 30, 34, 38, 44. 32, 36 and 40 are retired as control heights.',
      tokens: control,
    },
    artSize: {
      note: 'Art (record tile, IconChip) and portrait (Avatar) ladders. Not controls; their corners follow this ladder, not the control rule.',
      tokens: [...art, ...portrait],
    },
  };
}

// The page compiles tokens.css itself on its first save; this first copy is laid out the same way
// so the previews render before anyone saves.
function buildTokensCss(tokens) {
  const first = THEMES[0][0];
  const cssVal = (v) => v.replace(/^\{(.+)\}$/, 'var(--$1)');
  const themed = [...tokens.color.tokens, ...tokens.shadow.tokens];
  const tc = ['/* Fabricate — generated from tokens.json */'];
  for (const f of tokens.type.fonts) {
    tc.push(
      `@font-face { font-family: "${f.family}"; src: url("${f.file.split('/').pop()}") format("woff2"); font-weight: ${f.weight}; font-style: ${f.style}; font-display: swap; }`
    );
  }
  tc.push(`:root, [data-theme="${first}"] {`);
  for (const t of themed)
    tc.push(`  --${t.name}: ${cssVal(typeof t.value === 'string' ? t.value : t.value[first])};`);
  tc.push('}');
  for (const [tid] of THEMES.slice(1)) {
    tc.push(`[data-theme="${tid}"] {`);
    for (const t of themed)
      if (typeof t.value !== 'string') tc.push(`  --${t.name}: ${cssVal(t.value[tid])};`);
    tc.push('}');
  }
  tc.push(':root {');
  for (const fam of ['spacing', 'radius', 'controlHeight', 'artSize']) {
    for (const t of tokens[fam].tokens) tc.push(`  --${t.name}: ${t.value};`);
  }
  for (const [k, v] of Object.entries(tokens.type.families)) tc.push(`  --font-${k}: ${v};`);
  tc.push('}');
  for (const g of tokens.type.groups) {
    for (const st of g.styles) {
      let decl = `font-family: var(--font-${st.family ?? g.family}); font-size: ${st.fontSize}; font-weight: ${st.fontWeight};`;
      if ('lineHeight' in st) decl += ` line-height: ${st.lineHeight};`;
      if ('letterSpacing' in st) decl += ` letter-spacing: ${st.letterSpacing};`;
      tc.push(`.${st.name} { ${decl} }`);
    }
  }
  return `${tc.join('\n')}\n`;
}

// ---------------------------------------------------------------- library → component cards

const COMPONENT_SECTIONS = [
  'Controls',
  'Pickers & bars',
  'Marks & atoms',
  'Surfaces',
  'Structures',
  'Composites',
  'Sets & groups',
  'Screen recipes',
];
const GROUP_LABEL = { 'Sets & groups': 'Sets & routing' };
const RENAME = {
  TheMarkVocabulary: 'MarkVocabulary',
  TheTwoSets: 'TwoSets',
  SimpleAndAlchemyTheReservedFailureGroup: 'ReservedFailureGroup',
  WhatEachModeAllows: 'ModeAllowances',
};
const CLASS_MAP = {
  stage: 'ds-stage',
  col: 'ds-col',
  b0: 'ds-b0',
  unit: 'ds-unit',
  cap: 'ds-cap',
  grow: 'ds-grow',
};

const remapClasses = (h) =>
  h.replaceAll(
    /class="([^"]*)"/g,
    (m, c) =>
      `class="${c
        .split(/\s+/)
        .filter(Boolean)
        .map((x) => CLASS_MAP[x] ?? x)
        .join(' ')}"`
  );

function parseCards(lib) {
  const sections = [...lib.matchAll(/<h2>([\s\S]*?)<\/h2>/g)].map((m) => [m.index, text(m[1])]);
  const sectionAt = (pos) => sections.findLast(([st]) => st <= pos)?.[1] ?? null;
  const cards = [];
  for (const m of lib.matchAll(/<div class="spec"/g)) {
    const sec = sectionAt(m.index);
    if (!COMPONENT_SECTIONS.includes(sec)) continue;
    const block = lib.slice(m.index, balancedDiv(lib, m.index));
    const headStart = block.indexOf('<div class="spec-head">');
    const head = block.slice(headStart, balancedDiv(block, headStart));
    const h4 = text(/<h4>([\s\S]*?)<\/h4>/.exec(head)[1]);
    const statuses = [...head.matchAll(/class="st st-(\w+)"/g)].map((x) => x[1]);
    const whyM = /class="why"[^>]*>([\s\S]*?)<\/p>/.exec(head);
    const why = whyM ? mdInline(whyM[1]) : '';
    const rest = block.slice(headStart + head.length);
    const stages = [];
    const notes = [];
    const deltas = [];
    let pos = 0;
    for (const cm of rest.matchAll(/<div class="(stage[^"]*|notes|delta[^"]*)"[^>]*>/g)) {
      if (cm.index < pos) continue;
      const e = balancedDiv(rest, cm.index);
      const frag = rest.slice(cm.index, e);
      if (cm[1].startsWith('stage')) stages.push(frag);
      else if (cm[1] === 'notes') notes.push(frag);
      else deltas.push([cm[1], frag]);
      pos = e;
    }
    const names = [...h4.matchAll(/<([A-Z]\w*)>/g)].map((x) => x[1]);
    let comp = names[0];
    if (!comp) {
      const words = h4
        .replace(/^[A-Z] · /, '')
        .replaceAll(/[^A-Za-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
      comp = words.map((x) => x[0].toUpperCase() + x.slice(1)).join('');
      comp = RENAME[comp] ?? comp;
    }
    if (stages.length === 0) continue;
    cards.push({ section: sec, h4, names, comp, statuses, why, stages, notes, deltas });
  }
  const seen = new Set();
  for (const c of cards) {
    if (!/^[A-Za-z_]\w*$/.test(c.comp) || seen.has(c.comp))
      throw new Error(`Bad or duplicate card name ${c.comp}`);
    seen.add(c.comp);
  }
  return cards;
}

const kitClasses = (frags) =>
  [
    ...new Set(
      frags.flatMap((f) =>
        [...f.matchAll(/class="([^"]*)"/g)].flatMap((m) =>
          m[1].split(/\s+/).filter((x) => x.startsWith('k-'))
        )
      )
    ),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

function cardPreview(c, sprite) {
  const stagesHtml = c.stages.map(remapClasses).join('\n');
  if (stagesHtml.toLowerCase().includes('</script'))
    throw new Error(`Script inside ${c.comp}'s specimen`);
  const page = c.section === 'Screen recipes' ? ' page' : '';
  const units = c.stages.reduce((n, s) => n + (s.match(/class="unit/g) ?? []).length, 0);
  const height = page ? 600 : Math.min(900, 140 + 60 * c.stages.length + 12 * units);
  const group = GROUP_LABEL[c.section] ?? c.section;
  const prev =
    `<!-- @dsCard group="${group}" height=${height} subtitle="${escapeHtml(c.h4.replaceAll('"', "'"))}"${page} -->\n` +
    `<div class="fab-root ds-specimen">\n${sprite}\n${stagesHtml}\n</div>\n` +
    '<script>/* static rendition from the Fabricate build reference; no runtime */</script>\n';
  if (Buffer.byteLength(prev) >= 256_000) throw new Error(`${c.comp} preview exceeds 256 KB`);
  return prev;
}

function cardReadme(c, byLib) {
  const lines = [];
  let first = c.why;
  if (!first) {
    first =
      c.section === 'Screen recipes'
        ? `The ${c.h4.split('· ').pop().toLowerCase()} archetype, built from the shared primitives.`
        : `${c.h4}: a shared Fabricate pattern.`;
  }
  lines.push(first, '');
  if (c.names.length > 0) {
    const st = [...c.statuses, ...Array.from({ length: 9 }, () => '')];
    lines.push(`**Library entry:** ${c.names.map((n, i) => `\`<${n}>\` — ${st[i]}`).join(', ')}`);
  } else {
    lines.push(`**Library entry:** ${c.h4} (${c.statuses.join(', ') || 'prose'})`);
  }
  const src = c.names.flatMap((n) =>
    (byLib.get(`<${n}>`) ?? []).map(
      (p) => `- \`<${n}>\` ships as \`${p.path}\` (${p.scope}, ${p.status})`
    )
  );
  if (src.length > 0) lines.push('', '**Shipped component:**', ...src);
  lines.push(
    '',
    'The preview is a static rendition of the library specimen, drawn with the kit classes in `components/bundle.css` at canonical geometry. In a prototype, copy its markup and keep its classes; do not restyle a kit class from a layout rule — place it.'
  );
  const kc = kitClasses(c.stages);
  if (kc.length > 0)
    lines.push('', `**Kit classes used:** ${kc.map((k) => `\`.${k}\``).join(', ')}`);
  for (const nf of c.notes) {
    for (const col of nf.matchAll(/<div[^>]*>\s*<h5>([\s\S]*?)<\/h5>([\s\S]*?)<\/div>/g)) {
      lines.push('', `## ${text(col[1])}`, '');
      for (const li of col[2].matchAll(/<li>([\s\S]*?)<\/li>/g)) lines.push(`- ${mdInline(li[1])}`);
    }
  }
  for (const [kind, df] of c.deltas) {
    const label = kind.includes('warn') ? 'Recorded divergence' : 'Note';
    lines.push('', `> **${label}.** ${mdInline(df.replaceAll(/^<div[^>]*>|<\/div>$/g, ''), true)}`);
  }
  return `# ${c.comp}\n\n${lines.join('\n').trim()}\n`;
}

function buildBundleCss(libCss) {
  let kit = libCss.slice(libCss.indexOf('/* THE KIT'));
  kit = kit.slice(0, kit.lastIndexOf('@media(max-width:900px){.shell')).trimEnd();
  kit = kit
    .replace('.unit>.k-step{align-self:flex-start}', '')
    .replace('.grow{flex:1;min-width:0}', '');
  const css = `/* Fabricate — component kit. The kit rules below are copied verbatim from
   openspec/specs/design-system/library.html ("THE KIT — these rules are the spec").
   Colours, space and type come from tokens.css (generated from tokens.json). */
@import url("https://fonts.googleapis.com/css2?family=Signika:wght@400;500;600;700&display=swap");

/* Face bridges: the kit reads the product names; tokens.css declares --font-<key>. */
:root {
  --fab-font-serif: var(--font-serif);
  --fab-font-mono: var(--font-mono);
  --page-ui-face: var(--font-ui);
  /* The one motion: a control's state change. */
  --fab-motion-control: 140ms ease;
}

/* Root of any Fabricate surface in a prototype. */
.fab-root {
  background: var(--fab-bg-0);
  color: var(--fab-text);
  font-family: var(--page-ui-face);
  font-size: 13px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.fab-root *, .fab-root *::before, .fab-root *::after { box-sizing: border-box; margin: 0; padding: 0; }
.fab-root :where(button, input, select, textarea) { font-family: inherit; font-size: inherit; color: inherit; }
.fab-root :focus-visible { outline: 2px solid var(--fab-accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .fab-root, .fab-root * { transition: none !important; animation: none !important; } }

/* Icons: a stroked SVG glyph at 1em (specimen stand-in for Font Awesome). */
.sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
.i { width: 1em; height: 1em; display: inline-block; vertical-align: -.125em; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

/* Specimen layout (library .stage / .unit / .cap, renamed ds-*). */
.ds-specimen { min-height: 100%; }
.ds-stage { padding: 20px 16px; background: var(--fab-bg-1); display: flex; flex-wrap: wrap; gap: 18px 22px; align-items: flex-start; }
.ds-stage + .ds-stage { border-top: 1px solid var(--fab-border); }
.ds-stage.ds-col { flex-direction: column; align-items: stretch; }
.ds-stage.ds-b0 { background: var(--fab-bg-0); }
.ds-unit { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.ds-unit > .ds-cap { font-family: var(--fab-font-mono); font-size: 9px; font-weight: 500; letter-spacing: .1em; text-transform: uppercase; color: var(--fab-text-subtle); }
.ds-unit > .k-step { align-self: flex-start; }
.ds-grow { flex: 1; min-width: 0; }
.fab-root code { font-family: var(--fab-font-mono); font-size: 11.5px; background: var(--fab-surface-soft); padding: 1px 5px; border-radius: 4px; }

${kit}
`;
  if (css.toLowerCase().includes('</style'))
    throw new Error('bundle.css would close an inline <style>');
  return css;
}

function buildRouting(lib) {
  const sec = (name) => {
    const i = lib.indexOf(`<h2>${name}`);
    const j = lib.indexOf('<section', i);
    return lib.slice(i, j > 0 ? j : lib.length);
  };
  const r = [
    '# Which one do I use?',
    '',
    'The near-neighbour pairs that caused drift in the first place. Route a new case through this table before drawing anything; if a case is not routable here, that is a gap in the system — raise it rather than inventing a variant.',
    '',
    '| You need to | Use | Not |',
    '| --- | --- | --- |',
  ];
  for (const tr of sec('Which one do I use?').matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
    if (tds.length === 3)
      r.push(`| ${tds.map((x) => mdInline(x).replaceAll('|', String.raw`\|`)).join(' | ')} |`);
  }
  r.push(
    '',
    '## Ruled out',
    '',
    'Candidates reviewed and declined: each is a composition of parts already in the set, one-screen furniture, a surface Foundry already owns, or a second name merged into an existing entry. Do not re-propose them in a prototype — compose as stated.',
    ''
  );
  const ro = sec('Ruled out');
  for (const wl of ro.matchAll(/<div class="k-well">/g)) {
    const blk = ro.slice(wl.index, balancedDiv(ro, wl.index));
    const tag = text(/class="tag[^"]*">([\s\S]*?)<\/span>/.exec(blk)[1]);
    const nm = text(/class="k-mono"[^>]*>([\s\S]*?)<\/span>/.exec(blk)[1]);
    const body = mdInline(/<p[^>]*>([\s\S]*?)<\/p>/.exec(blk)[1], true);
    r.push(`- **${tag}** · \`${nm}\` — ${body}`);
  }
  return `${r.join('\n')}\n`;
}

// ---------------------------------------------------------------- measuring

async function measureHeights(project, comps, executablePath) {
  const { chromium } = await import('playwright');
  const tokens = readFileSync(join(project, 'tokens.css'), 'utf8').replaceAll(
    'url("',
    `url("file://${join(project, 'fonts')}/`
  );
  const bundle = readFileSync(join(project, 'components/bundle.css'), 'utf8');
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const heights = {};
  try {
    for (const c of comps) {
      const prev = readFileSync(join(project, 'components', c, 'preview.html'), 'utf8');
      await page.setContent(
        `<!doctype html><html data-theme="fabricate"><head><style>${tokens}</style><style>${bundle}</style><style>html,body{margin:0;background:var(--fab-bg-0)}</style></head><body>${prev}</body></html>`
      );
      await page.waitForTimeout(150);
      heights[c] = await page.evaluate(() =>
        Math.ceil(globalThis.document.querySelector('.fab-root').getBoundingClientRect().height)
      );
    }
  } finally {
    await browser.close();
  }
  return heights;
}

// ---------------------------------------------------------------- main

function copyTree(src, dst) {
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    if (statSync(s).isDirectory()) copyTree(s, d);
    else {
      mkdirSync(dirname(d), { recursive: true });
      copyFileSync(s, d);
    }
  }
}

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.out) {
    console.log(
      'Usage: node scripts/design-system-artifact.mjs --out <dir> [--measure] [--chromium <path>]'
    );
    process.exit(opts.help ? 0 : 1);
  }
  const out = resolve(opts.out);
  const project = join(out, 'project');
  rmSync(project, { recursive: true, force: true });
  mkdirSync(project, { recursive: true });
  const write = (rel, body) => {
    mkdirSync(dirname(join(project, rel)), { recursive: true });
    writeFileSync(join(project, rel), body);
  };
  const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim();
  const ref = `${git('rev-parse', '--abbrev-ref', 'HEAD')}@${git('rev-parse', '--short', 'HEAD')}`;

  const tokens = buildTokens(readFileSync(join(REPO, 'styles/fabricate-tokens.css'), 'utf8'), ref);
  write('tokens.json', `${JSON.stringify(tokens, null, 2)}\n`);
  write('tokens.css', buildTokensCss(tokens));

  for (const f of [
    'spectral-latin-600-normal.woff2',
    'spectral-latin-700-normal.woff2',
    'jetbrains-mono-latin-400-normal.woff2',
    'jetbrains-mono-latin-500-normal.woff2',
  ]) {
    mkdirSync(join(project, 'fonts'), { recursive: true });
    copyFileSync(join(REPO, 'assets/fonts', f), join(project, 'fonts', f));
  }
  for (const f of ['OFL-Spectral.txt', 'OFL-JetBrainsMono.txt']) {
    mkdirSync(join(project, 'assets/Licences'), { recursive: true });
    copyFileSync(join(REPO, 'assets/fonts', f), join(project, 'assets/Licences', f));
  }

  const lib = readFileSync(join(REPO, 'openspec/specs/design-system/library.html'), 'utf8');
  const libCss = [...lib.matchAll(/<style>([\s\S]*?)<\/style>/g)][1][1];
  const sprite = /<svg class="sprite"[\s\S]*?<\/svg>/.exec(lib)[0];
  const prims = JSON.parse(
    readFileSync(join(REPO, 'scripts/lib/designSystemPrimitives.json'), 'utf8')
  ).designSystemPrimitives;
  const byLib = new Map();
  for (const p of prims) if (p.library) byLib.set(p.library, [...(byLib.get(p.library) ?? []), p]);

  const cards = parseCards(lib);
  for (const c of cards) {
    write(`components/${c.comp}/preview.html`, cardPreview(c, sprite));
    write(`components/${c.comp}/README.md`, cardReadme(c, byLib));
  }
  write('components/bundle.css', buildBundleCss(libCss));
  write('routing.md', buildRouting(lib));
  copyTree(STATIC, project);

  if (opts.measure) {
    const heights = await measureHeights(
      project,
      cards.map((c) => c.comp),
      opts.chromium
    );
    for (const c of cards) {
      const f = join(project, 'components', c.comp, 'preview.html');
      const h = Math.max(40, Math.min(4000, heights[c.comp] ?? 200));
      writeFileSync(f, readFileSync(f, 'utf8').replace(/height=\d+/, `height=${h}`));
    }
  }

  // The index. Asset records name uploads already in the artifact's store (assets.json); a new
  // image is uploaded first and its record added there.
  const assets = JSON.parse(readFileSync(ASSETS, 'utf8'));
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const index = {
    v: 3,
    layout: 'files',
    createdOnFiles: assets.createdOnFiles,
    title: 'Fabricate',
    namespace: 'Fabricate',
    libraries: [],
    sections: {},
    groups: assets.groups,
    assetGroups: assets.assetGroups,
    blobs: {},
    docs: { readme: 'project/README.md', sections: [] },
    lastChange: {
      by: 'Claude',
      at: now,
      via: `GitHub · mistersilver-uk/fabricate@${git('rev-parse', '--short', 'HEAD')}`,
      note: 'Regenerated by scripts/design-system-artifact.mjs.',
    },
  };
  write('design-system.json', `${JSON.stringify(index, null, 2)}\n`);

  const files = Object.fromEntries(
    listFiles(project)
      .map((p) => relative(out, p))
      .filter((p) => p !== 'project/design-system.json')
      .map((p) => [p, p])
  );
  writeFileSync(join(out, 'files.json'), `${JSON.stringify(files, null, 2)}\n`);
  console.log(
    `Wrote ${cards.length} component cards and ${Object.keys(files).length + 1} files to ${project}`
  );
  if (!existsSync(join(project, 'README.md')))
    throw new Error('README.md missing from the static tree');
}

await main();
