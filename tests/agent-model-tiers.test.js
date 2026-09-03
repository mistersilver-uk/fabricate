import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  HIGH_RISK_PATHS,
  STAGE_THRESHOLDS,
  TIER_MODELS,
  UNTIERED_ROLE_TIERS,
  familyCompletenessErrors,
  isReadonlyBashAllowed,
  matchesHighRiskPath,
  modelPinErrors,
  parseBindingsTable,
  resolveRole,
  selectModelTier,
  splitTieredToken,
} from '../scripts/lib/agentModelTiers.js';
import { main } from '../scripts/validate-agent-bindings.mjs';

// --- Fixtures ---------------------------------------------------------------
// The canonical roster: 6 model-tiered families x 3 model tiers, plus 3 untiered
// skill-backed roles and 1 Codex-only mapping role — 22 bindings-table rows,
// 21 skill-backed roles + 1 mapping role.

const TIERS = ['small', 'medium', 'large'];

const FAMILIES = [
  'fabricate_implementer',
  'fabricate_reviewer',
  'fabricate_domain_expert',
  'fabricate_ux_designer',
  'fabricate_quality_engineer',
  'foundry_integrator',
];

const UNTIERED = ['fabricate_orchestrator', 'fabricate_docs_writer', 'fabricate_competitive_analyst'];

const fileForm = (token) => token.replaceAll('_', '-');

const hasSkill = (family) => FAMILIES.includes(family) || UNTIERED.includes(family);

const bindingRow = (token, skillDir) =>
  `| \`${token}\` | \`.agents/skills/${skillDir}/SKILL.md\` ` +
  `| \`.codex/agents/${fileForm(token)}.toml\` | \`${fileForm(token)}\` |`;

/** Build a bindings table in the exact shape `parseBindingsTable` reads. */
function bindingsTable({ families = FAMILIES, tiers = TIERS } = {}) {
  const lines = [
    '| Routing token | Canonical skill (persona) | Codex binding | Claude `subagent_type` |',
    '|---|---|---|---|',
  ];
  for (const family of families) {
    for (const tier of tiers) lines.push(bindingRow(`${family}_${tier}`, fileForm(family)));
  }
  for (const token of UNTIERED) lines.push(bindingRow(token, fileForm(token)));
  lines.push(
    '| `fabricate_pr_explorer` | — (no shared skill; read-only mapping) ' +
      '| `.codex/agents/fabricate-pr-explorer.toml` | `Explore` (built-in) |'
  );
  return lines.join('\n');
}

/** Build the separate `Family` to model-tiers table that preserves the routing join. */
function familyTable({ families = FAMILIES, tiers = TIERS } = {}) {
  const lines = ['| Family | Model-tiered routing tokens |', '|---|---|'];
  for (const family of families) {
    const tokens = tiers.map((tier) => `\`${family}_${tier}\``).join(', ');
    lines.push(`| \`${family}\` | ${tokens} |`);
  }
  return lines.join('\n');
}

const agentsMd = (options = {}) =>
  [bindingsTable(options.bindings), '', familyTable(options.family)].join('\n');

const claudeBinding = ({ token, model, description }) =>
  [
    '---',
    `name: ${fileForm(token)}`,
    `description: ${description}`,
    'tools: Read, Grep, Glob, Edit, Write, Bash',
    `model: ${model}`,
    '---',
    '',
    'body',
  ].join('\n');

const codexBinding = ({ token, model, effort, description }) =>
  [
    `name = "${token}"`,
    `description = "${description}"`,
    `model = "${model}"`,
    `model_reasoning_effort = "${effort}"`,
    'sandbox_mode = "danger-full-access"',
  ].join('\n');

/** A well-formed pair of bindings for one model tier, before any deliberate drift. */
function bindingPair(tier, overrides = {}) {
  const token = overrides.token ?? `fabricate_implementer_${tier}`;
  const description = overrides.description ?? `A ${tier} implementation lane.`;
  return {
    token,
    tier,
    claudePath: `.claude/agents/${fileForm(token)}.md`,
    claudeText: claudeBinding({
      token,
      model: overrides.claudeModel ?? TIER_MODELS[tier].claude,
      description,
    }),
    codexPath: `.codex/agents/${fileForm(token)}.toml`,
    codexText: codexBinding({
      token,
      model: overrides.codexModel ?? TIER_MODELS[tier].codexModel,
      effort: overrides.effort ?? TIER_MODELS[tier].codexReasoningEffort,
      description,
    }),
  };
}

// --- 1. Provider pins -------------------------------------------------------

test('1. each model tier declares its Claude model, Codex model, and Codex reasoning effort', () => {
  assert.deepEqual(TIER_MODELS.small, {
    claude: 'haiku',
    codexModel: 'gpt-5.6-luna',
    codexReasoningEffort: 'low',
  });
  assert.deepEqual(TIER_MODELS.medium, {
    claude: 'sonnet',
    codexModel: 'gpt-5.6-terra',
    codexReasoningEffort: 'medium',
  });
  assert.deepEqual(TIER_MODELS.large, {
    claude: 'opus',
    codexModel: 'gpt-5.6-sol',
    codexReasoningEffort: 'high',
  });
  assert.deepEqual(Object.keys(TIER_MODELS), TIERS);
});

