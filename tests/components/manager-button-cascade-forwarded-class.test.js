/** The cascade credits an ancestor class a caller forwards through `class` (issue 1483). */
import assert from 'node:assert/strict';
import test from 'node:test';

import { managerButtonCascade } from '../helpers/manager-button-cascade.js';

const CALLER = 'src/ui/svelte/probe/Caller.svelte';
const CHILD = 'src/ui/svelte/probe/Child.svelte';
const OTHER = 'src/ui/svelte/probe/Other.svelte';
const SHEET = 'styles/fabricate.css';
const RULE = `${SHEET}#.probe-row .fabricate-button`;

/** `Caller` renders `<tag class="row" />`; `Child` puts its `class` on the box around a button. */
function cascadeOver({ tag = 'Child', row = 'probe-row' } = {}) {
  const sources = {
    [CALLER]:
      `<script>\n  import ${tag} from './${tag}.svelte';\n</script>\n\n` +
      `<${tag} class="${row}" />\n`,
    [CHILD]:
      "<script>\n  let { class: className = '' } = $props();\n</script>\n\n" +
      '<div class={className}>' +
      '<button class="fabricate-button fab-manager-button">Go</button></div>\n',
    [OTHER]: '<div class="other"></div>\n',
    [SHEET]: '.probe-row .fabricate-button { font-size: 0.72rem; }\n',
  };
  return managerButtonCascade({
    corpus: { files: [CALLER, CHILD, OTHER], sources, sheet: sources[SHEET] },
  });
}

test('a class forwarded to the child rendering the site leaves the rule unresolved', () => {
  const candidate = cascadeOver().candidateFor(RULE);
  assert.ok(candidate, `${RULE} dropped out of candidates although Caller can supply .probe-row`);
  assert.deepEqual(
    candidate.matches.map(({ state, providers }) => ({ state, providers })),
    [{ state: 'unresolved', providers: [`${CALLER}:5`] }]
  );
});

test('another forwarded class, or one on a component not rendering the site, provides none', () => {
  const otherRow = cascadeOver({ row: 'other-row' });
  assert.ok(otherRow.ruleFor(RULE), 'the rule is still parsed');
  assert.ok(!otherRow.candidateFor(RULE), 'another class provides nothing');
  assert.ok(!cascadeOver({ tag: 'Other' }).candidateFor(RULE), 'Other never renders Child');
});
