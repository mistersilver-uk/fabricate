/**
 * agentModelTiers.js
 *
 * The model-tier tables and the gates over them, extracted so they are unit
 * testable.
 *
 * WHY a separate module: `scripts/validate-agent-bindings.mjs` used to compute its
 * repository root at module scope and end in `process.exit(1)`. Importing it from a
 * test therefore either asserted nothing (the work happened at import time, before
 * any assertion could run) or hard-killed the whole `node --test` process — which
 * surfaces as `# cancelled`, never as `# fail`. Every interesting gate was trapped
 * behind that, so moving only the static tables would have changed nothing.
 *
 * Everything here is PURE: no filesystem, no process, no network, no throwing.
 * Filesystem facts arrive as a `hasSkill` predicate or as already-read text, and
 * every gate RETURNS `string[]` errors so a caller can accumulate and report them.
 *
 * Two namespaces, one stripping rule. The model tier is an UNDERSCORE suffix in
 * token space (`fabricate_implementer_small`) and a HYPHEN suffix in file space
 * (`.claude/agents/fabricate-implementer-small.md`). The bindings-table parser
 * matches a bare backticked `(fabricate|foundry)_\w+` cell, and `\w` covers `_` but
 * not `-`, so a hyphenated token cell would be silently skipped — no skill check, no
 * pin check, no tool or sandbox parity for that role. Suffix stripping is defined
 * ONCE, in token space, by `splitTieredToken`.
 */

/**
 * The three model tiers, ordered least to most capable. The order is load-bearing:
 * model-tier floors clamp on it and `ESCALATE_TIER` steps up it.
 */
const TIER_ORDER = ['small', 'medium', 'large'];

/**
 * Provider pins per model tier — the single source of truth every binding is gated
 * against. Concrete provider model ids are volatile config and live here (and in the
 * mirroring `AGENTS.md` table), never in a canonical spec.
 */
export const TIER_MODELS = {
  small: { claude: 'haiku', codexModel: 'gpt-5.6-luna', codexReasoningEffort: 'low' },
  medium: { claude: 'sonnet', codexModel: 'gpt-5.6-terra', codexReasoningEffort: 'medium' },
  large: { claude: 'opus', codexModel: 'gpt-5.6-sol', codexReasoningEffort: 'high' },
};

/**
 * The model tier of every skill-backed role that is NOT model-tiered, plus the
 * read-only mapping role. A role absent from this map and carrying no model-tier
 * suffix is an ERROR, never a silent skip — that is what keeps all 21 skill-backed
 * roles gated.
 */
export const UNTIERED_ROLE_TIERS = {
  fabricate_orchestrator: 'large',
  fabricate_docs_writer: 'medium',
  fabricate_competitive_analyst: 'large',
  fabricate_pr_explorer: 'small',
};

/**
 * Paths whose touch forces `large`, mirroring the fenced list in `AGENTS.md`.
 *
 * Entries are root-anchored, repo-relative POSIX paths. `**` matches ONE OR MORE
 * path segments. An entry without `**` matches that exact path only, never a
 * basename — so a nested `src/ui/package.json` does not match the root
 * `package.json` entry.
 *
 * The agent-harness paths are on the list because a mistake there mis-routes every
 * future change. `openspec/specs/**` is deliberately NOT on it — forcing it to
 * `large` would make the `fabricate_domain_expert` lane permanently `large`; it
 * carries a `medium` floor instead.
 */
