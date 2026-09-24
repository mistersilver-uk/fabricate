/**
 * A facade method that delegates must not NARROW what it forwards (issue 1759). Why it survived a
 * fix is the part worth keeping, because it is the shape of the trap. Read through the AST of the
 * five slices, never their text (issue 1933).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Fabricate, INSTALLED_FACADE_MEMBERS } from '../src/bootstrap/Fabricate.js';
import { calledName, identifierNames, walkNodes } from './helpers/moduleAst.js';
import { moduleAstOf } from './helpers/parsedSource.js';

/** The slice modules `Fabricate.js` installs, each exporting one object of the same name. */
const SLICES = [
  'craftingFacade',
  'gatheringFacade',
  'companionFacade',
  'bulkFacade',
  'journalFacade',
];

/** Every member each slice declares, as `[name, functionNode]`. */
function sliceMembers() {
  return SLICES.flatMap((slice) => {
    const { ast } = moduleAstOf(`src/bootstrap/${slice}.js`);
    const exported = [...walkNodes(ast)].find(
      (node) => node.type === 'VariableDeclarator' && node.id?.name === slice
    );
    return exported.init.properties.map((property) => [property.key.name, property.value]);
  });
}

const paramName = (param) => (param.type === 'AssignmentPattern' ? param.left : param).name;

/** A call on `this.<service>`, optional links included — the delegation shape the facade uses. */
const callsOwnService = (call) => call.callee?.object?.object?.type === 'ThisExpression';

/**
 * Every method that hands off to a same-named method on one of its own services, as `{ method,
 * declared, forwarded }`; `forwarded` is every name any argument of that call mentions.
 */
function delegations() {
  const found = [];
  for (const [method, fn] of sliceMembers()) {
    for (const call of walkNodes(fn.body)) {
      if (calledName(call) !== method || !callsOwnService(call)) continue;
      found.push({
        method,
        declared: fn.params.map(paramName).filter(Boolean),
        forwarded: new Set(call.arguments.flatMap((argument) => [...identifierNames(argument)])),
      });
    }
  }
  return found;
}

test('every slice member really is installed on the prototype', () => {
  // The export exists so the install is asserted rather than inferred: a slice dropped from the
  // list, or a name declared twice across two slices, is visible here and nowhere else.
  assert.ok(
    INSTALLED_FACADE_MEMBERS.length > 60,
    `expected the five slices, got ${INSTALLED_FACADE_MEMBERS.length}`
  );
  assert.equal(
    new Set(INSTALLED_FACADE_MEMBERS).size,
    INSTALLED_FACADE_MEMBERS.length,
    'two slices declare the same member name, so one silently overwrites the other'
  );
  assert.deepEqual(
    sliceMembers().map(([name]) => name),
    INSTALLED_FACADE_MEMBERS,
    'the corpus below reads exactly the members the class installs, in install order'
  );
});

test('the gate finds the facade delegations it exists to police', () => {
  // A scan that silently matches nothing is the vacuous shape this work keeps turning up, so the
  // corpus is asserted before anything is concluded from it.
  const names = delegations().map((entry) => entry.method);
  assert.ok(names.length >= 5, `expected several delegating methods, found ${names.length}`);
  assert.ok(
    names.includes('executeJournalRunCommand'),
    `the method this gate was written for must be in the corpus; found ${JSON.stringify(names)}`
  );
});

test('no delegating facade method drops an argument its caller relies on', () => {
  const narrowed = delegations()
    .filter((entry) => entry.declared.some((param) => !entry.forwarded.has(param)))
    .map(
      (entry) =>
        `${entry.method}(${entry.declared.join(', ')}) forwards only (${[...entry.forwarded].join(', ')})`
    );
  assert.deepEqual(
    narrowed,
    [],
    'a facade method that declares a parameter and does not hand it on silently reverts the ' +
      'callee to its own default, which is how the public craft API came to open a roll dialog'
  );
});

test('executeJournalRunCommand hands its options to the command service', async () => {
  const received = [];
  const facade = Object.assign(new Fabricate(), {
    ready: true,
    journalRunCommands: { executeJournalRunCommand: async (...args) => received.push(args) },
  });
  const command = { type: 'start' };
  const options = { interactive: false };

  await facade.executeJournalRunCommand(command, options);

  assert.deepEqual(received, [[command, options]]);
});
