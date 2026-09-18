/**
 * THE AGENT BINDINGS ARE GENERATED, AND THIS IS THE PROOF THAT THEY STILL ARE (issue #1676). WHAT
 * TOOL/SANDBOX PARITY MEANS NOW, because it changed.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  bindingRenderErrors,
  renderedBindings,
  roleToolSafetyErrors,
} from '../scripts/lib/agentBindingRender.js';
import {
  BINDING_ROLES,
  bindingTargets,
  roleSkillPath,
} from '../scripts/lib/agentBindingRoles.js';
import { SPAWN_TOOLS, WRITE_TOOLS, parseBindingsTable } from '../scripts/lib/agentModelTiers.js';
import { allErrors } from '../scripts/validate-agent-bindings.mjs';

import { byCodePoint } from './helpers/ratchetBaseline.js';

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepo = (rel) => {
  const absolute = path.join(REPOSITORY_ROOT, rel);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
};

/** A `read` that returns `replacement` for one path and the real bytes for every other. */
const readWith = (target, replacement) => (rel) => (rel === target ? replacement : readRepo(rel));

test('1. every binding on disk is byte-identical to its render, so `--write` is a no-op', () => {
  const { files, errors } = renderedBindings();
  assert.deepEqual(errors, [], 'no role record may be unrenderable');
  assert.equal(files.size, 43, '21 Claude bindings + 22 Codex bindings');

  assert.deepEqual(
    bindingRenderErrors(readRepo),
    [],
    'a generated binding was hand-edited. Re-render with `npm run validate:agents -- --write` ' +
      'and make the change in scripts/lib/agentBindingRoles.js instead.'
  );
});

test('2. a hand edit to either provider fails the gate, and the failure names the line', () => {
  // A NEGATIVE CONTROL PROVES NOTHING UNTIL THE MUTATION IS PROVEN TO HAVE APPLIED.
  const cases = [
    {
      file: '.claude/agents/fabricate-implementer-large.md',
      from: 'model: opus',
      to: 'model: sonnet',
    },
    {
      file: '.codex/agents/fabricate-reviewer-medium.toml',
      from: '"Verifier"',
      to: '"Judge"',
    },
  ];

  for (const { file, from, to } of cases) {
    const original = readRepo(file);
    assert.ok(original?.includes(from), `${file} no longer contains ${from}; retarget this case`);
    const perturbed = original.replace(from, to);
    assert.notEqual(perturbed, original, `the ${file} mutation did not apply`);

    const errors = bindingRenderErrors(readWith(file, perturbed));
    assert.equal(errors.length, 1, `${file}: expected exactly one drift error, got ${errors}`);
    assert.match(errors[0], new RegExp(`^${file.replaceAll('.', String.raw`\.`)} differs`));
    assert.match(errors[0], /at line \d+: expected /, 'the failure must name the differing line');
    // The message quotes both sides with JSON.stringify, so match the token, not its quoting.
    assert.ok(errors[0].includes(to.replaceAll('"', '')), 'the failure must quote what it found');
  }

  // A DELETED binding is drift too, not a silently satisfied gate.
  const missing = bindingRenderErrors(readWith('.claude/agents/fabricate-reviewer-small.md', null));
  assert.deepEqual(missing, [
    '.claude/agents/fabricate-reviewer-small.md is missing — run `npm run validate:agents -- --write` to generate it',
  ]);
});

