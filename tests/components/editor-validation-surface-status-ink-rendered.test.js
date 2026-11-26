/**
 * Issue 3037 — a validation row's status icon takes the `-text` ink of its severity, the tone the
 * `<ValidationSummary>` specimen draws it in, in every palette the module sheet ships, and not the
 * bare `--fab-success|--fab-warning|--fab-danger` the rules read before.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const INKS = Object.freeze({
  pass: ['--fab-success-text', '--fab-success'],
  warn: ['--fab-warning-text', '--fab-warning'],
  block: ['--fab-danger-text', '--fab-danger'],
});

const THEMES = Object.freeze([
  ...new Set(
    [
      ...readFileSync(resolve(repoRoot, 'styles/fabricate-tokens.css'), 'utf8').matchAll(
        /^\.fabricate\[data-fabricate-theme="([a-z-]+)"\]/gmu
      ),
    ].map((match) => match[1])
  ),
]);

const row = (status) => `<li class="manager-recipe-val-row is-${status}">
  <i class="manager-recipe-val-status fas fa-circle-check" data-ink="${status}"></i></li>`;

const page = () => `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
</head><body class="game">
${THEMES.map(
  (
    theme
  ) => `<div class="fabricate fabricate-manager" data-fabricate-theme="${theme}" data-theme-case="${theme}">
  ${Object.entries(INKS)
    .map(
      ([
        status,
        [text, bare],
      ]) => `<span data-probe="${status}-text" style="color:var(${text})"></span>
  <span data-probe="${status}-bare" style="color:var(${bare})"></span>`
    )
    .join('\n')}
  <section class="fabricate-validation"><ul>${Object.keys(INKS).map(row).join('')}</ul></section>
</div>`
).join('\n')}
</body></html>`;

/** Each theme's computed icon colour per status, and the two probe colours it is compared with. */
function readInks() {
  const color = (node) => getComputedStyle(node).color;
  return Object.fromEntries(
    [...document.querySelectorAll('[data-theme-case]')].map((host) => [
      host.dataset.themeCase,
      Object.fromEntries(
        ['pass', 'warn', 'block'].map((status) => [
          status,
          {
            icon: color(host.querySelector(`[data-ink="${status}"]`)),
            text: color(host.querySelector(`[data-probe="${status}-text"]`)),
            bare: color(host.querySelector(`[data-probe="${status}-bare"]`)),
          },
        ])
      ),
    ])
  );
}

let browser;
let inks;

before(async () => {
  browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(page(), { waitUntil: 'load' });
  inks = await tab.evaluate(readInks);
});

after(async () => {
  await browser?.close();
});

it('reads every palette the token sheet ships', () => {
  assert.ok(THEMES.length >= 7, `only ${THEMES.length} palettes were found: ${THEMES.join(', ')}`);
  assert.deepEqual(Object.keys(inks), THEMES);
});

it('inks each status icon in its severity’s `-text` token, in every palette', () => {
  for (const [theme, statuses] of Object.entries(inks)) {
    for (const [status, { icon, text }] of Object.entries(statuses)) {
      assert.equal(icon, text, `${theme} ${status}: ${INKS[status][0]}`);
    }
  }
});

it('differs from the bare token the rules read before, wherever the two tokens differ', () => {
  const differing = Object.values(inks).flatMap((statuses) =>
    Object.values(statuses).filter(({ text, bare }) => text !== bare)
  );
  assert.ok(differing.length > 0, 'the `-text` and bare tokens resolve alike everywhere');
  for (const [theme, statuses] of Object.entries(inks)) {
    for (const [status, { icon, text, bare }] of Object.entries(statuses)) {
      if (text !== bare)
        assert.notEqual(icon, bare, `${theme} ${status} still reads ${INKS[status][1]}`);
    }
  }
});
