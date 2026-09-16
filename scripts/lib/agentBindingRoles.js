/**
 * Per-role prose and provider metadata for every agent binding, rendered by
 * `agentBindingRender.js` and gated byte-for-byte by `validate-agent-bindings.mjs`.
 *
 * Nothing `agentModelTiers.js` owns is restated here — model pins, declared tiers and the
 * read-only `Bash` exemption are imported at render time, so a record carries no `model`.
 * Each provider's prose is stored separately because the Codex text is NOT the Claude text
 * with backticks stripped: the intro, verdict and escalation sentences are worded
 * independently on each side. Reconciling those dialects is its own change.
 */
import { readFileSync } from 'node:fs';

import { TIER_ORDER } from './agentModelTiers.js';

/**
 * Every routed role, in `AGENTS.md` bindings-table order, loaded from
 * `agentBindingRoles.json`.
 *
 * THE RECORDS ARE JSON, NOT A JS LITERAL, and that is not a formatting preference. Ten records
 * sharing a key sequence is 172 tokens of self-duplication once a copy-paste detector normalises
 * the strings between them — over SonarCloud's 100-token threshold, and `sonar.cpd.exclusions`
 * is inert under Automatic Analysis, so `scripts/**` counts. The records carry no behaviour, so
 * expressing them as data rather than as code costs nothing and removes the duplication at
 * source instead of suppressing its report.
 *
 * - `tiered` expands the record into three bindings, one per model tier.
 * - `confirmation` marks a family whose `medium` binding is also the confirmation-round binding.
 * - `escalation` picks which of the two escalation wordings the templates use.
 * - `codexOnly` is the read-only mapping role: Claude uses its built-in `Explore` agent, so it
 *   has no Claude binding and no shared skill, which is why its instructions are verbatim prose
 *   there rather than a pointer to a `SKILL.md`.
 */
export const BINDING_ROLES = Object.freeze(
  JSON.parse(readFileSync(new URL('agentBindingRoles.json', import.meta.url), 'utf8'))
);

/**
 * Expand the roster into one entry per binding file: a `(role, tier)` pair with its routing
 * token and its hyphenated file base, which is the only place the two namespaces are joined.
 *
 * @returns {{ role: object, tier: string | null, token: string, base: string }[]}
 */
export function bindingTargets() {
  return BINDING_ROLES.flatMap((role) =>
    (role.tiered ? TIER_ORDER : [null]).map((tier) => {
      const token = tier ? `${role.token}_${tier}` : role.token;
      return { role, tier, token, base: token.replaceAll('_', '-') };
    })
  );
}

/**
 * The canonical skill path backing a role, or `null` for the mapping role, which has none.
 *
 * @param {object} role
 * @returns {string | null}
 */
export function roleSkillPath(role) {
  if (role.codexOnly) return null;
  return `.agents/skills/${role.token.replaceAll('_', '-')}/SKILL.md`;
}