export const HIGH_RISK_PATHS = [
  'module.json',
  'package.json',
  'package-lock.json',
  'src/main.js',
  'src/migration/**',
  'scripts/**',
  '.github/workflows/**',
  'release.config.js',
  'release.s3.config.json',
  'AGENTS.md',
  'CLAUDE.md',
  '.agents/skills/**',
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
 * Roles whose read-only sandbox still permits command execution because their skill
 * genuinely needs `Bash` for read-only probes. Resolved against the BASE FAMILY
 * token, so the exemption survives at all three of that family's model tiers and
 * reaches no other family. Edit/Write stay banned for them.
 */
const READONLY_BASH_ALLOWED = new Set(['foundry_integrator']);

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
 * STAGE 1 of base-family resolution: split unconditionally. Any token ending in
 * `_small` / `_medium` / `_large` yields a CANDIDATE `(base, model tier)` pair.
 * This must never be conditional — a rule that refuses to derive a base for an
 * incomplete family leaves that family invisible to the very check meant to catch it.
 * @param {string} token
 * @returns {{ base: string, tier: string | null }}
 */
export function splitTieredToken(token) {
  const value = String(token ?? '');
  const match = TIERED_TOKEN_PATTERN.exec(value);
  if (!match) return { base: value, tier: null };
  return { base: match[1], tier: match[2] };
}

/**
 * Parse the `AGENTS.md` "Agent Roles & Bindings" table. Exported so tests drive the
 * VALIDATOR'S OWN row parsing rather than re-implementing the row regex and
 * asserting their own parse.
 *
 * `skipped` carries first cells that look like a routing token but do not match the
 * strict underscore pattern (a hyphenated model-tier suffix, say). Those rows are
 * silently invisible to every downstream gate, so the caller reports them.
 * @param {string} agentsMdText
 * @returns {{ headerIndex: number, rows: Array<{cells: string[], token: string}>,
 *   tokens: string[], skipped: string[] }}
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
 * STAGE 2 of base-family resolution plus the `Family` table parity gate (both are
 * "does this family declare all three model tiers, everywhere it is named?").
 *
 * Completeness is checked over CANDIDATES whose base-family skill exists, and names
 * the family and its missing model tiers. Failure to LOCATE the `Family` table is
 * itself an error — that table is the sole path from a routing token to a
 * `subagent_type`, so skipping it when absent would leave it the one table nothing
 * parses.
 * @param {object} options
 * @param {string[]} options.tokens Routing tokens from the bindings table.
 * @param {(family: string) => boolean} options.hasSkill Does `<family>/SKILL.md` exist?
 * @param {string} [options.agentsMdText] When supplied, also gates the `Family` table.
 * @returns {string[]}
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
 * STAGE 3 of base-family resolution: resolve the skill path, using the base only
 * when that skill EXISTS and the family declared all three model tiers; otherwise
 * treat the role name literally. That condition is what removes the ambiguity a
 * future family whose own name ends in `_small` would create.
 *
 * The binding-file base is always derived from the FULL token — bindings are
 * per-model-tier — while the skill directory comes from the resolved family, so one
 * persona backs all three model tiers and no persona text is duplicated.
 * @param {string} token
 * @param {object} options
 * @param {string[]} options.tokens
 * @param {(family: string) => boolean} options.hasSkill
 * @returns {{ token: string, tier: string | null, declaredTier: string | null,
 *   family: string, skillDir: string, roleBase: string, viaFamily: boolean }}
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
 * Resolve the read-only `Bash` exemption against the BASE FAMILY token, so
 * `foundry_integrator` keeps it at all three model tiers and no other family gains it.
 * @param {string} token
 * @returns {boolean}
 */
export function isReadonlyBashAllowed(token) {
  return READONLY_BASH_ALLOWED.has(splitTieredToken(token).base);
}

/**
 * Gate one role's provider pins against its declared model tier.
 *
 * Comparison is EXACT, never substring, so a superstring pin (`gpt-5.6-luna-preview`
 * where `gpt-5.6-luna` is expected) fails, and it covers the Codex
 * `model_reasoning_effort` field as well as `model`.
 *
 * For a MODEL-TIERED role it also gates the `description`: it must contain its own
 * model-tier word and NEITHER of the other two. The "contains its own" half alone is
 * vacuous against the failure it exists to prevent — a copy-pasted description naming
 * all three model tiers satisfies it for all three bindings.
 *
 * A binding whose text is absent is skipped here; the caller reports the missing file.
 * @param {object} binding
 * @param {string} binding.token
 * @param {string | null} binding.tier The role's DECLARED model tier.
 * @param {string} [binding.claudePath]
 * @param {string | null} [binding.claudeText]
 * @param {string} [binding.codexPath]
 * @param {string | null} [binding.codexText]
 * @param {boolean} [binding.requireClaude] False for the Codex-only mapping role.
 * @returns {string[]}
 */
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
 * Root-anchored glob match for the model-tier ladder's rule 1 (and, with an explicit
 * entry list, for the `openspec/specs/**` floor). `**` matches one or more path
 * segments; an entry without `**` matches that exact path only, never a basename.
 * @param {string} path Repo-relative POSIX path.
 * @param {string[]} [entries]
 * @returns {boolean}
 */
export function matchesHighRiskPath(path, entries = HIGH_RISK_PATHS) {
  const raw = String(path ?? '').trim();
  const clean = raw.replace(/^\.\//, '');
  if (!clean) return false;
  const segments = clean.split('/');
  return entries.some((e) => segmentsMatch(segments, e.split('/')));
}

/**
 * The model-tier selection ladder — first match wins — followed by the model-tier
 * floors, which only ever RAISE and always clamp at `large`.
 *
 * Rules 1 to 4 all yield `large`, so their overlap is harmless; rules 5 and 6 are
 * disjoint and rule 6 is total, so exactly one model tier is always returned. Rule 6
 * defaults UP to `medium`: nothing falls into `small` by omission, it requires the
 * positive, narrow match on rule 5.
 *
 * The driver reads the mirrored ladder in `AGENTS.md` rather than calling this. The
 * value of authoring it is that every ambiguity had to be resolved here, and that the
 * worked examples became a table test — so a later `AGENTS.md` edit contradicting
 * them fails `npm test`.
 * @param {object} spawn
 * @param {string} spawn.stage
 * @param {string[]} spawn.paths The keyed path set for this spawn.
 * @param {number | null} [spawn.sizeMetric] Delta tasks, or added + deleted diff lines.
 * @param {string | null} [spawn.ruleTwoSource] `Lane surface`, or the artifact-derived
 *   equivalent at post-implementation stages. `null` means unavailable.
 * @param {string | null} [spawn.previousExecutedTier] The model tier at which this
 *   `(family, stage)` ACTUALLY EXECUTED in a previous revision.
 * @param {boolean} [spawn.unresolvedFinding]
 * @returns {{ tier: string, baseTier: string, rule: number }}
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

/**
 * Locate and gate the `Family` to model-tiers table. It is located by its own header
 * row — a first cell of `Family` — rather than by the bindings-table header, because
 * the bindings table's four columns and their order must not change and the new table
 * must not reuse both of its header words.
 */
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

function codexDescription(text) {
  const single = fieldValue(text, CODEX_DESCRIPTION_FIELD);
  if (single !== null) return single;
  const block = CODEX_DESCRIPTION_BLOCK.exec(String(text ?? ''));
  return block ? block[1].trim() : null;
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
