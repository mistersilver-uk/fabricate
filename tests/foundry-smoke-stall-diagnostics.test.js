/**
 * The smoke's stall report (issue 2192): what a GM page that renders no frames spent its time on,
 * summarised from the DevTools Protocol's profile, metrics and process reads.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  hottestFrames,
  metricGrowth,
  processCpuGrowth,
} from '../scripts/foundry-smoke/pageOps/stallDiagnostics.mjs';

const frame = (functionName, url, lineNumber) => ({ functionName, url, lineNumber });

describe('the stall report', () => {
  it('ranks callFrames by sampled self time and merges nodes of one frame', () => {
    const profile = {
      nodes: [
        { id: 1, callFrame: frame('(root)', '', -1) },
        { id: 2, callFrame: frame('render', 'http://x/modules/fabricate/main.js', 9) },
        { id: 3, callFrame: frame('render', 'http://x/modules/fabricate/main.js', 9) },
        { id: 4, callFrame: frame('', 'http://x/scripts/foundry.mjs', 99) },
      ],
      samples: [2, 3, 4, 2],
      timeDeltas: [0, 4000, 1000, 2000],
    };
    assert.deepStrictEqual(hottestFrames(profile, 2), [
      { fn: 'render', at: 'main.js:10', ms: 7 },
      { fn: '(anonymous)', at: 'foundry.mjs:100', ms: 2 },
    ]);
  });

  it('answers an empty ranking for a missing profile', () => {
    assert.deepStrictEqual(hottestFrames(undefined), []);
  });

  it('turns cumulative main-thread seconds into the window ms each kind of work took', () => {
    const before = [
      { name: 'TaskDuration', value: 1 },
      { name: 'ScriptDuration', value: 0.5 },
    ];
    const after = [
      { name: 'TaskDuration', value: 1.25 },
      { name: 'ScriptDuration', value: 0.6 },
    ];
    assert.deepStrictEqual(metricGrowth(before, after, ['TaskDuration', 'ScriptDuration']), {
      TaskDuration: 250,
      ScriptDuration: 100,
    });
  });

  it('sums the CPU each process type burned, counting a new process from zero', () => {
    const before = [
      { id: 1, type: 'renderer', cpuTime: 10 },
      { id: 2, type: 'GPU', cpuTime: 4 },
    ];
    const after = [
      { id: 1, type: 'renderer', cpuTime: 10.5 },
      { id: 2, type: 'GPU', cpuTime: 8 },
      { id: 3, type: 'renderer', cpuTime: 1 },
    ];
    assert.deepStrictEqual(processCpuGrowth(before, after), { renderer: 1.5, GPU: 4 });
  });
});
