/** The model-tier tables and the gates over them, extracted so they are unit testable. */

/**
 * The three model tiers, ordered least to most capable. The order is load-bearing:
 * model-tier floors clamp on it and `ESCALATE_TIER` steps up it.
 */
export const TIER_ORDER = ['small', 'medium', 'large'];

/** Provider pins per model tier — the single source of truth every binding is gated against. */
export const TIER_MODELS = {
  small: { claude: 'haiku', codexModel: 'gpt-5.6-luna', codexReasoningEffort: 'low' },
  medium: { claude: 'sonnet', codexModel: 'gpt-5.6-terra', codexReasoningEffort: 'medium' },
  large: { claude: 'opus', codexModel: 'gpt-5.6-sol', codexReasoningEffort: 'high' },
};

/**
 * The model tier of every skill-backed role that is not model-tiered, plus the read-only mapping
 * role.
 */
export const UNTIERED_ROLE_TIERS = {
  fabricate_orchestrator: 'large',
  fabricate_docs_writer: 'medium',
  fabricate_competitive_analyst: 'large',
  fabricate_pr_explorer: 'small',
};

/** Paths whose touch forces `large`, mirroring the fenced list in `agentic-workflow.md`. */
export const HIGH_RISK_PATHS = [
  'module.json',
  'package.json',
  'package-lock.json',
  'src/main.js',
  'src/migration/**',
  'src/systems/remapWorldScopeIdentityFlags.js',
  'src/systems/restampOwnedItemComponentIdentity.js',
  'src/systems/worldScopeReferenceRewrite.js',
  'scripts/**',
  '.github/workflows/**',
  'release.config.js',
  'release.s3.config.json',
  'AGENTS.md',
  'CLAUDE.md',
  '.agents/skills/**',
  '.agents/docs/**',
  '.claude/agents/**',
  '.codex/agents/**',
];

/** Post-implementation review and the docs loop score the same diff, so they share limits. */
const DIFF_THRESHOLDS = { smallMax: 50, mediumMax: 400 };

/**
 * `SMALL_MAX` / `MEDIUM_MAX` per stage. The size metric is delta-task count before
 * any implementation exists and added + deleted diff lines afterwards, so the two
 * are never compared against each other.
 */
export const STAGE_THRESHOLDS = {
  'plan-review': { smallMax: 3, mediumMax: 8 },
  implementation: { smallMax: 1, mediumMax: 4 },
  'post-implementation': DIFF_THRESHOLDS,
  docs: DIFF_THRESHOLDS,
};

/**
 * Roles whose read-only sandbox still permits command execution because their skill genuinely needs
 * `Bash` for read-only probes.
 */
const READONLY_BASH_ALLOWED = new Set(['foundry_integrator']);

/** Tools that let a role mutate the workspace. A read-only sandbox must allow none of them. */
export const WRITE_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];

/** Tools that let a role spawn or route sub-agents. Role agents must never nest. */
export const SPAWN_TOOLS = ['Agent', 'Task'];

/** The `openspec/specs/**` model-tier floor, expressed as a matcher entry list. */
const SPEC_FLOOR_PATHS = ['openspec/specs/**'];

const TIERED_TOKEN_PATTERN = /^(.+)_(small|medium|large)$/;
const ROUTING_TOKEN_PATTERN = /^`(fabricate|foundry)_\w+`$/;
const LOOSE_TOKEN_PATTERN = /^`(fabricate|foundry)[\w-]+`$/;
const TOKEN_IN_CELL_PATTERN = /`((?:fabricate|foundry)_\w+)`/g;

const CLAUDE_MODEL_FIELD = /^model:(.*)$/;
const CLAUDE_DESCRIPTION_FIELD = /^description:(.*)$/;
const CODEX_MODEL_FIELD = /^model\s*=\s*"(.*)"$/;
const CODEX_EFFORT_FIELD = /^model_reasoning_effort\s*=\s*"(.*)"$/;
const CODEX_DESCRIPTION_FIELD = /^description\s*=\s*"(.*)"$/;
const CODEX_DESCRIPTION_BLOCK = /^description\s*=\s*"""([\s\S]*?)"""/m;

/**
 * Stage 1 of base-family resolution: split unconditionally. Any token ending in `_small` /
 * `_medium` / `_large` yields a candidate `(base, model tier)` pair.
 */
export function splitTieredToken(token) {
  const value = String(token ?? '');
  const match = TIERED_TOKEN_PATTERN.exec(value);
  if (!match) return { base: value, tier: null };
  return { base: match[1], tier: match[2] };
}

/**
 * Parse the `AGENTS.md` "Agent Roles & Bindings" table. Exported so tests drive the validator's own
 * row parsing rather than re-implementing the row regex and asserting their own parse.
 */
