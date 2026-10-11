/**
 * Issue 2377 — the Primitive Lab's rail links scroll its own page instead of leaving it. The real
 * page, library and stylesheets are served by routing, with no lab server; only the boot is stubbed,
 * because the real one needs the chrome harvest and the defect is in the document.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { LAB_PAGE_PATH } from '../../scripts/lib/primitiveLabSmoke.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://primitive-lab.test';

/** The lab server's prefixes, as `tests/view-lab/vite.config.js` serves them, most specific first. */
const MOUNTS = [
  ['/@view-lab/', 'tests/view-lab'],
  ['/@fabricate-styles/', 'styles'],
  ['/@design-library/', 'openspec/specs/design-system'],
  ['/tests/', 'tests'],
];

const CONTENT_TYPES = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
};

const READY = 'data-navigation-ready';
const STUB_MOUNT_PATH = '/tests/view-lab/primitives/mount.js';

/** What `mount.js` does before its specimens, in its order: the scope class, the body, the sheet. */
const STUB_MOUNT = `import { PAGE_CLASS, readLibrary } from '/tests/view-lab/primitives/library.js';
document.body.classList.add(PAGE_CLASS);
const library = await readLibrary();
while (library.body.firstChild) document.body.append(document.adoptNode(library.body.firstChild));
const style = document.createElement('style');
style.dataset.plLibrary = '';
style.textContent = library.css;
document.head.append(style);
document.body.setAttribute('${READY}', '');
`;

/** The repository file one request path names, or null outside every mount. */
function repositoryFileFor(pathname) {
  const mount = MOUNTS.find(([prefix]) => pathname.startsWith(prefix));
  if (!mount) return null;
  const root = resolve(repoRoot, mount[1]);
  const target = resolve(root, decodeURIComponent(pathname.slice(mount[0].length)));
  if (!target.startsWith(root + sep)) return null;
  return existsSync(target) && statSync(target).isFile() ? target : null;
}

async function serve(route) {
  const { pathname } = new URL(route.request().url());
  if (pathname === STUB_MOUNT_PATH) {
    return route.fulfill({ contentType: CONTENT_TYPES['.js'], body: STUB_MOUNT });
  }
  const target = repositoryFileFor(pathname);
  if (!target) return route.fulfill({ status: 404, body: 'not found' });
  const contentType = CONTENT_TYPES[extname(target)] ?? 'application/octet-stream';
  return route.fulfill({ contentType, body: readFileSync(target) });
}

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
});

/** The first rail link after the first two whose section has a viewport of content after it. */
function scrollableTarget() {
  const end = document.documentElement.scrollHeight;
  for (const anchor of [...document.querySelectorAll('nav.rail a[href^="#"]')].slice(2)) {
    const section = document.querySelector(`#${CSS.escape(anchor.getAttribute('href').slice(1))}`);
    if (section && end - (section.getBoundingClientRect().top + scrollY) >= innerHeight) {
      return anchor.getAttribute('href');
    }
  }
  return null;
}

test('every rail link names the lab page, and clicking one scrolls that page', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    await context.route(`${ORIGIN}/**`, serve);
    const page = await context.newPage();
    await page.goto(`${ORIGIN}${LAB_PAGE_PATH}`);
    await page.waitForSelector(`body[${READY}]`);

    const links = await page.$$eval('nav.rail a[href^="#"]', (anchors) =>
      anchors.map((anchor) => `${anchor.getAttribute('href')} → ${new URL(anchor.href).pathname}`)
    );
    assert.ok(links.length >= 10, `the rail holds only ${links.length} links`);
    const leaving = links.filter((link) => !link.endsWith(` → ${LAB_PAGE_PATH}`));
    assert.deepEqual(leaving, [], 'these rail links resolve away from the lab page');

    const target = await page.evaluate(scrollableTarget);
    assert.ok(target, 'no rail section has a viewport of content after it');
    const link = page.locator(`nav.rail a[href="${target}"]`);
    await link.scrollIntoViewIfNeeded();
    const id = target.slice(1);
    const startTop = await page.evaluate((name) => {
      document.documentElement.dataset.primitiveLabMarker = 'same-document';
      return document.querySelector(`#${CSS.escape(name)}`).getBoundingClientRect().top;
    }, id);

    await link.click();
    await page.waitForURL((url) => url.hash === target);
    const landed = await page.evaluate(() => ({
      marker: document.documentElement.dataset.primitiveLabMarker,
      pathname: location.pathname,
      hash: location.hash,
    }));
    assert.deepEqual(landed, { marker: 'same-document', pathname: LAB_PAGE_PATH, hash: target });

    const top = await page.waitForFunction(
      (name) => {
        const reached = document.querySelector(`#${CSS.escape(name)}`).getBoundingClientRect().top;
        return reached >= -1 && reached <= innerHeight / 4 && { reached };
      },
      id,
      { timeout: 5000 }
    );
    const { reached } = await top.jsonValue();
    assert.ok(reached < startTop, `${target} did not move up from ${startTop}px`);
  } finally {
    await context.close();
  }
});
