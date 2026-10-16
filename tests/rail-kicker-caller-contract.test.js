/** Issue 2257 (D11): no caller restyles the rail kicker; `Rail.svelte` is its only author. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from './helpers/styleBlockScan.js';

const PRIMITIVE = 'src/ui/svelte/components/Rail.svelte';

/** Names the kicker, or reaches into a rail section past its root (`.fab-rail > p`, `.fab-rail *`). */
const REACHES_THE_KICKER = [
  /\.fab-rail-label(?![\w-])/u,
  /\.fab-rail(?![\w-])\)?\s*[\s>+~]\s*[^\s,{]/u,
];

const reaches = (selector) =>
  splitSelectorList(selector).some((item) =>
    REACHES_THE_KICKER.some((pattern) => pattern.test(item))
  );

test('no stylesheet but the primitive styles the rail kicker (issue 2257)', () => {
  const corpus = collectStyleCorpus();
  assert.ok(
    rulesIn(corpus[PRIMITIVE] ?? '').some((rule) => reaches(rule.selector)),
    'the scan must reach the primitive own .fab-rail-label rule, or an empty result proves nothing'
  );
  const offenders = Object.entries(corpus)
    .filter(([file]) => file !== PRIMITIVE)
    .flatMap(([file, css]) =>
      rulesIn(css)
        .filter((rule) => reaches(rule.selector))
        .map((rule) => `${file}:${rule.line} ${rule.selector}`)
    );
  assert.deepEqual(
    offenders,
    [],
    'the rail kicker is Rail.svelte own (muted ink, 8.5px, 0.11em, 2px foot); a caller may set the ' +
      'section gap on .fab-rail but never restyle the label'
  );
});
