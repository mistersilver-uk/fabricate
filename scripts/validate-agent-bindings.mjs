#!/usr/bin/env node
// Validates that every agent role stays consistent across its canonical skill,
// both provider bindings, and the AGENTS.md "Agent Roles & Bindings" table.
//
// The role list is DERIVED from the AGENTS.md table (the single source of truth),
// not hard-coded — a new routed role or a stale binding on either side is caught.
//
// Pure Node, no dependencies, no Docker/network — behaves identically in CI and
// local dev. Run with `npm run validate:agents`. Exits non-zero on any mismatch.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Tools that let a role mutate the workspace or spawn further agents. A Claude
// binding that mirrors a Codex `sandbox_mode = "read-only"` must include none of
// these (Bash can mutate files/git state, so it counts as write capability).
const WRITE_TOOLS = ["Edit", "Write", "NotebookEdit", "Bash"];
// Tools that let a role spawn/route sub-agents. Role agents must never nest.
const SPAWN_TOOLS = ["Agent", "Task"];

const errors = [];
const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null);
const exists = (rel) => existsSync(join(root, rel));
const require_ = (cond, msg) => { if (!cond) errors.push(msg); };

const parseTools = (md) => {
  const m = md && md.match(/^tools:\s*(.+)$/m);
  return m ? m[1].split(",").map((t) => t.trim()).filter(Boolean) : null;
};

const agentsMd = read("AGENTS.md");
require_(agentsMd, "AGENTS.md is missing");

// --- Parse the bindings table out of AGENTS.md ----------------------------
const lines = (agentsMd || "").split("\n");
const headerIdx = lines.findIndex((l) => l.includes("Routing token") && l.includes("Claude"));
require_(headerIdx >= 0, "AGENTS.md is missing the Agent Roles & Bindings table (header with 'Routing token' and 'Claude')");

const rows = [];
for (let i = headerIdx + 1; headerIdx >= 0 && i < lines.length; i++) {
  const l = lines[i];
  if (!l.trim().startsWith("|")) break; // table ended
  if (l.includes("---")) continue; // separator row
  const cells = l.split("|").slice(1, -1).map((c) => c.trim());
  const tokenCell = cells.find((c) => /^`fabricate_\w+`$/.test(c));
  if (!tokenCell) continue;
  rows.push({ cells, token: tokenCell.replace(/`/g, "") });
}
require_(rows.length > 0, "AGENTS.md bindings table has no role rows");

const expectedCodex = new Set();
const expectedClaude = new Set();
let fullRoles = 0;
let mappingRoles = 0;

for (const { cells, token } of rows) {
  const role = token.replace(/^fabricate_/, "").replace(/_/g, "-");
  const codexPath = `.codex/agents/fabricate-${role}.toml`;
  const claudeCol = cells[cells.length - 1];
  const skillCell = cells.find((c) => c.includes("SKILL.md"));

  // Mapping role: no shared skill, no Claude binding — Claude uses Explore.
  if (!skillCell) {
    mappingRoles++;
    expectedCodex.add(`fabricate-${role}.toml`);
    require_(exists(codexPath), `${codexPath} (Codex binding for ${token}) is missing`);
    require_(/Explore/.test(claudeCol), `AGENTS.md ${token} row Claude column must be the built-in Explore agent, got "${claudeCol}"`);
    continue;
  }

  fullRoles++;
  expectedCodex.add(`fabricate-${role}.toml`);
  expectedClaude.add(`fabricate-${role}.md`);

  const skillPath = `skills/fabricate-${role}/SKILL.md`;
  const claudePath = `.claude/agents/fabricate-${role}.md`;
  const skill = read(skillPath);
  const codex = read(codexPath);
  const claude = read(claudePath);

  require_(skill, `${skillPath} (canonical persona) is missing`);
  require_(codex, `${codexPath} (Codex binding) is missing`);
  require_(claude, `${claudePath} (Claude binding) is missing`);

  // Table cells cite the right skill + Codex paths, and the Claude column names the subagent.
  require_(skillCell.includes(skillPath), `AGENTS.md ${token} row must cite ${skillPath}, got "${skillCell}"`);
  require_(cells.some((c) => c.includes(codexPath)), `AGENTS.md ${token} row must cite ${codexPath}`);
  require_(claudeCol.includes(`fabricate-${role}`), `AGENTS.md ${token} row Claude column must be \`fabricate-${role}\`, got "${claudeCol}"`);

  if (codex) {
    require_(codex.includes(`name = "${token}"`), `${codexPath} must declare name = "${token}"`);
    require_(codex.includes(skillPath), `${codexPath} must reference ${skillPath}`);
  }
  if (claude) {
    require_(new RegExp(`^name:\\s*fabricate-${role}\\s*$`, "m").test(claude), `${claudePath} frontmatter must declare name: fabricate-${role}`);
    require_(claude.includes(skillPath), `${claudePath} must reference ${skillPath}`);
  }

  // Tool allowlist + sandbox parity.
  if (claude && codex) {
    const tools = parseTools(claude);
    require_(tools, `${claudePath} must declare an explicit tools: allowlist (no default inheritance)`);
    if (tools) {
      for (const banned of SPAWN_TOOLS) {
        require_(!tools.includes(banned), `${claudePath} must not include ${banned} — role agents must not spawn or route`);
      }
      const writeTools = tools.filter((t) => WRITE_TOOLS.includes(t));
      const codexReadOnly = /sandbox_mode\s*=\s*"read-only"/.test(codex);
      if (codexReadOnly) {
        require_(
          writeTools.length === 0,
          `${claudePath} must omit all mutation tools (${WRITE_TOOLS.join("/")}) to match ${codexPath} sandbox_mode = "read-only"; found ${writeTools.join(", ") || "none"}`,
        );
      } else {
        require_(
          tools.includes("Edit") && tools.includes("Write"),
          `${claudePath} must allow Edit and Write to match ${codexPath} full-access sandbox`,
        );
      }
    }
  }
}

// --- Orphan detection on BOTH provider directories ------------------------
const scanOrphans = (dir, ext, expected, label) => {
  const abs = join(root, dir);
  if (!existsSync(abs)) return;
  for (const file of readdirSync(abs)) {
    if (file.startsWith("fabricate-") && file.endsWith(ext)) {
      require_(expected.has(file), `${dir}/${file} (${label}) has no matching role row in the AGENTS.md bindings table`);
    }
  }
};
scanOrphans(".claude/agents", ".md", expectedClaude, "Claude binding");
scanOrphans(".codex/agents", ".toml", expectedCodex, "Codex binding");

if (errors.length) {
  console.error(`Agent binding validation failed (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`Agent bindings OK: ${fullRoles} skill-backed roles + ${mappingRoles} mapping role(s) derived from AGENTS.md, consistent across skills, both providers, tool/sandbox parity, and no orphan bindings.`);