// --- 2. Every row token has a declared model tier ---------------------------

test('2. every bindings-table row token resolves to a declared model tier, none undefined', () => {
  // Driven through the exported parser, not a re-implemented row regex.
  const parsed = parseBindingsTable(agentsMd());
  assert.equal(parsed.rows.length, 22, 'the canonical roster is 22 bindings-table rows');
  assert.deepEqual(parsed.skipped, [], 'no row is silently skipped by the token pattern');

  const skillBacked = parsed.rows.filter((row) => row.cells.some((c) => c.includes('SKILL.md')));
  assert.equal(skillBacked.length, 21, '21 skill-backed roles');
  assert.equal(parsed.rows.length - skillBacked.length, 1, '+ 1 mapping role');

  for (const token of parsed.tokens) {
    const resolved = resolveRole(token, { tokens: parsed.tokens, hasSkill });
    assert.notEqual(resolved.declaredTier, undefined, `${token} model tier is undefined`);
    assert.notEqual(resolved.declaredTier, null, `${token} has no declared model tier`);
    assert.ok(TIERS.includes(resolved.declaredTier), `${token} declares an unknown model tier`);
  }

  // Every untiered skill-backed role AND the mapping role is in the map, so none
  // of them is a silent skip.
  const byName = (a, b) => a.localeCompare(b);
  const expectedUntiered = [...UNTIERED, 'fabricate_pr_explorer'].sort(byName);
  assert.deepEqual(Object.keys(UNTIERED_ROLE_TIERS).sort(byName), expectedUntiered);
});

// --- 3. Conditional base-family resolution ----------------------------------

test('3. a model-tiered token resolves to its base family skill, or falls back to the literal name', () => {
  const tokens = parseBindingsTable(agentsMd()).tokens;

  const tiered = resolveRole('fabricate_implementer_small', { tokens, hasSkill });
  assert.equal(tiered.tier, 'small');
  assert.equal(tiered.family, 'fabricate_implementer');
  assert.equal(tiered.skillDir, 'fabricate-implementer', 'one persona backs all three model tiers');
  assert.equal(tiered.roleBase, 'fabricate-implementer-small', 'bindings stay per model tier');
  assert.equal(tiered.viaFamily, true);

  const untiered = resolveRole('fabricate_orchestrator', { tokens, hasSkill });
  assert.equal(untiered.tier, null);
  assert.equal(untiered.skillDir, 'fabricate-orchestrator');
  assert.equal(untiered.declaredTier, 'large');
  assert.equal(untiered.viaFamily, false);

  // Literal fallback 1: the family declared all three model tiers but has no skill.
  const noSkill = ['fabricate_widget_small', 'fabricate_widget_medium', 'fabricate_widget_large'];
  const orphan = resolveRole('fabricate_widget_small', { tokens: noSkill, hasSkill });
  assert.equal(orphan.viaFamily, false);
  assert.equal(orphan.family, 'fabricate_widget_small');
  assert.equal(orphan.skillDir, 'fabricate-widget-small');

  // Literal fallback 2: the skill exists but the family is incomplete. This is what
  // removes the ambiguity a future family whose own name ends in `_small` creates.
  const partial = resolveRole('fabricate_implementer_small', {
    tokens: ['fabricate_implementer_small'],
    hasSkill,
  });
  assert.equal(partial.viaFamily, false);
  assert.equal(partial.skillDir, 'fabricate-implementer-small');

  // The split itself is unconditional — stage (a) never depends on stages (b)/(c).
  assert.deepEqual(splitTieredToken('fabricate_widget_large'), {
    base: 'fabricate_widget',
    tier: 'large',
  });
  assert.deepEqual(splitTieredToken('fabricate_orchestrator'), {
    base: 'fabricate_orchestrator',
    tier: null,
  });
});

// --- 4. Family completeness -------------------------------------------------

test('4. family completeness names the family and its missing model tiers', () => {
  const oneOfThree = familyCompletenessErrors({
    tokens: ['fabricate_implementer_small'],
    hasSkill,
  });
  assert.equal(oneOfThree.length, 1);
  assert.match(oneOfThree[0], /fabricate_implementer/);
  assert.match(oneOfThree[0], /medium/);
  assert.match(oneOfThree[0], /large/);
  assert.doesNotMatch(oneOfThree[0], /missing.*small/);

  const twoOfThree = familyCompletenessErrors({
    tokens: ['fabricate_implementer_small', 'fabricate_implementer_medium'],
    hasSkill,
  });
  assert.equal(twoOfThree.length, 1);
  assert.match(twoOfThree[0], /fabricate_implementer/);
  assert.match(twoOfThree[0], /large/);
  assert.doesNotMatch(twoOfThree[0], /medium/);

  // A complete family is silent, and a candidate whose skill does not exist is not
  // reported here — it is left to fall back to its literal name.
  const complete = familyCompletenessErrors({
    tokens: TIERS.map((tier) => `fabricate_implementer_${tier}`),
    hasSkill,
  });
  assert.deepEqual(complete, []);
  const noSkill = familyCompletenessErrors({ tokens: ['fabricate_widget_small'], hasSkill });
  assert.deepEqual(noSkill, []);
});