export function parseBindingsTable(agentsMdText) {
  const lines = String(agentsMdText ?? '').split('\n');
  const headerIndex = lines.findIndex((l) => l.includes('Routing token') && l.includes('Claude'));
  const rows = [];
  const skipped = [];
  for (let i = headerIndex + 1; headerIndex >= 0 && i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) break;
    if (line.includes('---')) continue;
    const cells = splitRow(line);
    const tokenCell = cells.find((c) => ROUTING_TOKEN_PATTERN.test(c));
    if (tokenCell) {
      rows.push({ cells, token: tokenCell.replaceAll('`', '') });
      continue;
    }
    if (cells.length > 0 && LOOSE_TOKEN_PATTERN.test(cells[0])) skipped.push(cells[0]);
  }
  return { headerIndex, rows, tokens: rows.map((r) => r.token), skipped };
}

/**
 * Stage 2 of base-family resolution plus the `Family` table parity gate (both are "does this family
 * declare all three model tiers, everywhere it is named?").
 */
export function familyCompletenessErrors({ tokens, hasSkill, agentsMdText }) {
  const families = declaredFamilies(tokens);
  const errors = [];
  for (const [family, tiers] of families) {
    if (!hasSkill(family)) continue;
    const missing = TIER_ORDER.filter((t) => !tiers.has(t));
    if (missing.length === 0) continue;
    errors.push(`${family}: model-tiered family is missing ${missing.join(', ')}`);
  }
  if (typeof agentsMdText === 'string') {
    errors.push(...familyTableErrors(agentsMdText, families));
  }
  return errors;
}

/**
 * Stage 3 of base-family resolution: resolve the skill path, using the base only when that skill
 * exists and the family declared all three model tiers; otherwise treat the role name literally.
 */
export function resolveRole(token, { tokens, hasSkill }) {
  const { base, tier } = splitTieredToken(token);
  const declared = declaredFamilies(tokens).get(base);
  const complete = Boolean(declared) && TIER_ORDER.every((t) => declared.has(t));
  const viaFamily = Boolean(tier) && complete && hasSkill(base);
  const family = viaFamily ? base : token;
  const untiered = Object.hasOwn(UNTIERED_ROLE_TIERS, token) ? UNTIERED_ROLE_TIERS[token] : null;
  return {
    token,
    tier,
    declaredTier: tier ?? untiered,
    family,
    skillDir: family.replaceAll('_', '-'),
    roleBase: String(token).replaceAll('_', '-'),
    viaFamily,
  };
}

/**
 * Resolve the read-only `Bash` exemption against the base family token, so `foundry_integrator`
 * keeps it at all three model tiers and no other family gains it.
 */
export function isReadonlyBashAllowed(token) {
  return READONLY_BASH_ALLOWED.has(splitTieredToken(token).base);
}

/** Gate one role's provider pins against its declared model tier. */
export function modelPinErrors(binding) {
  const { token, tier, claudePath, claudeText, codexPath, codexText } = binding;
  const requireClaude = binding.requireClaude !== false;
  if (!Object.hasOwn(TIER_MODELS, tier ?? '')) {
    return [`${token}: no declared model tier — add it to UNTIERED_ROLE_TIERS or model-tier it`];
  }
  const pins = TIER_MODELS[tier];
  const tiered = splitTieredToken(token).tier !== null;
  const errors = [];
  if (requireClaude && typeof claudeText === 'string') {
    errors.push(...claudeBindingErrors(claudePath, claudeText, tier, pins, tiered));
  }
  if (typeof codexText === 'string') {
    errors.push(...codexBindingErrors(codexPath, codexText, tier, pins, tiered));
  }
  return errors;
}

/**
 * Root-anchored glob match for the model-tier ladder's rule 1 (and, with an explicit entry list,
 * for the `openspec/specs/**` floor).
 */
