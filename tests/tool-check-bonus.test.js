// Unit tests for the per-tool check-bonus helpers (src/systems/toolCheckBonus.js):
// gate-mode / bonus-mode normalization, prerequisite gating, bonus-term
// composition (always / never / highestOnly), failed-expression → 0, and the
// labeled-term formula append.
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  normalizeToolGateMode,
  normalizeToolBonusModes,
  toolPrerequisitesPass,
  isToolUsabilityBlocked,
  evaluateToolBonusTerms,
  appendBonusTermsToFormula,
} = await import('../src/systems/toolCheckBonus.js');

// Deterministic injectable evaluator: resolves an expression to the number after
// a '=' marker ("=3" → 3), throws on "boom", yields NaN-ish junk on "junk".
async function stubEvaluator({ expression }) {
  if (expression === 'boom') throw new Error('bad formula');
  if (expression === 'junk') return 'not-a-number';
  if (expression.startsWith('=')) return Number(expression.slice(1));
  return null;
}

function tool(id, { bonus = '', mode, prereqs = [], gateMode } = {}) {
  return {
    id,
    label: `Tool ${id}`,
    bonusExpression: bonus,
    prerequisites: prereqs,
    ...(gateMode && { gateMode }),
    ...(mode && { __mode: mode }),
  };
}

// Silence the module's console.warn during tests that intentionally trigger it,
// while capturing the messages for assertion.
function captureWarns(fn) {
  const warns = [];
  const original = console.warn;
  console.warn = (...args) => warns.push(args.map(String).join(' '));
  return Promise.resolve()
    .then(fn)
    .then((result) => {
      console.warn = original;
      return { result, warns };
    })
    .catch((error) => {
      console.warn = original;
      throw error;
    });
}

// ── normalization ───────────────────────────────────────────────────────────

test('normalizeToolGateMode: only the exact usability token opts in; everything else is bonus', () => {
  assert.equal(normalizeToolGateMode('usability'), 'usability');
  assert.equal(normalizeToolGateMode('bonus'), 'bonus');
  assert.equal(normalizeToolGateMode(undefined), 'bonus');
  assert.equal(normalizeToolGateMode('USABILITY'), 'bonus');
  assert.equal(normalizeToolGateMode(42), 'bonus');
});

test('normalizeToolBonusModes: keeps only valid modes keyed by non-empty ids', () => {
  assert.deepEqual(
    normalizeToolBonusModes({
      a: 'always',
      b: 'never',
      c: 'highestOnly',
      d: 'sometimes', // unknown mode dropped
      '': 'always', // empty id dropped
      '  ': 'never', // blank id dropped
    }),
    { a: 'always', b: 'never', c: 'highestOnly' }
  );
});

test('normalizeToolBonusModes: non-object / array / nullish input → {}', () => {
  assert.deepEqual(normalizeToolBonusModes(null), {});
  assert.deepEqual(normalizeToolBonusModes(undefined), {});
  assert.deepEqual(normalizeToolBonusModes(['always']), {});
  assert.deepEqual(normalizeToolBonusModes('always'), {});
});

// ── prerequisite gating ─────────────────────────────────────────────────────

test('toolPrerequisitesPass: no prerequisites always passes', () => {
  assert.equal(toolPrerequisitesPass({ prerequisites: [] }, {}), true);
  assert.equal(toolPrerequisitesPass({}, {}), true);
  assert.equal(toolPrerequisitesPass(null, {}), true);
});

test('toolPrerequisitesPass: AND semantics over the shared prerequisite shape', () => {
  const prereqs = [
    { id: 'p1', path: 'skills.smi.rank', op: 'gte', value: 2 },
    { id: 'p2', path: 'flags.certified', op: 'isTrue' },
  ];
  const warn = () => {};
  assert.equal(
    toolPrerequisitesPass(
      { prerequisites: prereqs },
      { skills: { smi: { rank: 3 } }, flags: { certified: true } },
      { warn }
    ),
    true
  );
  assert.equal(
    toolPrerequisitesPass(
      { prerequisites: prereqs },
      { skills: { smi: { rank: 1 } }, flags: { certified: true } },
      { warn }
    ),
    false
  );
});

