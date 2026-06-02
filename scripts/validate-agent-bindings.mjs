#!/usr/bin/env node
// Validates that every agent role stays consistent across its canonical skill,
// both provider bindings, and the AGENTS.md "Agent Roles & Bindings" table.
//
// Pure Node, no dependencies, no Docker/network — behaves identically in CI and
// local dev. Run with `npm run validate:agents`. Exits non-zero on any mismatch.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Roles backed by a shared skill + both provider bindings.
const ROLES = [
  "orchestrator",
  "implementer",
  "reviewer",
  "domain-expert",
  "docs-writer",
  "ux-designer",
  "quality-engineer",
  "competitive-analyst",
];

// Read-only mapping role: Codex toml only, Claude uses the built-in Explore agent.
const MAPPING_ROLE = "pr-explorer";

const errors = [];
const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null);
const require_ = (cond, msg) => { if (!cond) errors.push(msg); };

const agentsMd = read("AGENTS.md");
require_(agentsMd, "AGENTS.md is missing");

for (const role of ROLES) {
  const token = `fabricate_${role.replace(/-/g, "_")}`;
  const skillPath = `skills/fabricate-${role}/SKILL.md`;
  const codexPath = `.codex/agents/fabricate-${role}.toml`;
  const claudePath = `.claude/agents/fabricate-${role}.md`;

  const skill = read(skillPath);
  const codex = read(codexPath);
  const claude = read(claudePath);

  require_(skill, `${skillPath} (canonical persona) is missing`);
  require_(codex, `${codexPath} (Codex binding) is missing`);
  require_(claude, `${claudePath} (Claude binding) is missing`);

  // Codex binding: correct name token + points at the canonical skill.
  if (codex) {
    require_(codex.includes(`name = "${token}"`), `${codexPath} must declare name = "${token}"`);
    require_(codex.includes(skillPath), `${codexPath} must reference ${skillPath}`);
  }

  // Claude binding: frontmatter name matches the file + points at the canonical skill.
  if (claude) {
    require_(
      new RegExp(`^name:\\s*fabricate-${role}\\s*$`, "m").test(claude),
      `${claudePath} frontmatter must declare name: fabricate-${role}`,
    );
    require_(claude.includes(skillPath), `${claudePath} must reference ${skillPath}`);
  }

  // AGENTS.md bindings table must list all three for this role.
  if (agentsMd) {
    for (const ref of [skillPath, codexPath, `fabricate-${role}`]) {
      require_(agentsMd.includes(ref), `AGENTS.md bindings table must reference ${ref}`);
    }
    require_(agentsMd.includes(token), `AGENTS.md must reference routing token ${token}`);
  }
}

// Mapping role: Codex toml present; AGENTS.md documents the Claude Explore fallback.
const mapToken = `fabricate_${MAPPING_ROLE.replace(/-/g, "_")}`;
require_(read(`.codex/agents/fabricate-${MAPPING_ROLE}.toml`), `.codex/agents/fabricate-${MAPPING_ROLE}.toml is missing`);
if (agentsMd) {
  require_(agentsMd.includes(mapToken), `AGENTS.md must reference routing token ${mapToken}`);
  require_(/fabricate_pr_explorer[\s\S]*?Explore/.test(agentsMd), "AGENTS.md must map fabricate_pr_explorer to the built-in Explore agent");
}

// No orphan Claude bindings beyond the known roles.
const claudeDir = join(root, ".claude/agents");
if (existsSync(claudeDir)) {
  const known = new Set(ROLES.map((r) => `fabricate-${r}.md`));
  for (const file of readdirSync(claudeDir)) {
    if (file.startsWith("fabricate-") && file.endsWith(".md")) {
      require_(known.has(file), `.claude/agents/${file} has no matching role in the bindings table`);
    }
  }
}

if (errors.length) {
  console.error(`Agent binding validation failed (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`Agent bindings OK: ${ROLES.length} roles + ${MAPPING_ROLE} mapping consistent across skills, both providers, and AGENTS.md.`);