export function matchesHighRiskPath(path, entries = HIGH_RISK_PATHS) {
  const raw = String(path ?? '').trim();
  const clean = raw.replace(/^\.\//, '');
  if (!clean) return false;
  const segments = clean.split('/');
  return entries.some((e) => segmentsMatch(segments, e.split('/')));
}

/**
 * The model-tier selection ladder — first match wins — followed by the model-tier floors, which
 * only ever raise and always clamp at `large`.
 */
export function selectModelTier(spawn) {
  const stage = spawn?.stage ?? null;
  const paths = Array.isArray(spawn?.paths) ? spawn.paths : [];
  const size = Number.isFinite(spawn?.sizeMetric) ? spawn.sizeMetric : null;
  const source = spawn?.ruleTwoSource ?? null;
  const known = Object.hasOwn(STAGE_THRESHOLDS, stage ?? '');
  const limits = known ? STAGE_THRESHOLDS[stage] : null;
  const base = baseModelTier({ paths, size, source, limits });
  const floor = modelTierFloor(spawn, paths);
  return { tier: higherTier(base.tier, floor), baseTier: base.tier, rule: base.rule };
}

/** Gate one role's Claude tool allowlist against its Codex sandbox mode. */
export function toolParityErrors({ token, tools, readOnly, subject, against }) {
  if (!tools) {
    return [`${subject} must declare an explicit tools: allowlist (no default inheritance)`];
  }
  const errors = [];
  for (const banned of SPAWN_TOOLS) {
    if (tools.includes(banned)) {
      errors.push(`${subject} must not include ${banned} — role agents must not spawn or route`);
    }
  }
  if (!readOnly) {
    if (!tools.includes('Edit') || !tools.includes('Write')) {
      errors.push(`${subject} must allow Edit and Write to match ${against} full-access sandbox`);
    }
    return errors;
  }
  const writeTools = tools.filter((t) => WRITE_TOOLS.includes(t));
  if (writeTools.length > 0) {
    errors.push(
      `${subject} must omit all mutation tools (${WRITE_TOOLS.join('/')}) to match ${against} sandbox_mode = "read-only"; found ${writeTools.join(', ')}`
    );
  }
  // Resolved against the BASE FAMILY token, so foundry_integrator keeps its read-only Bash
  // exemption at all three model tiers and no other family gains it.
  if (tools.includes('Bash') && !isReadonlyBashAllowed(token)) {
    errors.push(
      `${subject} must omit Bash to match ${against} sandbox_mode = "read-only" (or add its base family to READONLY_BASH_ALLOWED in scripts/lib/agentModelTiers.js with a reason)`
    );
  }
  return errors;
}

// --- internals --------------------------------------------------------------

function splitRow(line) {
  const cells = line.split('|');
  return cells.slice(1, -1).map((c) => c.trim());
}

function declaredFamilies(tokens) {
  const families = new Map();
  for (const token of tokens ?? []) {
    const { base, tier } = splitTieredToken(token);
    if (!tier) continue;
    if (!families.has(base)) families.set(base, new Set());
    families.get(base).add(tier);
  }
  return families;
}

/** Locate and gate the `Family` to model-tiers table. */
function familyTableErrors(agentsMdText, families) {
  const table = parseFamilyTable(agentsMdText);
  if (!table) {
    return ['AGENTS.md is missing the Family to model tiers table (a `Family` header cell)'];
  }
  const errors = [];
  for (const [family, tokens] of table) {
    if (!families.has(family)) {
      errors.push(`AGENTS.md Family table names ${family}, which is not a bindings-table family`);
      continue;
    }
    const expected = TIER_ORDER.map((t) => `${family}_${t}`);
    const missing = expected.filter((t) => !tokens.has(t));
    const extra = [...tokens].filter((t) => !expected.includes(t));
    const label = `AGENTS.md Family row ${family}`;
    if (missing.length > 0) errors.push(`${label} omits ${missing.join(', ')}`);
    if (extra.length > 0) errors.push(`${label} names extra ${extra.join(', ')}`);
  }
  for (const family of families.keys()) {
    if (table.has(family)) continue;
    errors.push(`AGENTS.md Family table is missing a row for family ${family}`);
  }
  return errors;
}

function parseFamilyTable(agentsMdText) {
  const lines = String(agentsMdText ?? '').split('\n');
  const headerIndex = lines.findIndex((l) => isFamilyTableHeader(l));
  if (headerIndex === -1) return null;
  const table = new Map();
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) break;
    if (line.includes('---')) continue;
    const cells = splitRow(line);
    if (cells.length === 0) continue;
    const family = cells[0].replaceAll('`', '').trim();
    if (!family) continue;
    const rest = cells.slice(1).join(' ');
    table.set(family, new Set([...rest.matchAll(TOKEN_IN_CELL_PATTERN)].map((m) => m[1])));
  }
  return table;
}

function isFamilyTableHeader(line) {
  if (!line.trim().startsWith('|')) return false;
  if (line.includes('Routing token') && line.includes('Claude')) return false;
  const cells = splitRow(line);
  if (cells.length === 0) return false;
  return cells[0].replaceAll('`', '').trim().toLowerCase() === 'family';
}

function fieldValue(text, pattern) {
  for (const line of String(text ?? '').split('\n')) {
    const match = pattern.exec(line.trim());
    if (match) return match[1].trim();
  }
  return null;
}