test('3. the generator cannot emit a spawn tool, or a mutation tool into a read-only role', () => {
  // (a) The real roster satisfies the rule.
  for (const role of BINDING_ROLES) {
    assert.deepEqual(roleToolSafetyErrors(role), [], `${role.token} declares unsafe tools`);
  }
  const readOnly = BINDING_ROLES.filter((r) => r.sandboxMode === 'read-only' && r.tools);
  assert.ok(readOnly.length >= 2, 'the roster must still contain read-only roles to check');

  // (b) And the rule BITES, which (a) alone cannot show. Each unsafe record is built from a real
  //     one so only the tools or the sandbox differ.
  const fullAccess = BINDING_ROLES.find((r) => r.sandboxMode === 'danger-full-access' && r.tools);
  const unsafe = [
    {
      why: 'a spawn tool in any role',
      role: { ...fullAccess, tools: `${fullAccess.tools}, Task` },
      expected: /must not include Task — role agents must not spawn or route/,
    },
    {
      why: 'a mutation tool in a read-only role',
      role: { ...readOnly[0], tools: `${readOnly[0].tools}, Write` },
      expected: /must omit all mutation tools \(Edit\/Write\/MultiEdit\/NotebookEdit\)/,
    },
    {
      why: 'a full-access role that cannot write',
      role: { ...fullAccess, tools: 'Read, Grep, Glob' },
      expected: /must allow Edit and Write to match/,
    },
  ];
  for (const { why, role, expected } of unsafe) {
    const errors = roleToolSafetyErrors(role);
    assert.ok(errors.some((e) => expected.test(e)), `${why}: not rejected, got ${errors}`);
    assert.ok(errors[0].includes('scripts/lib/agentBindingRoles.js'), 'name the record, not a file');
  }

  // (c) No rendered Claude binding hands out a spawn tool, whatever the records say.
  for (const [rel, text] of renderedBindings().files) {
    if (!rel.endsWith('.md')) continue;
    const tools = text.match(/^tools: (.*)$/m)?.[1].split(',').map((t) => t.trim());
    assert.ok(tools, `${rel} must declare tools`);
    for (const banned of SPAWN_TOOLS) assert.ok(!tools.includes(banned), `${rel} allows ${banned}`);
  }
  assert.deepEqual(WRITE_TOOLS, ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
});

test('4. the render gate is wired into the command line, not just importable', () => {
  // `main()` is driven by tests/agent-model-tiers.test.js over a synthetic fixture repo, so the
  // render gate cannot live inside it.
  assert.deepEqual(allErrors(REPOSITORY_ROOT), [], 'the real checkout must pass every gate');
  assert.ok(
    bindingRenderErrors(readWith('.codex/agents/fabricate-orchestrator.toml', 'name = "x"\n'))
      .length > 0,
    'the render gate composed into allErrors must be capable of failing'
  );
});

test('5. the roster and the AGENTS.md bindings table name exactly the same roles', () => {
  // The generator writes what the roster says; the validator checks what AGENTS.md says. A role
  // added to one and not the other is an orphan binding or a missing one, and this says which.
  const table = parseBindingsTable(readRepo('AGENTS.md'));
  const fromTable = [...table.tokens].sort(byCodePoint);
  const fromRoster = bindingTargets()
    .map(({ token }) => token)
    .sort(byCodePoint);
  assert.deepEqual(fromRoster, fromTable, 'the roster drifted from the AGENTS.md bindings table');

  // Every skill-backed role points at a SKILL.md that exists; the mapping role points at none.
  for (const role of BINDING_ROLES) {
    const skill = roleSkillPath(role);
    if (role.codexOnly) {
      assert.equal(skill, null, `${role.token} is the mapping role and must have no skill`);
      continue;
    }
    assert.ok(existsSync(path.join(REPOSITORY_ROOT, skill)), `${role.token}: ${skill} is missing`);
  }
});

test('6. the escalation contract is authored in the templates and nowhere a person hand-maintains', () => {
  // THE ACCEPTANCE THIS CHANGE WAS BUILT TO. 51 hand-maintained `ESCALATE_TIER` statements across
  // 36 binding files go to zero authored ones.
  const source = (rel) => readFileSync(path.join(REPOSITORY_ROOT, rel), 'utf8');
  const CONTRACT = 'This binding is model tier';

  // (a) The contract sentence is authored exactly twice: once per provider dialect.
  const templates = source('scripts/lib/agentBindingRender.js');
  assert.equal(
    templates.match(new RegExp(CONTRACT, 'g')).length,
    2,
    'the escalation contract belongs in one template per provider — no more, no fewer'
  );

  // (b) And in no role record, which is the half that would quietly reintroduce per-role drift.
  const roles = source('scripts/lib/agentBindingRoles.json');
  assert.ok(!roles.includes(CONTRACT), 'per-role data must not restate the escalation contract');
  assert.ok(
    !source('scripts/lib/agentBindingRoles.js').includes(CONTRACT),
    'the loader must not restate it either'
  );

  // (c) WHAT IS STILL IN THE ROLE DATA, pinned so it cannot grow. Five per-role VERDICT sentences
  // mention `ESCALATE_TIER` while telling a role what to emit.
  assert.equal(
    roles.match(/ESCALATE_TIER/g).length,
    5,
    'a new per-role ESCALATE_TIER sentence appeared. State the contract in the template instead.'
  );

  // (d) No BINDING FILE is a hand-maintained source of it any more — they are all generated.
  const carriers = [...renderedBindings().files].filter(([, t]) => t.includes('ESCALATE_TIER'));
  assert.equal(carriers.length, 36, 'all 36 model-tiered bindings must still carry the contract');
});
