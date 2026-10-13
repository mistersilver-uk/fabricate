/**
 * Mount the real expression field under a controlling caller, in a manager root (issue 2465).
 * `?value=` is the mounted expression, `?tokens=` a comma-separated row, `?shell` stands the field
 * in a field shell, `?disabled` disables it, `?resolve` passes a resolver over `ROLL_DATA`, and
 * `?parent=trim` makes the caller echo each write trimmed.
 */
import { mount } from 'svelte';

import { resolveDeterministicExpression } from '../../../src/systems/checkEvaluation.js';

import ExprInputHost from './ExprInputHost.svelte';

const ROLL_DATA = { prof: 3, abilities: { dex: { mod: 2 } } };

function resolveOverRollData(expression) {
  const read = resolveDeterministicExpression(expression, ROLL_DATA, { pathMode: 'foundry' });
  return read.ok ? read.value : null;
}

const params = new URLSearchParams(globalThis.location.search);
const { dataset } = document.documentElement;

const frame = document.createElement('div');
frame.className = 'application fabricate';
const root = document.createElement('div');
root.className = 'fabricate-manager';
root.dataset.fabricateTheme = 'dark';
frame.append(root);
document.body.append(frame);

mount(ExprInputHost, {
  target: root,
  props: {
    initialValue: params.get('value') ?? '',
    tokens: (params.get('tokens') ?? '@prof,1d4').split(','),
    shell: params.has('shell'),
    disabled: params.has('disabled'),
    resolve: params.has('resolve') ? resolveOverRollData : undefined,
    echo: params.get('parent') === 'trim' ? (next) => next.trim() : (next) => next,
    onWrite: (next) => {
      dataset.exprInputWrites = JSON.stringify([
        ...JSON.parse(dataset.exprInputWrites ?? '[]'),
        next,
      ]);
    },
  },
});

dataset.exprInputReady = 'true';
