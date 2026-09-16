/**
 * The two provider templates. Every file under `.claude/agents/` and `.codex/agents/` is
 * rendered here from `agentBindingRoles.js` and `agentModelTiers.js`.
 *
 * THIS IS ONE OF THE TWO PLACES THE `ESCALATE_TIER` CONTRACT IS AUTHORED; the other is
 * `AGENTS.md`. It was hand-maintained in 36 binding files, in eight wordings that had drifted.
 *
 * The two templates are not one template with a format switch: Claude is YAML frontmatter over
 * one-sentence-per-line Markdown, Codex is TOML over a `"""` block of joined paragraphs. Nothing
 * throws; `bindingRenderErrors` returns `string[]` so `node --test` can import it.
 */
import { BINDING_ROLES, bindingTargets, roleSkillPath } from './agentBindingRoles.js';
import { TIER_MODELS, UNTIERED_ROLE_TIERS, toolParityErrors } from './agentModelTiers.js';

const ROLES_MODULE = 'scripts/lib/agentBindingRoles.js';

// --- shared sentences -------------------------------------------------------

/** Appended to the `medium` description of a family that also takes confirmation rounds. */
const CONFIRMATION_CLAUSE =
  ' Also the binding for every disposition-only confirmation round, whatever model tier the first round ran at.';

/** The Codex tier blurb is per model tier only; the Claude one is per family AND model tier. */
const CODEX_TIER_BLURBS = {
  small: 'self-contained change confined to one function, object, or segment of a single file',
  medium: 'single-file change spanning multiple functions, objects, or structures',
  large: 'multi-file, ambiguous, or high-risk change',
};

// --- Claude template --------------------------------------------------------

const CLAUDE_SELF_SELECT = ' The workflow driver selects the model tier; do not self-select.';
const CLAUDE_SCOPED =
  'Follow the conventions in `AGENTS.md` and execute your scoped role; the workflow driver owns routing and the iteration loops, so do not spawn or route other agents.';
const CLAUDE_ESCALATION_TAIL = {
  edit: 'before making any edit',
  review: 'before producing any other output',
};
const CLAUDE_CONFIRMATION_SENTENCE =
  'A disposition-only confirmation round — your own prior findings against a driver-supplied artifact — is scoped by construction and normally within this model tier; escalate one only when the revision introduced a defect surface you cannot read at this model tier.';

const claudePointer = (skill) =>
  `Read and follow \`${skill}\` as your operating manual — it is the canonical persona definition and this binding is a thin pointer to it.`;

const claudeEscalation = (tier, escalation) =>
  `This binding is model tier \`${tier}\`; if the assignment exceeds this model tier, return \`ESCALATE_TIER: <reason>\` on the first line ${CLAUDE_ESCALATION_TAIL[escalation]}.`;

function claudeDescription(role, tier) {
  if (!tier) return role.aboutClaude;
  return `${role.aboutClaude} Use for a ${role.blurbs[tier]}.${confirmationClause(role, tier)}${CLAUDE_SELF_SELECT}`;
}

function claudeTierLines(role, tier) {
  if (!tier) return [];
  const lines = [claudeEscalation(tier, role.escalation)];
  if (role.confirmation && tier === 'medium') lines.push(CLAUDE_CONFIRMATION_SENTENCE);
  return lines;
}

function renderClaude({ role, base, tier }, declaredTier) {
  const lead = role.claudeLead ?? [
    claudePointer(roleSkillPath(role)),
    CLAUDE_SCOPED,
    ...(role.claudeExtra ?? []),
  ];
  const lines = [
    '---',
    `name: ${base}`,
    `description: ${claudeDescription(role, tier)}`,
    `tools: ${role.tools}`,
    `model: ${TIER_MODELS[declaredTier].claude}`,
    '---',
    '',
    `You are the ${role.persona}.`,
    ...lead,
    '',
    ...role.claudeSandbox,
    ...claudeTierLines(role, tier),
  ];
  return `${lines.join('\n')}\n`;
}

// --- Codex template ---------------------------------------------------------

const CODEX_ESCALATION_TAIL = {
  edit: 'before making any edit',
  review: 'instead of a verdict, before reviewing',
};
const CODEX_CONFIRMATION_SENTENCE =
  'A disposition-only confirmation round, your own prior findings against a driver-supplied artifact, is scoped by construction and normally within this model tier; escalate one only when the revision introduced a defect surface you cannot read at this model tier.';

const codexLead = (skill) =>
  `Read and follow ${skill} as your operating manual, and follow the conventions in AGENTS.md. Execute your scoped role and return your result; the workflow driver owns routing and the iteration loops, so do not spawn or route other agents. That SKILL.md is the canonical persona definition; this agent is a thin binding to it.`;

const codexEscalation = (tier, escalation) =>
  `This binding is model tier ${tier}; if the assignment exceeds this model tier, return ESCALATE_TIER: <reason> on the first line ${CODEX_ESCALATION_TAIL[escalation]}.`;

function codexDescription(role, tier) {
  if (!tier) return role.aboutCodex;
  const blurb = `Bound to the ${tier} model tier, selected by the workflow driver, for a ${CODEX_TIER_BLURBS[tier]}.`;
  return `${role.aboutCodex} ${blurb}${confirmationClause(role, tier)}`;
}