/**
 * Toml block form is tried first because the single-line pattern is not a guard against it:
 * `description = """` satisfies `^description\s*=\s*"(.*)"$` — the literal quote takes the first
 * `"`, the anchor takes the third, and the capture takes the second.
 */
function codexDescription(text) {
  const block = CODEX_DESCRIPTION_BLOCK.exec(String(text ?? ''));
  if (block) return block[1].trim();
  return fieldValue(text, CODEX_DESCRIPTION_FIELD);
}

function claudeBindingErrors(path, text, tier, pins, tiered) {
  const errors = [];
  const model = fieldValue(text, CLAUDE_MODEL_FIELD);
  if (model === null) {
    errors.push(`${path}: frontmatter must pin a model (model: ${pins.claude})`);
  } else if (model !== pins.claude) {
    errors.push(`${path}: pins model: ${model}, model tier ${tier} requires ${pins.claude}`);
  }
  if (!tiered) return errors;
  const description = fieldValue(text, CLAUDE_DESCRIPTION_FIELD);
  errors.push(...descriptionTierErrors(path, description, tier));
  return errors;
}

function codexBindingErrors(path, text, tier, pins, tiered) {
  const errors = [];
  const at = `for model tier ${tier}`;
  const model = fieldValue(text, CODEX_MODEL_FIELD);
  if (model === null) {
    errors.push(`${path}: must pin a model (model = "${pins.codexModel}")`);
  } else if (model !== pins.codexModel) {
    errors.push(`${path}: pins model ${model}, must be ${pins.codexModel} ${at}`);
  }
  const effort = fieldValue(text, CODEX_EFFORT_FIELD);
  const wanted = pins.codexReasoningEffort;
  if (effort === null) {
    errors.push(`${path}: must pin model_reasoning_effort = "${wanted}"`);
  } else if (effort !== wanted) {
    errors.push(`${path}: pins model_reasoning_effort ${effort}, must be ${wanted} ${at}`);
  }
  if (!tiered) return errors;
  errors.push(...descriptionTierErrors(path, codexDescription(text), tier));
  return errors;
}

function descriptionTierErrors(path, description, tier) {
  if (description === null) return [`${path}: must declare a description`];
  const errors = [];
  const words = modelTierWords(description);
  if (!words.has(tier)) {
    errors.push(`${path}: description must name its own model tier (${tier})`);
  }
  const others = TIER_ORDER.filter((t) => t !== tier && words.has(t));
  if (others.length > 0) {
    errors.push(`${path}: description must not name model tier ${others.join(', ')}`);
  }
  return errors;
}

function modelTierWords(text) {
  const lower = String(text ?? '').toLowerCase();
  const words = lower.match(/[a-z]+/g) ?? [];
  return new Set(words.filter((w) => TIER_ORDER.includes(w)));
}

function segmentsMatch(segments, pattern) {
  if (pattern.length === 0) return segments.length === 0;
  const [head, ...rest] = pattern;
  if (head === '**') {
    for (let take = 1; take <= segments.length; take += 1) {
      if (segmentsMatch(segments.slice(take), rest)) return true;
    }
    return false;
  }
  if (segments.length === 0 || segments[0] !== head) return false;
  return segmentsMatch(segments.slice(1), rest);
}

function baseModelTier({ paths, size, source, limits }) {
  if (paths.some((p) => matchesHighRiskPath(p))) return { tier: 'large', rule: 1 };
  if (source !== null && source !== 'none') return { tier: 'large', rule: 2 };
  if (paths.length >= 3) return { tier: 'large', rule: 3 };
  const sized = Boolean(limits) && size !== null;
  if (sized && size > limits.mediumMax) return { tier: 'large', rule: 4 };
  if (sized && paths.length === 1 && size <= limits.smallMax) return { tier: 'small', rule: 5 };
  return { tier: 'medium', rule: 6 };
}

function modelTierFloor(spawn, paths) {
  let floor = null;
  if (paths.some((p) => matchesHighRiskPath(p, SPEC_FLOOR_PATHS))) floor = 'medium';
  const previous = spawn?.previousExecutedTier ?? null;
  if (!previous) return floor;
  floor = higherTier(floor, previous);
  if (spawn?.unresolvedFinding === true) floor = higherTier(floor, nextTier(previous));
  return floor;
}

function tierIndex(tier) {
  return TIER_ORDER.indexOf(tier);
}

function higherTier(a, b) {
  return tierIndex(a) >= tierIndex(b) ? a : b;
}

function nextTier(tier) {
  const index = tierIndex(tier);
  if (index === -1) return tier;
  return TIER_ORDER[Math.min(index + 1, TIER_ORDER.length - 1)];
}
