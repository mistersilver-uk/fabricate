#!/usr/bin/env node
// Validates that every agent role stays consistent across its canonical skill,
// both provider bindings, and the AGENTS.md "Agent Roles & Bindings" table.
//
// The role list is DERIVED from the AGENTS.md table (the single source of truth),
// not hard-coded — a new routed role or a stale binding on either side is caught.
//
// Beyond role bindings, this script also gates harness-document reference
// integrity (see the "Harness reference integrity" requirement in
// openspec/specs/agentic-workflow/spec.md):
//   - every conservatively path-shaped backtick reference in a harness document
//     must resolve to an existing file or directory (ALLOW_MISSING lists the
//     intentional exceptions, each with a reason);
//   - line-number code citations (file.js:NNN / "~line NNN") are rejected —
//     cite the symbol and file instead, locatable with `grep -n`;
//   - every skill-backed role pins a model in both provider bindings;
//   - the AGENTS.md "Shared skills with no persona binding" list must equal the
//     set of skills/ subdirectories containing a SKILL.md minus the role
//     directories derived from the bindings table.
//
// Pure Node, no dependencies, no Docker/network — behaves identically in CI and
// local dev. Run with `npm run validate:agents`. Exits non-zero on any mismatch.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Tools that let a role mutate the workspace. A Claude binding that mirrors a
// Codex `sandbox_mode = "read-only"` must include none of these.
const WRITE_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"];
// Bash can mutate files/git state, so a read-only role must normally omit it
// too. READONLY_BASH_ALLOWED lists the roles whose read-only Codex sandbox
// still permits command execution and whose skill genuinely needs Bash for
// read-only probes (e.g. foundry_integrator inspecting a local Foundry install
// or the repo's Foundry container image). Edit/Write remain banned for them.
const READONLY_BASH_ALLOWED = new Set(["foundry_integrator"]);
// Tools that let a role spawn/route sub-agents. Role agents must never nest.
const SPAWN_TOOLS = ["Agent", "Task"];

const errors = [];
const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null);
const require_ = (cond, msg) => { if (!cond) errors.push(msg); };

