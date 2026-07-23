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
//   - every skill-backed role pins its declared model tier's model in both
//     provider bindings, and a model-tiered binding's description names its own
//     model tier and neither of the other two;
//   - a model-tiered family declares all three model tiers, resolves to its BASE
//     family skill, and the AGENTS.md `Family` table names exactly those tokens;
//   - the AGENTS.md "Shared skills with no persona binding" list must equal the
//     set of .agents/skills/ subdirectories containing a SKILL.md minus the role
//     directories derived from the bindings table.
//   - every repository skill has valid matching frontmatter and directly cites
//     each Markdown reference bundled under its references/ directory.
//
// This file is a THIN CALLER over scripts/lib/agentModelTiers.js, which holds the
// model-tier tables and the pure, error-returning gates over them. `main(root)`
// returns `errors[]` and never exits, so a test can import and drive it; only the
// entry-point guard at the bottom exits non-zero.
//
// Pure Node, no dependencies, no Docker/network — behaves identically in CI and
// local dev. Run with `npm run validate:agents`. Exits non-zero on any mismatch.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  familyCompletenessErrors,
  isReadonlyBashAllowed,
  modelPinErrors,
  parseBindingsTable,
  resolveRole,
} from './lib/agentModelTiers.js';

const SKILLS_ROOT = '.agents/skills';

// Tools that let a role mutate the workspace. A Claude binding that mirrors a
// Codex `sandbox_mode = "read-only"` must include none of these.
const WRITE_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
// Tools that let a role spawn/route sub-agents. Role agents must never nest.
const SPAWN_TOOLS = ['Agent', 'Task'];