// --- 5. Read-only Bash exemption resolves against the base family -----------

test('5. the read-only Bash exemption survives all three foundry_integrator model tiers only', () => {
  for (const tier of TIERS) {
    assert.equal(isReadonlyBashAllowed(`foundry_integrator_${tier}`), true);
    assert.equal(isReadonlyBashAllowed(`fabricate_reviewer_${tier}`), false);
    assert.equal(isReadonlyBashAllowed(`fabricate_implementer_${tier}`), false);
  }
  assert.equal(isReadonlyBashAllowed('foundry_integrator'), true);
  assert.equal(isReadonlyBashAllowed('fabricate_orchestrator'), false);
});

// --- 6. Model-pin comparison ------------------------------------------------

test('6. model-pin comparison is exact and covers Codex model_reasoning_effort', () => {
  assert.deepEqual(modelPinErrors(bindingPair('small')), [], 'a correct pair is silent');

  const drifted = modelPinErrors(bindingPair('small', { codexModel: 'gpt-5.6-terra' }));
  assert.equal(drifted.length, 1);
  assert.match(drifted[0], /gpt-5\.6-luna/);

  // A superstring must NOT satisfy the pin — this is why the check is equality.
  const superstring = modelPinErrors(bindingPair('small', { codexModel: 'gpt-5.6-luna-preview' }));
  assert.equal(superstring.length, 1);
  assert.match(superstring[0], /gpt-5\.6-luna-preview/);

  const wrongClaude = modelPinErrors(bindingPair('small', { claudeModel: 'opus' }));
  assert.equal(wrongClaude.length, 1);
  assert.match(wrongClaude[0], /haiku/);

  const wrongEffort = modelPinErrors(bindingPair('small', { effort: 'medium' }));
  assert.equal(wrongEffort.length, 1);
  assert.match(wrongEffort[0], /model_reasoning_effort/);

  // A role with no declared model tier is an error, never a silent skip.
  const untieredRole = modelPinErrors({ token: 'fabricate_new_role', tier: null });
  assert.equal(untieredRole.length, 1);
  assert.match(untieredRole[0], /no declared model tier/);
});

// --- 7. The mapping role is gated on its Codex pin only ---------------------

test('7. the mapping role fabricate_pr_explorer is gated on its Codex pin only', () => {
  const token = 'fabricate_pr_explorer';
  const tier = UNTIERED_ROLE_TIERS[token];
  assert.equal(tier, 'small');

  const ok = modelPinErrors({
    token,
    tier,
    codexPath: '.codex/agents/fabricate-pr-explorer.toml',
    codexText: codexBinding({ token, model: 'gpt-5.6-luna', effort: 'low', description: 'Map.' }),
    requireClaude: false,
  });
  assert.deepEqual(ok, []);

  const drifted = modelPinErrors({
    token,
    tier,
    codexPath: '.codex/agents/fabricate-pr-explorer.toml',
    codexText: codexBinding({ token, model: 'gpt-5.5', effort: 'low', description: 'Map.' }),
    requireClaude: false,
  });
  assert.equal(drifted.length, 1);
  assert.match(drifted[0], /gpt-5\.6-luna/);

  // Claude's built-in Explore has no repository binding, so a Claude pin is never
  // consulted for this role even when text is supplied.
  const claudeIgnored = modelPinErrors({
    token,
    tier,
    claudePath: '.claude/agents/fabricate-pr-explorer.md',
    claudeText: claudeBinding({ token, model: 'opus', description: 'Map.' }),
    codexPath: '.codex/agents/fabricate-pr-explorer.toml',
    codexText: codexBinding({ token, model: 'gpt-5.6-luna', effort: 'low', description: 'Map.' }),
    requireClaude: false,
  });
  assert.deepEqual(claudeIgnored, []);
});

// --- 8. HIGH_RISK_PATHS matching is root-anchored ---------------------------

test('8. HIGH_RISK_PATHS matching is root-anchored, never a basename match', () => {
  assert.equal(matchesHighRiskPath('package.json'), true);
  assert.equal(matchesHighRiskPath('AGENTS.md'), true);
  assert.equal(matchesHighRiskPath('scripts/validate-agent-bindings.mjs'), true);
  assert.equal(matchesHighRiskPath('scripts/lib/agentModelTiers.js'), true);
  assert.equal(matchesHighRiskPath('.claude/agents/fabricate-implementer-small.md'), true);
  assert.equal(matchesHighRiskPath('src/migration/v3/step.js'), true);

  // The negative case the `**` semantics exist for.
  assert.equal(matchesHighRiskPath('src/ui/package.json'), false);
  assert.equal(matchesHighRiskPath('src/ui/AGENTS.md'), false);
  assert.equal(matchesHighRiskPath('lang/en.json'), false);
  assert.equal(matchesHighRiskPath('tests/agent-model-tiers.test.js'), false);
  // `**` matches one or more segments, so the bare prefix itself does not match.
  assert.equal(matchesHighRiskPath('scripts'), false);
  assert.equal(matchesHighRiskPath('src/migration'), false);
  // openspec/specs is deliberately NOT high-risk; it carries a medium floor instead.
  assert.equal(matchesHighRiskPath('openspec/specs/agentic-workflow/spec.md'), false);
  assert.ok(!HIGH_RISK_PATHS.includes('openspec/specs/**'));
});