const normalizeToolsValue = (value) => value
  .replace(/\s+#.*$/, "")
  .trim()
  .replace(/^\[/, "")
  .replace(/\]$/, "")
  .split(",")
  .map((t) => t.trim().replace(/^["'`]|["'`]$/g, ""))
  .filter(Boolean);

const parseTools = (md) => {
  const m = md && md.match(/^tools:\s*(.+)$/m);
  return m ? normalizeToolsValue(m[1]) : null;
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
  const tokenCell = cells.find((c) => /^`(fabricate|foundry)_\w+`$/.test(c));
  if (!tokenCell) continue;
  rows.push({ cells, token: tokenCell.replace(/`/g, "") });
}
require_(rows.length > 0, "AGENTS.md bindings table has no role rows");

const expectedCodex = new Set();
const expectedClaude = new Set();
const roleDirs = new Set();
let fullRoles = 0;
let mappingRoles = 0;

for (const { cells, token } of rows) {
  // Every path is derived from the token itself (fabricate_* AND foundry_*),
  // so a role outside the fabricate- prefix is validated identically.
  const roleBase = token.replace(/_/g, "-");
  const codexPath = `.codex/agents/${roleBase}.toml`;
  const claudeCol = cells[cells.length - 1];
  const skillCell = cells.find((c) => c.includes("SKILL.md"));

  // Mapping role: no shared skill, no Claude binding — Claude uses Explore.
  if (!skillCell) {
    mappingRoles++;
    expectedCodex.add(`${roleBase}.toml`);
    const codex = read(codexPath);
    require_(codex, `${codexPath} (Codex binding for ${token}) is missing`);
    if (codex) {
      require_(/sandbox_mode\s*=\s*"read-only"/.test(codex), `${codexPath} must remain sandbox_mode = "read-only" for mapping role ${token}`);
    }
    require_(/Explore/.test(claudeCol), `AGENTS.md ${token} row Claude column must be the built-in Explore agent, got "${claudeCol}"`);
    continue;
  }

  fullRoles++;
  expectedCodex.add(`${roleBase}.toml`);
  expectedClaude.add(`${roleBase}.md`);
  roleDirs.add(roleBase);

  const skillPath = `skills/${roleBase}/SKILL.md`;
  const claudePath = `.claude/agents/${roleBase}.md`;
  const skill = read(skillPath);
  const codex = read(codexPath);
  const claude = read(claudePath);

  require_(skill, `${skillPath} (canonical persona) is missing`);
  require_(codex, `${codexPath} (Codex binding) is missing`);
  require_(claude, `${claudePath} (Claude binding) is missing`);

  // Table cells cite the right skill + Codex paths, and the Claude column names the subagent.
  require_(skillCell.includes(skillPath), `AGENTS.md ${token} row must cite ${skillPath}, got "${skillCell}"`);
  require_(cells.some((c) => c.includes(codexPath)), `AGENTS.md ${token} row must cite ${codexPath}`);
  require_(claudeCol.includes(roleBase), `AGENTS.md ${token} row Claude column must be \`${roleBase}\`, got "${claudeCol}"`);

  if (codex) {
    require_(codex.includes(`name = "${token}"`), `${codexPath} must declare name = "${token}"`);
    require_(codex.includes(skillPath), `${codexPath} must reference ${skillPath}`);
    require_(/^model\s*=\s*"\S+"/m.test(codex), `${codexPath} must pin a model (model = "...")`);
  }
  if (claude) {
    require_(new RegExp(`^name:\\s*${roleBase}\\s*$`, "m").test(claude), `${claudePath} frontmatter must declare name: ${roleBase}`);
    require_(claude.includes(skillPath), `${claudePath} must reference ${skillPath}`);
    require_(/^model:\s*\S+/m.test(claude), `${claudePath} frontmatter must pin a model (model: ...)`);
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
        require_(
          !tools.includes("Bash") || READONLY_BASH_ALLOWED.has(token),
          `${claudePath} must omit Bash to match ${codexPath} sandbox_mode = "read-only" (or add ${token} to READONLY_BASH_ALLOWED with a reason)`,
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
    if (/^(fabricate|foundry)-/.test(file) && file.endsWith(ext)) {
      require_(expected.has(file), `${dir}/${file} (${label}) has no matching role row in the AGENTS.md bindings table`);
    }
  }
};
scanOrphans(".claude/agents", ".md", expectedClaude, "Claude binding");
scanOrphans(".codex/agents", ".toml", expectedCodex, "Codex binding");

// --- Harness reference integrity -------------------------------------------
// The harness documents: the exact, closed set of files whose repo-path
// references and code citations this script gates. Mirrors the set named in
// openspec/specs/agentic-workflow/spec.md (Harness reference integrity).
const listDir = (rel, filter) => {
  const abs = join(root, rel);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).filter(filter).map((f) => `${rel}/${f}`);
};
const skillDirs = () => {
  const abs = join(root, "skills");
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
};
const harnessDocs = [
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "openspec/README.md",
  "skills/README.md",
  ...skillDirs().flatMap((d) => {
    const docs = [];
    if (existsSync(join(root, "skills", d, "SKILL.md"))) docs.push(`skills/${d}/SKILL.md`);
    docs.push(...listDir(`skills/${d}/references`, (f) => f.endsWith(".md")));
    return docs;
  }),
  ...listDir(".claude/agents", (f) => f.endsWith(".md")),
  ...listDir(".codex/agents", (f) => f.endsWith(".toml")),
].filter((rel) => existsSync(join(root, rel)));

// A backtick token is treated as a checkable repo path only when it is
// conservative: a known root file, or slash-joined under a known top-level
// segment, with no glob/template/expression characters. Everything else
// (commands, code identifiers, templated paths like a SKILL.md under a
// placeholder role directory) is skipped, never guessed at.
const KNOWN_SEGMENTS = [
  "src/", "tests/", "styles/", "lang/", "docs/", "scripts/", "skills/",
  "openspec/", "examples/", "assets/", ".claude/", ".codex/", ".github/",
];
const ROOT_FILES = new Set([
  "AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", "DOMAIN.md", "README.md",
  "COMPETITIVE_ANALYSIS.md", "module.json", "package.json", "main.js",
  "vite.config.js", "svelte.config.js", "eslint.config.js",
  "stylelint.config.js", "commitlint.config.js", "release.config.js",
  "docker-compose.foundry.yml", "sonar-project.properties",
  "release.s3.config.json", ".markdownlint-cli2.jsonc", ".prettierrc.json",
  ".nvmrc", ".node-version",
]);
// Paths that are intentionally absent. Each entry needs a reason.
const ALLOW_MISSING = new Set([
  // Created at the repo root by the competitive analyst on its first run.
  "COMPETITIVE_ANALYSIS.md",
  // Deliberately removed; harness docs cite it to say deltas are NOT versioned there.
  "openspec/changes/",
]);
const TEMPLATE_CHARS = /[*<>{}$|()\\"'\s,;!?=]|…/;

const isCheckablePath = (token) => {
  if (TEMPLATE_CHARS.test(token)) return false;
  if (token.includes("://")) return false;
  if (ROOT_FILES.has(token)) return true;
  return token.includes("/") && KNOWN_SEGMENTS.some((seg) => token.startsWith(seg));
};

// Line-number citations rot silently as code moves; cite symbol + file instead.
// A bare backticked `:NNN` is NOT banned — it cannot be told apart from a port
// reference like `:30000`, and shorthand citations only occur next to a primary
// file-colon-number citation, which the first pattern already rejects.
const LINE_CITATION_PATTERNS = [
  /`[^`\n]*\.[a-z]{2,6}\s*:\s*~?\d+[^`\n]*`/, // backticked file-colon-number citations
  /~line\s*\d+/i, // approximate line references
  /\(line\s+\d+\)/i, // parenthesised line references
];

for (const doc of harnessDocs) {
  const text = read(doc);
  if (!text) continue;

  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1].trim();
    if (!isCheckablePath(token)) continue;
    if (ALLOW_MISSING.has(token)) continue;
    const rel = token.replace(/\/$/, "");
    require_(existsSync(join(root, rel)), `${doc}: references missing path \`${token}\``);
  }

  const docLines = text.split("\n");
  for (let i = 0; i < docLines.length; i++) {
    for (const pattern of LINE_CITATION_PATTERNS) {
      if (pattern.test(docLines[i])) {
        errors.push(`${doc}:${i + 1}: line-number code citation — cite the symbol and file instead (grep -n locates it)`);
        break;
      }
    }
  }
}

// --- Shared-skills list parity ---------------------------------------------
// AGENTS.md "Shared skills with no persona binding" must equal the skills/
// subdirectories that contain a SKILL.md minus the role directories from the
// bindings table. Deleting or adding a shared skill without updating the list
// (or vice versa) fails here.
const sharedHeadingIdx = lines.findIndex((l) => l.trim().startsWith("### Shared skills with no persona binding"));
require_(sharedHeadingIdx >= 0, "AGENTS.md is missing the '### Shared skills with no persona binding' section");
const listedShared = new Set();
for (let i = sharedHeadingIdx + 1; sharedHeadingIdx >= 0 && i < lines.length; i++) {
  const l = lines[i];
  if (/^#{1,6}\s/.test(l)) break; // next heading
  const m = l.match(/^-\s+`skills\/([^/`]+)\/SKILL\.md`/);
  if (m) listedShared.add(m[1]);
}
const actualShared = new Set(
  skillDirs().filter((d) => existsSync(join(root, "skills", d, "SKILL.md")) && !roleDirs.has(d)),
);
for (const name of actualShared) {
  require_(listedShared.has(name), `skills/${name}/SKILL.md exists but is not listed under AGENTS.md '### Shared skills with no persona binding' (and is not a bound role)`);
}
for (const name of listedShared) {
  require_(actualShared.has(name), `AGENTS.md shared-skills list names skills/${name}/SKILL.md, which ${roleDirs.has(name) ? "is a bound role, not a shared skill" : "does not exist"}`);
}

if (errors.length) {
  console.error(`Agent binding validation failed (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`Agent bindings OK: ${fullRoles} skill-backed roles + ${mappingRoles} mapping role(s) derived from AGENTS.md, consistent across skills, both providers, tool/sandbox parity, no orphan bindings; ${harnessDocs.length} harness docs pass path-existence and citation checks; shared-skills list parity holds (${actualShared.size} shared skills).`);