// A backtick token is treated as a checkable repo path only when it is
// conservative: a known root file, or slash-joined under a known top-level
// segment, with no glob/template/expression characters. Everything else
// (commands, code identifiers, templated paths like a SKILL.md under a
// placeholder role directory) is skipped, never guessed at.
const KNOWN_SEGMENTS = [
  'src/',
  'tests/',
  'styles/',
  'lang/',
  'docs/',
  'scripts/',
  'skills/',
  '.agents/',
  'openspec/',
  'examples/',
  'assets/',
  '.claude/',
  '.codex/',
  '.github/',
];
const ROOT_FILES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'DOMAIN.md',
  'README.md',
  'COMPETITIVE_ANALYSIS.md',
  'module.json',
  'package.json',
  'main.js',
  'vite.config.js',
  'svelte.config.js',
  'eslint.config.js',
  'stylelint.config.js',
  'commitlint.config.js',
  'release.config.js',
  'docker-compose.foundry.yml',
  'sonar-project.properties',
  'release.s3.config.json',
  '.markdownlint-cli2.jsonc',
  '.prettierrc.json',
  '.nvmrc',
  '.node-version',
]);
// Paths that are intentionally absent. Each entry needs a reason.
const ALLOW_MISSING = new Set([
  // Created at the repo root by the competitive analyst on its first run.
  'COMPETITIVE_ANALYSIS.md',
  // Deliberately removed; harness docs cite it to say deltas are NOT versioned there.
  'openspec/changes/',
]);
const TEMPLATE_CHARS = /[*<>{}$|()\\"'\s,;!?=]|…/;

// Line-number citations rot silently as code moves; cite symbol + file instead.
// A bare backticked `:NNN` is NOT banned — it cannot be told apart from a port
// reference like `:30000`, and shorthand citations only occur next to a primary
// file-colon-number citation, which the first pattern already rejects.
const LINE_CITATION_PATTERNS = [
  /`[^`\n]*\.[a-z]{2,6}\s*:\s*~?\d+[^`\n]*`/, // backticked file-colon-number citations
  /~line\s*\d+/i, // approximate line references
  /\(line\s+\d+\)/i, // parenthesised line references
];

const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const yamlNonStringPattern = /^(?:null|~|true|false|yes|no|on|off)$/i;
const yamlPlainStringPattern = /^[A-Za-z][A-Za-z0-9 _.,;!?\/()'"`*+=-]*$/;

const normalizeToolsValue = (value) =>
  value
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((t) => t.trim().replace(/^["'`]|["'`]$/g, ''))
    .filter(Boolean);

const parseTools = (md) => {
  const m = md && md.match(/^tools:\s*(.+)$/m);
  return m ? normalizeToolsValue(m[1]) : null;
};

const isCheckablePath = (token) => {
  if (TEMPLATE_CHARS.test(token)) return false;
  if (token.includes('://')) return false;
  if (ROOT_FILES.has(token)) return true;
  return token.includes('/') && KNOWN_SEGMENTS.some((seg) => token.startsWith(seg));
};

// --- Filesystem port --------------------------------------------------------
// Every filesystem read is funnelled through here so `main(root)` is the only
// thing that knows where the repository is.
function createIo(root) {
  const abs = (rel) => join(root, rel);
  const exists = (rel) => existsSync(abs(rel));
  const read = (rel) => (exists(rel) ? readFileSync(abs(rel), 'utf8') : null);
  const listDir = (rel, filter) => {
    if (!exists(rel)) return [];
    return readdirSync(abs(rel))
      .filter(filter)
      .map((f) => `${rel}/${f}`);
  };
  const listTree = (rel, filter) => {
    if (!exists(rel)) return [];
    return readdirSync(abs(rel), { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((entry) => {
        const child = `${rel}/${entry.name}`;
        if (entry.isDirectory()) return listTree(child, filter);
        return entry.isFile() && filter(entry.name) ? [child] : [];
      });
  };
  const skillDirs = () => {
    if (!exists(SKILLS_ROOT)) return [];
    return readdirSync(abs(SKILLS_ROOT), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  };
  const hasSkill = (family) => exists(`${SKILLS_ROOT}/${family.replaceAll('_', '-')}/SKILL.md`);
  return { abs, exists, read, listDir, listTree, skillDirs, hasSkill };
}

// --- Role rows --------------------------------------------------------------

function validateMappingRole(ctx, row, resolved) {
  const { req, io } = ctx;
  const { token, roleBase, declaredTier } = resolved;
  const codexPath = `.codex/agents/${roleBase}.toml`;
  const claudeCol = row.cells[row.cells.length - 1];
  const codex = io.read(codexPath);
  req(codex, `${codexPath} (Codex binding for ${token}) is missing`);
  if (codex) {
    req(
      /sandbox_mode\s*=\s*"read-only"/.test(codex),
      `${codexPath} must remain sandbox_mode = "read-only" for mapping role ${token}`
    );
  }
  req(
    /Explore/.test(claudeCol),
    `AGENTS.md ${token} row Claude column must be the built-in Explore agent, got "${claudeCol}"`
  );
  // Gated on its Codex pin only: Claude's built-in Explore has no repository
  // binding and this repository cannot set its model.
  ctx.errors.push(
    ...modelPinErrors({
      token,
      tier: declaredTier,
      codexPath,
      codexText: codex,
      requireClaude: false,
    })
  );
}

function validateToolParity(ctx, { token, claudePath, claude, codexPath, codex }) {
  const { req } = ctx;
  const tools = parseTools(claude);
  req(tools, `${claudePath} must declare an explicit tools: allowlist (no default inheritance)`);
  if (!tools) return;
  for (const banned of SPAWN_TOOLS) {
    req(
      !tools.includes(banned),
      `${claudePath} must not include ${banned} — role agents must not spawn or route`
    );
  }
  const writeTools = tools.filter((t) => WRITE_TOOLS.includes(t));
  if (/sandbox_mode\s*=\s*"read-only"/.test(codex)) {
    req(
      writeTools.length === 0,
      `${claudePath} must omit all mutation tools (${WRITE_TOOLS.join('/')}) to match ${codexPath} sandbox_mode = "read-only"; found ${writeTools.join(', ') || 'none'}`
    );
    // Resolved against the BASE FAMILY token, so foundry_integrator keeps its
    // read-only Bash exemption at all three model tiers and no other family gains it.
    req(
      !tools.includes('Bash') || isReadonlyBashAllowed(token),
      `${claudePath} must omit Bash to match ${codexPath} sandbox_mode = "read-only" (or add its base family to READONLY_BASH_ALLOWED in scripts/lib/agentModelTiers.js with a reason)`
    );
  } else {
    req(
      tools.includes('Edit') && tools.includes('Write'),
      `${claudePath} must allow Edit and Write to match ${codexPath} full-access sandbox`
    );
  }
}

function validateSkillBackedRole(ctx, row, resolved, skillCell) {
  const { req, io } = ctx;
  const { token, roleBase, skillDir, declaredTier } = resolved;
  const cells = row.cells;
  const claudeCol = cells[cells.length - 1];

  const skillPath = `${SKILLS_ROOT}/${skillDir}/SKILL.md`;
  const codexPath = `.codex/agents/${roleBase}.toml`;
  const claudePath = `.claude/agents/${roleBase}.md`;
  const skill = io.read(skillPath);
  const codex = io.read(codexPath);
  const claude = io.read(claudePath);

  req(skill, `${skillPath} (canonical persona) is missing`);
  req(codex, `${codexPath} (Codex binding) is missing`);
  req(claude, `${claudePath} (Claude binding) is missing`);

  // Table cells cite the right skill + Codex paths, and the Claude column names the subagent.
  req(skillCell.includes(skillPath), `AGENTS.md ${token} row must cite ${skillPath}, got "${skillCell}"`);
  req(
    cells.some((c) => c.includes(codexPath)),
    `AGENTS.md ${token} row must cite ${codexPath}`
  );
  req(
    claudeCol.includes(roleBase),
    `AGENTS.md ${token} row Claude column must be \`${roleBase}\`, got "${claudeCol}"`
  );

  if (codex) {
    req(codex.includes(`name = "${token}"`), `${codexPath} must declare name = "${token}"`);
    req(codex.includes(skillPath), `${codexPath} must reference ${skillPath}`);
  }
  if (claude) {
    req(
      new RegExp(`^name:\\s*${roleBase}\\s*$`, 'm').test(claude),
      `${claudePath} frontmatter must declare name: ${roleBase}`
    );
    req(claude.includes(skillPath), `${claudePath} must reference ${skillPath}`);
  }

  ctx.errors.push(
    ...modelPinErrors({
      token,
      tier: declaredTier,
      claudePath,
      claudeText: claude,
      codexPath,
      codexText: codex,
    })
  );

  if (claude && codex) {
    validateToolParity(ctx, { token, claudePath, claude, codexPath, codex });
  }
}

function validateRoles(ctx, table) {
  const { req, io } = ctx;
  const tokens = table.tokens;
  const expectedCodex = new Set();
  const expectedClaude = new Set();
  const roleDirs = new Set();
  let fullRoles = 0;
  let mappingRoles = 0;

  for (const cell of table.skipped) {
    req(
      false,
      `AGENTS.md bindings table row ${cell} is not a bare \`(fabricate|foundry)_\\w+\` routing token — a hyphenated model-tier suffix is silently skipped by the parser`
    );
  }

  ctx.errors.push(
    ...familyCompletenessErrors({ tokens, hasSkill: io.hasSkill, agentsMdText: ctx.agentsMd ?? '' })
  );

  for (const row of table.rows) {
    // Every path is derived from the token itself (fabricate_* AND foundry_*),
    // so a role outside the fabricate- prefix is validated identically.
    const resolved = resolveRole(row.token, { tokens, hasSkill: io.hasSkill });
    expectedCodex.add(`${resolved.roleBase}.toml`);
    const skillCell = row.cells.find((c) => c.includes('SKILL.md'));

    // Mapping role: no shared skill, no Claude binding — Claude uses Explore.
    if (!skillCell) {
      mappingRoles++;
      validateMappingRole(ctx, row, resolved);
      continue;
    }

    fullRoles++;
    expectedClaude.add(`${resolved.roleBase}.md`);
    // The BASE FAMILY directory, so the six persona skills are not misclassified
    // as unbound shared skills.
    roleDirs.add(resolved.skillDir);
    validateSkillBackedRole(ctx, row, resolved, skillCell);
  }

  return { expectedCodex, expectedClaude, roleDirs, fullRoles, mappingRoles };
}

// --- Orphan detection on BOTH provider directories --------------------------
function scanOrphans(ctx, dir, ext, expected, label) {
  const { req, io } = ctx;
  if (!io.exists(dir)) return;
  for (const file of readdirSync(io.abs(dir))) {
    if (/^(fabricate|foundry)-/.test(file) && file.endsWith(ext)) {
      req(
        expected.has(file),
        `${dir}/${file} (${label}) has no matching role row in the AGENTS.md bindings table`
      );
    }
  }
}

// --- Harness reference integrity --------------------------------------------
// The harness documents: the exact, closed set of files whose repo-path
// references and code citations this script gates. Mirrors the set named in
// openspec/specs/agentic-workflow/spec.md (Harness reference integrity).
function harnessDocList(io) {
  return [
    'AGENTS.md',
    'CLAUDE.md',
    'CONTRIBUTING.md',
    'openspec/README.md',
    `${SKILLS_ROOT}/README.md`,
    ...io.skillDirs().flatMap((d) => {
      const docs = [];
      if (io.exists(`${SKILLS_ROOT}/${d}/SKILL.md`)) docs.push(`${SKILLS_ROOT}/${d}/SKILL.md`);
      docs.push(...io.listTree(`${SKILLS_ROOT}/${d}/references`, (f) => f.endsWith('.md')));
      return docs;
    }),
    ...io.listDir('.claude/agents', (f) => f.endsWith('.md')),
    ...io.listDir('.codex/agents', (f) => f.endsWith('.toml')),
  ].filter((rel) => io.exists(rel));
}

function validateHarnessDocs(ctx, harnessDocs) {
  const { req, io, errors } = ctx;
  for (const doc of harnessDocs) {
    const text = io.read(doc);
    if (!text) continue;

    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      const token = match[1].trim();
      if (!isCheckablePath(token)) continue;
      if (ALLOW_MISSING.has(token)) continue;
      const rel = token.replace(/\/$/, '');
      req(io.exists(rel), `${doc}: references missing path \`${token}\``);
    }

    const docLines = text.split('\n');
    for (const [i, docLine] of docLines.entries()) {
      if (LINE_CITATION_PATTERNS.some((pattern) => pattern.test(docLine))) {
        errors.push(
          `${doc}:${i + 1}: line-number code citation — cite the symbol and file instead (grep -n locates it)`
        );
      }
    }
  }
}

// --- Repository skill discovery and progressive disclosure ------------------
// Codex scans .agents/skills from the working directory to the repository root.
// Validate the metadata it initially sees and ensure every bundled Markdown
// reference is named by its owning SKILL.md so the full material is reachable
// after that skill activates.
function parseYamlString(raw) {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) return null;
    const inner = value.slice(1, -1);
    if (inner.replaceAll("''", '').includes("'")) return null;
    return inner.replaceAll("''", "'");
  }
  // Keep plain values inside a conservative lexical subset that YAML parsers
  // consistently resolve as strings. Other valid strings can use quotes.
  if (!yamlPlainStringPattern.test(value) || yamlNonStringPattern.test(value)) return null;
  return value;
}

function parseSkillFrontmatter(ctx, frontmatter, skillPath) {
  const { req } = ctx;
  const fields = new Map();
  for (const line of frontmatter.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^([a-z][a-z0-9-]*):\s*(.*)$/);
    req(match, `${skillPath} frontmatter must contain only single-line key/value fields`);
    if (!match) continue;
    const [, field, raw] = match;
    req(
      ['name', 'description'].includes(field),
      `${skillPath} frontmatter contains unsupported field ${field}`
    );
    req(!fields.has(field), `${skillPath} frontmatter contains duplicate field ${field}`);
    const value = parseYamlString(raw);
    req(value !== null, `${skillPath} frontmatter ${field} must be a valid YAML string`);
    if (['name', 'description'].includes(field) && !fields.has(field)) fields.set(field, value);
  }
  return fields;
}

function validateSkillFrontmatter(ctx, dir, skill, skillPath) {
  const { req } = ctx;
  const frontmatterMatch = skill.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  req(frontmatterMatch, `${skillPath} must start with YAML frontmatter`);
  if (!frontmatterMatch) return;
  const fields = parseSkillFrontmatter(ctx, frontmatterMatch[1], skillPath);
  const name = fields.get('name');
  const description = fields.get('description');
  req(
    name === dir,
    `${skillPath} frontmatter name must match its directory (${dir}), got ${JSON.stringify(name)}`
  );
  req(
    name && name.length <= 64 && skillNamePattern.test(name),
    `${skillPath} frontmatter name must use at most 64 lowercase letters, digits, and hyphens`
  );
  req(
    description && description.length <= 1024,
    `${skillPath} frontmatter description must contain 1-1024 characters`
  );
  req(
    description && !/[<>]/.test(description),
    `${skillPath} frontmatter description must not contain angle brackets`
  );
}

function validateSkills(ctx) {
  const { req, io } = ctx;
  req(io.exists(SKILLS_ROOT), `${SKILLS_ROOT}/ (Codex repository skill root) is missing`);
  req(
    !io.exists('skills'),
    'skills/ is a legacy repository skill root; keep a single canonical tree under .agents/skills/'
  );

  for (const dir of io.skillDirs()) {
    const skillPath = `${SKILLS_ROOT}/${dir}/SKILL.md`;
    const skill = io.read(skillPath);
    req(skill, `${skillPath} is missing from repository skill directory ${dir}`);
    if (!skill) continue;

    validateSkillFrontmatter(ctx, dir, skill, skillPath);

    const citedPaths = [...skill.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].replaceAll('\\', '/'));
    const references = io.listTree(`${SKILLS_ROOT}/${dir}/references`, (f) => f.endsWith('.md'));
    for (const reference of references) {
      const rel = reference.slice(`${SKILLS_ROOT}/${dir}/`.length);
      const cited = citedPaths.some((p) => p === rel || p.endsWith(`/${rel}`));
      req(
        cited,
        `${reference} is not cited directly by its owning ${skillPath} with full relative path \`${rel}\``
      );
    }
  }
}

// --- Shared-skills list parity ----------------------------------------------
// AGENTS.md "Shared skills with no persona binding" must equal the .agents/skills/
// subdirectories that contain a SKILL.md minus the role directories from the
// bindings table. Deleting or adding a shared skill without updating the list
// (or vice versa) fails here.
function validateSharedSkills(ctx, roleDirs) {
  const { req, io } = ctx;
  const lines = (ctx.agentsMd ?? '').split('\n');
  const headingIdx = lines.findIndex((l) =>
    l.trim().startsWith('### Shared skills with no persona binding')
  );
  req(
    headingIdx >= 0,
    "AGENTS.md is missing the '### Shared skills with no persona binding' section"
  );
  const listedShared = new Set();
  for (let i = headingIdx + 1; headingIdx >= 0 && i < lines.length; i++) {
    const l = lines[i];
    if (/^#{1,6}\s/.test(l)) break; // next heading
    const m = l.match(/^-\s+`\.agents\/skills\/([^/`]+)\/SKILL\.md`/);
    if (m) listedShared.add(m[1]);
  }
  const actualShared = new Set(
    io.skillDirs().filter((d) => io.exists(`${SKILLS_ROOT}/${d}/SKILL.md`) && !roleDirs.has(d))
  );
  for (const name of actualShared) {
    req(
      listedShared.has(name),
      `${SKILLS_ROOT}/${name}/SKILL.md exists but is not listed under AGENTS.md '### Shared skills with no persona binding' (and is not a bound role)`
    );
  }
  for (const name of listedShared) {
    const why = roleDirs.has(name) ? 'is a bound role, not a shared skill' : 'does not exist';
    req(
      actualShared.has(name),
      `AGENTS.md shared-skills list names ${SKILLS_ROOT}/${name}/SKILL.md, which ${why}`
    );
  }
  return actualShared;
}

/**
 * Run every gate against a repository root and RETURN the accumulated errors.
 * Never throws, never exits — the entry-point guard owns the exit code, so a test
 * can import this without hard-killing the `node --test` process.
 * @param {string} root Absolute path to the repository root.
 * @returns {string[]}
 */
export function main(root) {
  const io = createIo(root);
  const errors = [];
  const req = (cond, msg) => {
    if (!cond) errors.push(msg);
  };
  const agentsMd = io.read('AGENTS.md');
  req(agentsMd, 'AGENTS.md is missing');

  const ctx = { io, errors, req, agentsMd };
  const table = parseBindingsTable(agentsMd ?? '');
  req(
    table.headerIndex >= 0,
    "AGENTS.md is missing the Agent Roles & Bindings table (header with 'Routing token' and 'Claude')"
  );
  req(table.rows.length > 0, 'AGENTS.md bindings table has no role rows');

  const roles = validateRoles(ctx, table);
  scanOrphans(ctx, '.claude/agents', '.md', roles.expectedClaude, 'Claude binding');
  scanOrphans(ctx, '.codex/agents', '.toml', roles.expectedCodex, 'Codex binding');

  const harnessDocs = harnessDocList(io);
  validateHarnessDocs(ctx, harnessDocs);
  validateSkills(ctx);
  const actualShared = validateSharedSkills(ctx, roles.roleDirs);

  if (errors.length === 0) {
    const mapping = `${roles.mappingRoles} mapping role${roles.mappingRoles === 1 ? '' : 's'}`;
    console.log(
      `Agent bindings OK: ${roles.fullRoles} skill-backed roles + ${mapping} derived from AGENTS.md, consistent across ${io.skillDirs().length} Codex-discoverable repository skills, both providers, model-tier pins, tool/sandbox parity, no orphan bindings; ${harnessDocs.length} harness docs pass path-existence and citation checks; skill metadata, bundled-reference reachability, and shared-skills list parity hold (${actualShared.size} shared skills).`
    );
  }
  return errors;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const errors = main(repoRoot);
  if (errors.length) {
    console.error(`Agent binding validation failed (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}