// --- 9. The five worked examples -------------------------------------------

test('9. each worked example resolves to its stated model tier via its stated rule', () => {
  // Family tokens come from the exported parser, so a family rename breaks this test.
  const parsed = parseBindingsTable(agentsMd());
  const baseFamilies = new Set(parsed.tokens.map((token) => splitTieredToken(token).base));

  const examples = [
    {
      name: 'this change (#862), implementation lane — rule 1',
      family: 'fabricate_implementer',
      spawn: {
        stage: 'implementation',
        paths: [
          'AGENTS.md',
          '.claude/agents/fabricate-implementer-small.md',
          'scripts/validate-agent-bindings.mjs',
          'package.json',
        ],
        sizeMetric: 4,
        ruleTwoSource: 'new-module',
      },
      rule: 1,
      tier: 'large',
    },
    {
      name: 'plan-review of a UI change that also touches package.json, ux row-intersected — rule 6',
      family: 'fabricate_ux_designer',
      spawn: {
        stage: 'plan-review',
        paths: ['src/ui/svelte/Recipes.svelte', 'src/ui/svelte/Components.svelte'],
        sizeMetric: 5,
        ruleTwoSource: 'none',
      },
      rule: 6,
      tier: 'medium',
    },
    {
      name: 'the same change unintersected for the always-row reviewer — rule 1',
      family: 'fabricate_reviewer',
      spawn: {
        stage: 'plan-review',
        paths: ['src/ui/svelte/Recipes.svelte', 'src/ui/svelte/Components.svelte', 'package.json'],
        sizeMetric: 5,
        ruleTwoSource: 'none',
      },
      rule: 1,
      tier: 'large',
    },
    {
      name: 'a lang/en.json string correction, implementation lane — rule 5',
      family: 'fabricate_implementer',
      spawn: {
        stage: 'implementation',
        paths: ['lang/en.json'],
        sizeMetric: 1,
        ruleTwoSource: 'none',
      },
      rule: 5,
      tier: 'small',
    },
    {
      name: 'a Svelte component fix that adds an exported helper — rule 2',
      family: 'fabricate_implementer',
      spawn: {
        stage: 'implementation',
        paths: ['src/ui/svelte/Recipes.svelte'],
        sizeMetric: 1,
        ruleTwoSource: 'new-export',
      },
      rule: 2,
      tier: 'large',
    },
    {
      name: 'post-implementation review of a 2-file, 180-line src/systems diff — rule 6',
      family: 'fabricate_reviewer',
      spawn: {
        stage: 'post-implementation',
        paths: ['src/systems/dnd5e.js', 'src/systems/pf2e.js'],
        sizeMetric: 180,
        ruleTwoSource: 'none',
      },
      rule: 6,
      tier: 'medium',
    },
  ];

  for (const example of examples) {
    assert.ok(baseFamilies.has(example.family), `${example.family} is not a bindings-table family`);
    const resolved = selectModelTier(example.spawn);
    assert.equal(resolved.rule, example.rule, example.name);
    assert.equal(resolved.tier, example.tier, example.name);
  }

  // Rule 3 and rule 4 are reachable, and rule 6 is total even with nothing keyed.
  const threePaths = selectModelTier({
    stage: 'implementation',
    paths: ['a.js', 'b.js', 'c.js'],
    sizeMetric: 1,
    ruleTwoSource: 'none',
  });
  assert.deepEqual([threePaths.rule, threePaths.tier], [3, 'large']);
  const oversize = selectModelTier({
    stage: 'plan-review',
    paths: ['a.js'],
    sizeMetric: STAGE_THRESHOLDS['plan-review'].mediumMax + 1,
    ruleTwoSource: 'none',
  });
  assert.deepEqual([oversize.rule, oversize.tier], [4, 'large']);
  const unavailable = selectModelTier({ stage: 'implementation', paths: ['a.js'] });
  assert.deepEqual([unavailable.rule, unavailable.tier], [6, 'medium']);
});

// --- 10. `Family` table parity ---------------------------------------------

