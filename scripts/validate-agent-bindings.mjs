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

// Tools that would let a role spawn/route further agents. Role agents must not
// nest — only the top-level workflow driver spawns.
const SPAWN_TOOLS = ["Agent", "Task"];

const errors = [];
const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null);
const require_ = (cond, msg) => { if (!cond) errors.push(msg); };

// Parse a Claude agent's `tools:` frontmatter line into an array, or null if absent.
const parseTools = (md) => {
  const m = md && md.match(/^tools:\s*(.+)$/m);
  return m ? m[1].split(",").map((t) => t.trim()).filter(Boolean) : null;
};

// Return the inner cells of the bindings-table row for `token`. Disambiguated
// from the signals routing table by requiring a `.codex/agents/` binding cell.
const tableRow = (md, token) => {
  const line = (md || "")
    .split("\n")
    .find((l) => l.trim().startsWith("|") && l.includes("`" + token + "`") && l.includes(".codex/agents/"));
  // slice(1, -1) drops the empty cells before the leading `|` and after the trailing `|`.
  return line ? line.split("|").slice(1, -1).map((c) => c.trim()) : null;
};

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

  // Tool allowlist + sandbox parity: every Claude binding must declare an
  // explicit tools list, exclude spawn tools, and match the Codex sandbox mode.
  if (claude && codex) {
    const tools = parseTools(claude);
    require_(tools, `${claudePath} must declare an explicit tools: allowlist (no default inheritance)`);
    if (tools) {
      for (const banned of SPAWN_TOOLS) {
        require_(!tools.includes(banned), `${claudePath} must not include ${banned} — role agents must not spawn or route`);
      }
      const hasWrite = tools.includes("Edit") || tools.includes("Write");
      const codexReadOnly = /sandbox_mode\s*=\s*"read-only"/.test(codex);
      if (codexReadOnly) {
        require_(!hasWrite, `${claudePath} must omit Edit/Write to match ${codexPath} sandbox_mode = "read-only"`);
      } else {
        require_(hasWrite, `${claudePath} must allow Edit/Write to match ${codexPath} full-access sandbox`);
      }
    }
  }

  // AGENTS.md bindings table: row exists and its cells name skill, codex, and the Claude subagent_type.
  if (agentsMd) {
    require_(agentsMd.includes(token), `AGENTS.md must reference routing token ${token}`);
    const row = tableRow(agentsMd, token);
    require_(row, `AGENTS.md bindings table is missing a row for ${token}`);
    if (row) {
      require_(row.some((c) => c.includes(skillPath)), `AGENTS.md ${token} row must cite ${skillPath}`);
      require_(row.some((c) => c.includes(codexPath)), `AGENTS.md ${token} row must cite ${codexPath}`);
      // Claude column is the last populated cell; assert it names this role's subagent.
      const claudeCol = row[row.length - 1];
      require_(
        claudeCol.includes(`fabricate-${role}`),
        `AGENTS.md ${token} row Claude column must be \`fabricate-${role}\`, got "${claudeCol}"`,
      );
    }
  }
}

// Mapping role: Codex toml present; AGENTS.md row maps the Claude column to Explore.
const mapToken = `fabricate_${MAPPING_ROLE.replace(/-/g, "_")}`;
require_(read(`.codex/agents/fabricate-${MAPPING_ROLE}.toml`), `.codex/agents/fabricate-${MAPPING_ROLE}.toml is missing`);
if (agentsMd) {
  require_(agentsMd.includes(mapToken), `AGENTS.md must reference routing token ${mapToken}`);
  const row = tableRow(agentsMd, mapToken);
  require_(row, `AGENTS.md bindings table is missing a row for ${mapToken}`);
  if (row) {
    const claudeCol = row[row.length - 1];
    require_(/Explore/.test(claudeCol), `AGENTS.md ${mapToken} row Claude column must be the built-in Explore agent, got "${claudeCol}"`);
  }
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

console.log(`Agent bindings OK: ${ROLES.length} roles + ${MAPPING_ROLE} mapping consistent across skills, both providers, tool/sandbox parity, and AGENTS.md.`);