test('isToolUsabilityBlocked: blocks only usability-gated tools with failing prereqs', async () => {
  const failingPrereq = [{ id: 'p1', path: 'skills.smi.rank', op: 'gte', value: 2 }];
  const poorActor = { getRollData: () => ({ skills: { smi: { rank: 0 } } }) };
  const skilledActor = { getRollData: () => ({ skills: { smi: { rank: 5 } } }) };

  const { result } = await captureWarns(() => {
    const usability = { gateMode: 'usability', prerequisites: failingPrereq };
    const bonus = { gateMode: 'bonus', prerequisites: failingPrereq };
    return {
      usabilityBlocked: isToolUsabilityBlocked(usability, poorActor),
      usabilityPassing: isToolUsabilityBlocked(usability, skilledActor),
      bonusNeverBlocked: isToolUsabilityBlocked(bonus, poorActor),
      noPrereqs: isToolUsabilityBlocked({ gateMode: 'usability', prerequisites: [] }, poorActor),
    };
  });
  assert.equal(result.usabilityBlocked, true);
  assert.equal(result.usabilityPassing, false);
  assert.equal(result.bonusNeverBlocked, false);
  assert.equal(result.noPrereqs, false);
});

// ── bonus-term composition ──────────────────────────────────────────────────

test('evaluateToolBonusTerms: sum of always + max of highestOnly, never ignored', async () => {
  const tools = [
    tool('a1', { bonus: '=2' }), // always (unmapped default)
    tool('a2', { bonus: '=1' }), // always (explicit)
    tool('n1', { bonus: '=5' }), // never → ignored
    tool('h1', { bonus: '=3' }), // highestOnly (loses)
    tool('h2', { bonus: '=4' }), // highestOnly (wins)
  ];
  const terms = await evaluateToolBonusTerms({
    tools,
    bonusModes: { a2: 'always', n1: 'never', h1: 'highestOnly', h2: 'highestOnly' },
    actor: null,
    evaluateExpression: stubEvaluator,
  });
  assert.deepEqual(terms, [
    { toolId: 'a1', label: 'Tool a1', value: 2 },
    { toolId: 'a2', label: 'Tool a2', value: 1 },
    { toolId: 'h2', label: 'Tool h2', value: 4 },
  ]);
});

test('evaluateToolBonusTerms: highestOnly tie keeps the first (author order)', async () => {
  const terms = await evaluateToolBonusTerms({
    tools: [tool('h1', { bonus: '=3' }), tool('h2', { bonus: '=3' })],
    bonusModes: { h1: 'highestOnly', h2: 'highestOnly' },
    evaluateExpression: stubEvaluator,
  });
  assert.deepEqual(terms, [{ toolId: 'h1', label: 'Tool h1', value: 3 }]);
});

test('evaluateToolBonusTerms: empty expression and zero-valued terms contribute nothing', async () => {
  const terms = await evaluateToolBonusTerms({
    tools: [tool('t1'), tool('t2', { bonus: '   ' }), tool('t3', { bonus: '=0' })],
    evaluateExpression: stubEvaluator,
  });
  assert.deepEqual(terms, []);
});

test('evaluateToolBonusTerms: failed prerequisites → no bonus (gateMode bonus)', async () => {
  const prereqs = [{ id: 'p1', path: 'skills.smi.rank', op: 'gte', value: 2 }];
  const terms = await evaluateToolBonusTerms({
    tools: [tool('t1', { bonus: '=2', prereqs })],
    actor: { getRollData: () => ({ skills: { smi: { rank: 0 } } }) },
    evaluateExpression: stubEvaluator,
    prereqOptions: { warn: () => {} },
  });
  assert.deepEqual(terms, []);
});