test('10. the Family table must name every base family and exactly its three model tiers', () => {
  const tokens = parseBindingsTable(agentsMd()).tokens;

  assert.deepEqual(familyCompletenessErrors({ tokens, hasSkill, agentsMdText: agentsMd() }), []);

  const missingFamily = familyCompletenessErrors({
    tokens,
    hasSkill,
    agentsMdText: agentsMd({ family: { families: FAMILIES.slice(0, 5) } }),
  });
  assert.equal(missingFamily.length, 1);
  assert.match(missingFamily[0], /missing a row for family foundry_integrator/);

  const twoTiers = familyCompletenessErrors({
    tokens,
    hasSkill,
    agentsMdText: agentsMd({ family: { tiers: ['small', 'medium'] } }),
  });
  assert.equal(twoTiers.length, FAMILIES.length);
  assert.match(twoTiers[0], /omits fabricate_implementer_large/);

  // Failing to LOCATE the table is itself an error, never a skip.
  const noTable = familyCompletenessErrors({ tokens, hasSkill, agentsMdText: bindingsTable() });
  assert.equal(noTable.length, 1);
  assert.match(noTable[0], /missing the Family to model tiers table/);
});

// --- 11. Model-tier floors --------------------------------------------------

test('11. model-tier floors only raise, clamp at large, and remember the executed model tier', () => {
  const smallSpawn = {
    stage: 'implementation',
    paths: ['lang/en.json'],
    sizeMetric: 1,
    ruleTwoSource: 'none',
  };
  assert.equal(selectModelTier(smallSpawn).tier, 'small');

  // A lane that actually executed at medium does not re-resolve to small from the
  // same unchanged facts — the ladder itself has no memory.
  const floored = selectModelTier({ ...smallSpawn, previousExecutedTier: 'medium' });
  assert.equal(floored.baseTier, 'small');
  assert.equal(floored.rule, 5);
  assert.equal(floored.tier, 'medium');

  // An unresolved finding floors one model tier above the executed model tier...
  const escalated = selectModelTier({
    ...smallSpawn,
    previousExecutedTier: 'small',
    unresolvedFinding: true,
  });
  assert.equal(escalated.tier, 'medium');

  // ...and every floor clamps at large.
  const clamped = selectModelTier({
    ...smallSpawn,
    previousExecutedTier: 'large',
    unresolvedFinding: true,
  });
  assert.equal(clamped.tier, 'large');

  // A keyed path set including openspec/specs/** floors at medium.
  const specs = selectModelTier({
    stage: 'implementation',
    paths: ['openspec/specs/agentic-workflow/spec.md'],
    sizeMetric: 1,
    ruleTwoSource: 'none',
  });
  assert.equal(specs.baseTier, 'small');
  assert.equal(specs.tier, 'medium');

  // A floor never lowers a base model tier.
  const large = selectModelTier({
    stage: 'implementation',
    paths: ['package.json'],
    sizeMetric: 1,
    ruleTwoSource: 'none',
    previousExecutedTier: 'small',
  });
  assert.equal(large.tier, 'large');
});

// --- 12. Descriptions name their own model tier and neither other ----------

test('12. a description naming all three model tiers is rejected for every model tier', () => {
  const description = 'Handles small, medium and large scoped work.';
  for (const tier of TIERS) {
    const errors = modelPinErrors(bindingPair(tier, { description }));
    assert.ok(errors.length > 0, `${tier} accepted a description naming all three model tiers`);
    const rejections = errors.filter((e) => /must not name model tier/.test(e));
    assert.equal(rejections.length, 2, `${tier} must reject both Claude and Codex descriptions`);
  }

  // The "contains its own" half still fires on its own.
  const silent = modelPinErrors(bindingPair('medium', { description: 'A medium lane.' }));
  assert.deepEqual(silent, []);
  const omitted = modelPinErrors(bindingPair('medium', { description: 'A lane.' }));
  assert.equal(omitted.length, 2);
  assert.match(omitted[0], /must name its own model tier \(medium\)/);

  // An untiered role carries no model-tier word requirement.
  const untiered = modelPinErrors({
    token: 'fabricate_orchestrator',
    tier: 'large',
    claudePath: '.claude/agents/fabricate-orchestrator.md',
    claudeText: claudeBinding({
      token: 'fabricate_orchestrator',
      model: 'opus',
      description: 'Owns routing and the iteration loops.',
    }),
    codexPath: '.codex/agents/fabricate-orchestrator.toml',
    codexText: codexBinding({
      token: 'fabricate_orchestrator',
      model: 'gpt-5.6-sol',
      effort: 'high',
      description: 'Owns routing and the iteration loops.',
    }),
  });
  assert.deepEqual(untiered, []);
});

// --- 13. The AGENTS.md <-> module mirror ------------------------------------
// `AGENTS.md` restates HIGH_RISK_PATHS, the SMALL_MAX/MEDIUM_MAX table, the model
// pins, and the roster. That is a hand-maintained mirror of this module, so without
// this test the two drift silently and the Design's claim that "a later AGENTS.md
// edit contradicting them fails npm test" is false.

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const AGENTS_MD = readFileSync(join(REPO_ROOT, 'AGENTS.md'), 'utf8');

const unbacktick = (cell) => cell.replaceAll('`', '').trim();
const firstInt = (cell) => Number.parseInt(/\d+/.exec(cell)?.[0] ?? '', 10);

