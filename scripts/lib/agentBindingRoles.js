/**
 * Per-role prose and provider metadata for every agent binding, rendered by `agentBindingRender.js`
 * and gated byte-for-byte by `validate-agent-bindings.mjs`.
 */
import { readFileSync } from 'node:fs';

import { TIER_ORDER } from './agentModelTiers.js';

/** Every routed role, in `AGENTS.md` bindings-table order, loaded from `agentBindingRoles.json`. */
export const BINDING_ROLES = Object.freeze(
  JSON.parse(readFileSync(new URL('agentBindingRoles.json', import.meta.url), 'utf8'))
);

/**
 * Expand the roster into one entry per binding file: a `(role, tier)` pair with its routing token
 * and its hyphenated file base, which is the only place the two namespaces are joined.
 */
export function bindingTargets() {
  return BINDING_ROLES.flatMap((role) =>
    (role.tiered ? TIER_ORDER : [null]).map((tier) => {
      const token = tier ? `${role.token}_${tier}` : role.token;
      return { role, tier, token, base: token.replaceAll('_', '-') };
    })
  );
}

/** The canonical skill path backing a role, or `null` for the mapping role, which has none. */
export function roleSkillPath(role) {
  if (role.codexOnly) return null;
  return `.agents/skills/${role.token.replaceAll('_', '-')}/SKILL.md`;
}