test('evaluateToolBonusTerms: passing prerequisites keep the bonus', async () => {
  const prereqs = [{ id: 'p1', path: 'skills.smi.rank', op: 'gte', value: 2 }];
  const terms = await evaluateToolBonusTerms({
    tools: [tool('t1', { bonus: '=2', prereqs })],
    actor: { getRollData: () => ({ skills: { smi: { rank: 3 } } }) },
    evaluateExpression: stubEvaluator,
  });
  assert.deepEqual(terms, [{ toolId: 't1', label: 'Tool t1', value: 2 }]);
});

test('evaluateToolBonusTerms: a throwing expression → 0 with a console.warn', async () => {
  const { result, warns } = await captureWarns(() =>
    evaluateToolBonusTerms({
      tools: [tool('t1', { bonus: 'boom' }), tool('t2', { bonus: '=2' })],
      evaluateExpression: stubEvaluator,
    })
  );
  assert.deepEqual(result, [{ toolId: 't2', label: 'Tool t2', value: 2 }]);
  assert.equal(warns.some((line) => line.includes('failed to evaluate')), true);
});

test('evaluateToolBonusTerms: a non-numeric expression result → 0 with a console.warn', async () => {
  const { result, warns } = await captureWarns(() =>
    evaluateToolBonusTerms({
      tools: [tool('t1', { bonus: 'junk' })],
      evaluateExpression: stubEvaluator,
    })
  );
  assert.deepEqual(result, []);
  assert.equal(warns.some((line) => line.includes('did not evaluate to a number')), true);
});

test('evaluateToolBonusTerms: negative bonuses survive composition (a hindering tool)', async () => {
  const terms = await evaluateToolBonusTerms({
    tools: [tool('t1', { bonus: '=-2' })],
    evaluateExpression: stubEvaluator,
  });
  assert.deepEqual(terms, [{ toolId: 't1', label: 'Tool t1', value: -2 }]);
});

test('evaluateToolBonusTerms: default evaluator falls back to a numeric literal headless', async () => {
  // No globalThis.Roll in this test process by default; ensure it is absent.
  const hadRoll = 'Roll' in globalThis;
  const savedRoll = globalThis.Roll;
  delete globalThis.Roll;
  try {
    const terms = await evaluateToolBonusTerms({
      tools: [tool('t1', { bonus: '2' })],
    });
    assert.deepEqual(terms, [{ toolId: 't1', label: 'Tool t1', value: 2 }]);
  } finally {
    if (hadRoll) globalThis.Roll = savedRoll;
  }
});

// ── formula append ──────────────────────────────────────────────────────────

test('appendBonusTermsToFormula: appends labeled numeric terms in order', () => {
  assert.equal(
    appendBonusTermsToFormula('1d20 + @prof', [
      { label: "Smith's Tools", value: 2 },
      { label: 'Masterwork Anvil', value: 1 },
    ]),
    "1d20 + @prof + 2[Smith's Tools] + 1[Masterwork Anvil]"
  );
});

test('appendBonusTermsToFormula: negative terms subtract with the magnitude labeled', () => {
  assert.equal(appendBonusTermsToFormula('1d20', [{ label: 'Rusty Saw', value: -2 }]), '1d20 - 2[Rusty Saw]');
});

test('appendBonusTermsToFormula: sanitizes brackets out of labels so the parse never breaks', () => {
  assert.equal(
    appendBonusTermsToFormula('1d20', [{ label: 'Weird [Tool]', value: 3 }]),
    '1d20 + 3[Weird Tool]'
  );
});

test('appendBonusTermsToFormula: empty base or no terms returns the base unchanged', () => {
  assert.equal(appendBonusTermsToFormula('', [{ label: 'X', value: 2 }]), '');
  assert.equal(appendBonusTermsToFormula('1d20', []), '1d20');
  assert.equal(appendBonusTermsToFormula('1d20', [{ label: 'X', value: Number.NaN }]), '1d20');
});