/** Read the GitHub-flavoured Markdown table whose header row satisfies `isHeader`. */
function readMarkdownTable(md, isHeader, label) {
  const lines = md.split('\n');
  const headerIndex = lines.findIndex((l) => l.trim().startsWith('|') && isHeader(l));
  assert.ok(headerIndex >= 0, `AGENTS.md is missing the ${label} table`);
  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    if (!lines[i].trim().startsWith('|')) break;
    if (lines[i].includes('---')) continue;
    rows.push(
      lines[i]
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim())
    );
  }
  assert.ok(rows.length > 0, `AGENTS.md ${label} table has no rows`);
  return rows;
}

/**
 * The fenced `HIGH_RISK_PATHS` block holds prose then a blank line then the list, so
 * the entries are the LAST blank-line-separated group. Reading the whole fence would
 * pick up the prose line that deliberately names a path.
 */
function fencedHighRiskPaths(md) {
  const marker = md.indexOf('**`HIGH_RISK_PATHS`.**');
  assert.ok(marker >= 0, 'AGENTS.md is missing the HIGH_RISK_PATHS section');
  const fenceStart = md.indexOf('```text', marker);
  assert.ok(fenceStart >= 0, 'AGENTS.md HIGH_RISK_PATHS section has no fenced block');
  const bodyStart = md.indexOf('\n', fenceStart) + 1;
  const fenceEnd = md.indexOf('```', bodyStart);
  assert.ok(fenceEnd > bodyStart, 'AGENTS.md HIGH_RISK_PATHS fence is unterminated');
  const groups = md.slice(bodyStart, fenceEnd).trim().split(/\n\s*\n/);
  return groups[groups.length - 1]
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

test('13. AGENTS.md mirrors HIGH_RISK_PATHS, the thresholds, the pins, and the roster', () => {
  // (a) The fenced path list, entries AND order.
  assert.deepEqual(fencedHighRiskPaths(AGENTS_MD), HIGH_RISK_PATHS);

  // (b) SMALL_MAX / MEDIUM_MAX per stage. One AGENTS.md row covers two stage keys.
  const thresholdRows = readMarkdownTable(
    AGENTS_MD,
    (l) => l.includes('`SMALL_MAX`') && l.includes('`MEDIUM_MAX`'),
    'SMALL_MAX/MEDIUM_MAX'
  );
  const documented = {};
  for (const [stageCell, smallCell, mediumCell] of thresholdRows) {
    for (const stage of stageCell.split(',').map((s) => unbacktick(s))) {
      documented[stage] = { smallMax: firstInt(smallCell), mediumMax: firstInt(mediumCell) };
    }
  }
  assert.deepEqual(Object.keys(documented).sort(), Object.keys(STAGE_THRESHOLDS).sort());
  for (const [stage, limits] of Object.entries(STAGE_THRESHOLDS)) {
    assert.deepEqual(documented[stage], limits, `AGENTS.md ${stage} thresholds drifted`);
  }
  // The two post-implementation stages share one row, so they must share one object.
  assert.deepEqual(documented['post-implementation'], documented.docs);

  // (c) The provider pin table.
  const pinRows = readMarkdownTable(
    AGENTS_MD,
    (l) => l.includes('Model tier') && l.includes('model_reasoning_effort'),
    'model-tier pin'
  );
  const pins = {};
  for (const [tierCell, claudeCell, modelCell, effortCell] of pinRows) {
    pins[unbacktick(tierCell)] = {
      claude: unbacktick(claudeCell),
      codexModel: unbacktick(modelCell),
      codexReasoningEffort: unbacktick(effortCell),
    };
  }
  assert.deepEqual(pins, TIER_MODELS);

  // (d) The roster, parsed by the validator's OWN parser. A 7th family added to
  // AGENTS.md without updating FAMILIES here fails.
  const parsed = parseBindingsTable(AGENTS_MD);
  assert.deepEqual(parsed.skipped, [], 'a real AGENTS.md row is silently skipped by the parser');
  assert.equal(parsed.rows.length, 22, 'the roster is 22 bindings-table rows');
  const skillBacked = parsed.rows.filter((row) => row.cells.some((c) => c.includes('SKILL.md')));
  assert.equal(skillBacked.length, 21, '21 skill-backed roles');
  assert.equal(parsed.rows.length - skillBacked.length, 1, '+ 1 mapping role');

  const byName = (a, b) => a.localeCompare(b);
  const split = parsed.tokens.map((token) => splitTieredToken(token));
  const families = [...new Set(split.filter((s) => s.tier).map((s) => s.base))].sort(byName);
  assert.deepEqual(families, [...FAMILIES].sort(byName), 'AGENTS.md family set drifted');
  const untiered = split.filter((s) => !s.tier).map((s) => s.base).sort(byName);
  assert.deepEqual(untiered, [...UNTIERED, 'fabricate_pr_explorer'].sort(byName));

  // Every declared family is complete against the real AGENTS.md, Family table included.
  assert.deepEqual(
    familyCompletenessErrors({ tokens: parsed.tokens, hasSkill, agentsMdText: AGENTS_MD }),
    []
  );
});

// --- 14. main() is actually wired to its gates ------------------------------
// The gates are unit-covered above; this drives `main(root)` over an on-disk fixture
// so a DELETED call site fails, not just a broken gate.

const fixtureDescription = (tier) => `A ${tier} scoped fixture lane.`;

/** Write the whole provider tree implied by a bindings table, plus AGENTS.md. */
function seedRepo(write, bindingsMd) {
  write(
    'AGENTS.md',
    `${bindingsMd}\n\n### Shared skills with no persona binding\n\nNone in this fixture.\n`
  );
  for (const row of parseBindingsTable(bindingsMd).rows) {
    const { token } = row;
    const roleBase = fileForm(token);
    const { base, tier } = splitTieredToken(token);
    const declaredTier = tier ?? UNTIERED_ROLE_TIERS[token];
    const modelPins = TIER_MODELS[declaredTier];
    const description = fixtureDescription(declaredTier);
    const codex = codexBinding({
      token,
      model: modelPins.codexModel,
      effort: modelPins.codexReasoningEffort,
      description,
    });

    // Mapping role: Codex-only, read-only sandbox, no shared skill.
    if (!row.cells.some((c) => c.includes('SKILL.md'))) {
      write(
        `.codex/agents/${roleBase}.toml`,
        codex.replace('danger-full-access', 'read-only') + '\n'
      );
      continue;
    }

    const skillDir = fileForm(base);
    const skillPath = `.agents/skills/${skillDir}/SKILL.md`;
    write(
      skillPath,
      [
        '---',
        `name: ${skillDir}`,
        `description: Fixture persona for the ${skillDir} role.`,
        '---',
        '',
        '# Fixture persona',
      ].join('\n')
    );
    write(`.codex/agents/${roleBase}.toml`, `${codex}\n# persona: \`${skillPath}\`\n`);
    const claude = claudeBinding({ token, model: modelPins.claude, description });
    write(`.claude/agents/${roleBase}.md`, `${claude}\n\nRead \`${skillPath}\`.\n`);
  }
}

/** Seed a temp repo, optionally damage it, and return `main`'s accumulated errors. */
function runValidator({ bindingsMd = agentsMd(), damage } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fabricate-agent-bindings-'));
  const write = (rel, text) => {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text, 'utf8');
  };
  const append = (rel, text) => write(rel, `${readFileSync(join(root, rel), 'utf8')}${text}`);
  try {
    seedRepo(write, bindingsMd);
    damage?.({ write, append });
    return main(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('14. main() reports each seeded defect, so no gate call site can be deleted', () => {
  assert.deepEqual(runValidator(), [], 'the clean fixture must produce no errors');

  const cases = [
    {
      name: 'modelPinErrors for a skill-backed role',
      expected: /pins model: opus, model tier small requires haiku/,
      damage: ({ write }) =>
        write(
          '.claude/agents/fabricate-implementer-small.md',
          `${claudeBinding({
            token: 'fabricate_implementer_small',
            model: 'opus',
            description: fixtureDescription('small'),
          })}\n\nRead \`.agents/skills/fabricate-implementer/SKILL.md\`.\n`
        ),
    },
    {
      name: 'the mapping role pin',
      expected: /fabricate-pr-explorer\.toml: pins model gpt-5\.6-sol, must be gpt-5\.6-luna/,
      damage: ({ write }) =>
        write(
          '.codex/agents/fabricate-pr-explorer.toml',
          codexBinding({
            token: 'fabricate_pr_explorer',
            model: 'gpt-5.6-sol',
            effort: 'low',
            description: 'Map.',
          }).replace('danger-full-access', 'read-only') + '\n'
        ),
    },
    {
      name: 'validateToolParity',
      expected: /must allow Edit and Write to match/,
      damage: ({ write }) =>
        write(
          '.claude/agents/fabricate-implementer-small.md',
          [
            '---',
            'name: fabricate-implementer-small',
            `description: ${fixtureDescription('small')}`,
            'tools: Read, Grep, Glob',
            'model: haiku',
            '---',
            '',
            'Read `.agents/skills/fabricate-implementer/SKILL.md`.',
          ].join('\n')
        ),
    },
    {
      name: 'validateHarnessDocs path existence',
      expected: /AGENTS\.md: references missing path `src\/nowhere\/absent\.js`/,
      damage: ({ append }) => append('AGENTS.md', '\nSee `src/nowhere/absent.js`.\n'),
    },
    {
      name: 'validateSkills frontmatter',
      expected: /frontmatter name must match its directory \(fabricate-implementer\)/,
      damage: ({ write }) =>
        write(
          '.agents/skills/fabricate-implementer/SKILL.md',
          ['---', 'name: wrong-name', 'description: Fixture persona.', '---', '', 'body'].join('\n')
        ),
    },
    {
      name: 'familyCompletenessErrors',
      expected: /fabricate_implementer: model-tiered family is missing large/,
      bindingsMd: agentsMd({ bindings: { tiers: ['small', 'medium'] } }),
    },
    {
      name: 'the Family table gate (agentsMdText reaches familyCompletenessErrors)',
      expected: /missing the Family to model tiers table/,
      bindingsMd: bindingsTable(),
    },
    {
      name: 'the hyphenated-token skipped report',
      expected: /`fabricate-implementer-small` is not a bare/,
      bindingsMd: agentsMd().replace(
        '|---|---|---|---|',
        '|---|---|---|---|\n' +
          '| `fabricate-implementer-small` | `.agents/skills/fabricate-implementer/SKILL.md` ' +
          '| `.codex/agents/fabricate-implementer-small.toml` | `fabricate-implementer-small` |'
      ),
    },
  ];

  for (const { name, expected, ...options } of cases) {
    const errors = runValidator(options);
    assert.ok(
      errors.some((e) => expected.test(e)),
      `${name}: no error matched ${expected}. Got:\n${errors.join('\n')}`
    );
  }
});

// --- 15. Rule 5 needs EXACTLY one path --------------------------------------

test('15. a 2-path spawn at or below SMALL_MAX resolves to medium via rule 6, not small', () => {
  // The Design's own case: a module plus its co-located test is one concern, and it
  // is deliberately medium rather than small.
  const pair = selectModelTier({
    stage: 'implementation',
    paths: ['src/systems/dnd5e.js', 'tests/systems/dnd5e.test.js'],
    sizeMetric: STAGE_THRESHOLDS.implementation.smallMax,
    ruleTwoSource: 'none',
  });
  assert.deepEqual([pair.rule, pair.tier], [6, 'medium']);

  // The same facts with exactly one path DO reach rule 5, so the guard is what differs.
  const single = selectModelTier({
    stage: 'implementation',
    paths: ['src/systems/dnd5e.js'],
    sizeMetric: STAGE_THRESHOLDS.implementation.smallMax,
    ruleTwoSource: 'none',
  });
  assert.deepEqual([single.rule, single.tier], [5, 'small']);
});

// --- 16. `skipped` is actually populated ------------------------------------

test('16. a hyphenated model-tier token cell is reported as skipped, never parsed as a row', () => {
  const withHyphenated = agentsMd().replace(
    '|---|---|---|---|',
    '|---|---|---|---|\n' +
      '| `fabricate-implementer-small` | `.agents/skills/fabricate-implementer/SKILL.md` ' +
      '| `.codex/agents/fabricate-implementer-small.toml` | `fabricate-implementer-small` |'
  );
  const parsed = parseBindingsTable(withHyphenated);
  assert.deepEqual(parsed.skipped, ['`fabricate-implementer-small`']);
  // It is genuinely invisible to every downstream gate — the row count is unchanged.
  assert.equal(parsed.rows.length, 22);
  assert.ok(!parsed.tokens.includes('fabricate-implementer-small'));
});

// --- 17. The Claude side of the pin gate is symmetric with the Codex side ----

test('17. a superstring Claude pin and a missing tiered description both error', () => {
  const superstring = modelPinErrors(bindingPair('small', { claudeModel: 'haiku-preview' }));
  assert.equal(superstring.length, 1);
  assert.match(superstring[0], /pins model: haiku-preview, model tier small requires haiku/);

  const noDescription = modelPinErrors({
    token: 'fabricate_implementer_small',
    tier: 'small',
    claudePath: '.claude/agents/fabricate-implementer-small.md',
    claudeText: [
      '---',
      'name: fabricate-implementer-small',
      'tools: Read, Grep, Glob, Edit, Write, Bash',
      'model: haiku',
      '---',
      '',
      'body',
    ].join('\n'),
  });
  assert.deepEqual(noDescription, [
    '.claude/agents/fabricate-implementer-small.md: must declare a description',
  ]);
});

// --- 18. Codex block-form descriptions are read --------------------------------

test('18. a TOML block description is parsed, not shadowed by the single-line pattern', () => {
  const blockCodex = (body) =>
    [
      'name = "fabricate_implementer_small"',
      'description = """',
      body,
      '"""',
      'model = "gpt-5.6-luna"',
      'model_reasoning_effort = "low"',
      'sandbox_mode = "danger-full-access"',
    ].join('\n');
  const binding = (body) => ({
    token: 'fabricate_implementer_small',
    tier: 'small',
    codexPath: '.codex/agents/fabricate-implementer-small.toml',
    codexText: blockCodex(body),
  });

  assert.deepEqual(modelPinErrors(binding('A small scoped lane.')), []);

  // The discriminating case: the single-line pattern also matches the `"""` opener and
  // captures a lone quote, so before the block form was tried first this description
  // read as `"` — naming no model tier at all, and the "must not name" half never fired.
  const wrongTier = modelPinErrors(binding('A large scoped lane.'));
  assert.equal(wrongTier.length, 2);
  assert.match(wrongTier[0], /must name its own model tier \(small\)/);
  assert.match(wrongTier[1], /must not name model tier large/);
});