function codexTierParagraph(role, tier) {
  const sentences = [codexEscalation(tier, role.escalation)];
  if (role.confirmation && tier === 'medium') sentences.push(CODEX_CONFIRMATION_SENTENCE);
  return sentences.join(' ');
}

/** The mapping role has no shared skill, so its instructions are verbatim prose, not a pointer. */
function codexInstructions(role, tier) {
  if (role.codexOnly) return role.codexInstructions.join('\n');
  const paragraphs = [
    `You are the ${role.persona}.`,
    role.codexLead ?? codexLead(roleSkillPath(role)),
    role.codexSandbox,
  ];
  if (tier) paragraphs.push(codexTierParagraph(role, tier));
  return paragraphs.join('\n\n');
}

function renderCodex({ role, token, tier }, declaredTier) {
  const pins = TIER_MODELS[declaredTier];
  const keys = [
    `name = ${toml(token)}`,
    `description = ${toml(codexDescription(role, tier))}`,
    `model = ${toml(pins.codexModel)}`,
    `model_reasoning_effort = ${toml(pins.codexReasoningEffort)}`,
    `sandbox_mode = ${toml(role.sandboxMode)}`,
    `nickname_candidates = [${role.nicknames.map((n) => toml(n)).join(', ')}]`,
  ];
  return `${keys.join('\n')}\n\ndeveloper_instructions = """\n${codexInstructions(role, tier)}\n"""\n`;
}

// --- roster -----------------------------------------------------------------

/**
 * Every binding file this repository generates, as `repo-relative path -> exact bytes`, plus the
 * errors that make a record unrenderable. A record failing tool/sandbox parity is reported here
 * rather than written, so the generator cannot emit a spawn tool into any role or a mutation
 * tool into a read-only one.
 *
 * @returns {{ files: Map<string, string>, errors: string[] }}
 */
export function renderedBindings() {
  const files = new Map();
  const errors = [];
  for (const target of bindingTargets()) {
    const declaredTier = target.tier ?? UNTIERED_ROLE_TIERS[target.role.token];
    if (!Object.hasOwn(TIER_MODELS, declaredTier ?? '')) {
      errors.push(
        `${ROLES_MODULE}: ${target.token} has no declared model tier — model-tier it or add it to UNTIERED_ROLE_TIERS`
      );
      continue;
    }
    const safety = roleToolSafetyErrors(target.role);
    if (safety.length > 0) {
      errors.push(...safety);
      continue;
    }
    files.set(`.codex/agents/${target.base}.toml`, renderCodex(target, declaredTier));
    if (!target.role.codexOnly) {
      files.set(`.claude/agents/${target.base}.md`, renderClaude(target, declaredTier));
    }
  }
  return { files, errors };
}

/**
 * Tool/sandbox parity for ONE ROLE RECORD, using the same rule the on-disk bindings are gated
 * by. The mapping role declares no Claude tools because it has no Claude binding.
 *
 * @param {object} role
 * @returns {string[]}
 */
export function roleToolSafetyErrors(role) {
  if (role.codexOnly) return [];
  return toolParityErrors({
    token: role.token,
    tools: role.tools ? role.tools.split(',').map((t) => t.trim()) : null,
    readOnly: role.sandboxMode === 'read-only',
    subject: `${ROLES_MODULE} ${role.token} tools`,
    against: `its sandbox_mode = "${role.sandboxMode}"`,
  });
}

/**
 * Compare every generated binding against the bytes on disk.
 *
 * `read` is injected rather than taken from the filesystem so a test can perturb one file
 * without touching the checkout — which is how both directions of the gate are proved.
 *
 * @param {(rel: string) => string | null} read
 * @returns {string[]}
 */
export function bindingRenderErrors(read) {
  const { files, errors } = renderedBindings();
  for (const [rel, expected] of files) {
    const actual = read(rel);
    if (actual === null || actual === undefined) {
      errors.push(`${rel} is missing — run \`npm run validate:agents -- --write\` to generate it`);
      continue;
    }
    if (actual !== expected) errors.push(`${rel} ${describeDrift(actual, expected)}`);
  }
  return errors;
}

/** The roster as routing tokens, so a caller can compare it with the `AGENTS.md` table. */
export const renderedTokens = () => bindingTargets().map(({ token }) => token);

/** How many roles the roster holds, for the summary line. */
export const roleCount = () => BINDING_ROLES.length;

// --- internals --------------------------------------------------------------

function confirmationClause(role, tier) {
  return role.confirmation && tier === 'medium' ? CONFIRMATION_CLAUSE : '';
}

/** TOML basic string. JSON's escaping is a subset of TOML's for the characters bindings use. */
function toml(value) {
  return JSON.stringify(String(value));
}

/** Name the FIRST differing line, so the failure says what was hand-edited, not just that it was. */
function describeDrift(actual, expected) {
  const actualLines = actual.split('\n');
  const expectedLines = expected.split('\n');
  for (const [i, wanted] of expectedLines.entries()) {
    const got = actualLines[i];
    if (got === wanted) continue;
    return `differs from its render at line ${i + 1}: expected ${JSON.stringify(wanted)}, found ${JSON.stringify(got ?? '<end of file>')}`;
  }
  return `has ${actualLines.length - expectedLines.length} extra line(s) after line ${expectedLines.length}`;
}
