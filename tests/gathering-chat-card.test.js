/**
 * Unit tests for the pure gathering chat card formatter
 * (`buildGatheringChatContent`). No Foundry globals required.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGatheringChatContent } from '../src/systems/GatheringChatCard.js';

function fullModel(overrides = {}) {
  return {
    status: 'succeeded',
    actorName: 'Aria',
    taskName: 'Forage Herbs',
    components: [
      { name: 'Sage Leaf', img: 'icons/sage.png', quantity: 3 },
      { name: 'Wild Root', img: 'icons/root.png', quantity: 1 }
    ],
    hazards: [{ name: 'Thornpatch', img: 'icons/thorn.png' }],
    brokenTools: [{ name: 'Worn Sickle', img: 'icons/sickle.png' }],
    staminaSpent: 5,
    nodesRemaining: 2,
    ...overrides
  };
}

test('renders success header, modifier class, actor and task', () => {
  const content = buildGatheringChatContent(fullModel());
  assert.ok(content.includes('fabricate-gather-chat--success'), 'success modifier class');
  assert.ok(content.includes('FABRICATE.Chat.GatherSuccess'), 'success title key (identity localize)');
  assert.ok(content.includes('Aria'), 'actor name');
  assert.ok(content.includes('Forage Herbs'), 'task name');
});

test('renders components with quantity prefix and image src', () => {
  const content = buildGatheringChatContent(fullModel());
  assert.ok(content.includes('3× Sage Leaf'), 'quantity > 1 prefixed');
  assert.ok(content.includes('Wild Root') && !content.includes('1× Wild Root'), 'quantity 1 not prefixed');
  assert.ok(content.includes('src="icons/sage.png"'), 'component image src');
});

test('renders hazards and broken tools with images', () => {
  const content = buildGatheringChatContent(fullModel());
  assert.ok(content.includes('FABRICATE.Chat.GatherHazards'), 'hazards heading');
  assert.ok(content.includes('Thornpatch'), 'hazard name');
  assert.ok(content.includes('src="icons/thorn.png"'), 'hazard image');
  assert.ok(content.includes('FABRICATE.Chat.GatherToolsBroken'), 'broken tools heading');
  assert.ok(content.includes('Worn Sickle'), 'broken tool name');
  assert.ok(content.includes('src="icons/sickle.png"'), 'broken tool image');
});

test('renders stamina and remaining nodes as icon pills', () => {
  const content = buildGatheringChatContent(fullModel());
  assert.ok(content.includes('FABRICATE.Chat.GatherStamina'), 'stamina label');
  assert.ok(content.includes('FABRICATE.Chat.GatherNodes'), 'nodes label');
  assert.ok(content.includes('>5</span>'), 'stamina value emphasized');
  assert.ok(content.includes('>2</span>'), 'nodes value emphasized');
  assert.ok(content.includes('fabricate-gather-chat__stat-icon fas fa-bolt'), 'stamina lightning bolt icon');
  assert.ok(content.includes('fabricate-gather-chat__stat-icon fas fa-mountain'), 'nodes mountain icon');
});

test('failure status uses failure header and modifier', () => {
  const content = buildGatheringChatContent(fullModel({ status: 'failed', components: [] }));
  assert.ok(content.includes('fabricate-gather-chat--failure'), 'failure modifier');
  assert.ok(content.includes('FABRICATE.Chat.GatherFailure'), 'failure title');
  assert.ok(!content.includes('FABRICATE.Chat.GatherComponents'), 'empty components section omitted');
  assert.ok(content.includes('Thornpatch'), 'hazards still shown on failure');
});

test('omits empty arrays and null economy sections', () => {
  const content = buildGatheringChatContent({
    status: 'succeeded',
    actorName: 'Aria',
    taskName: 'Forage Herbs',
    components: [{ name: 'Sage Leaf', img: 'icons/sage.png', quantity: 1 }],
    hazards: [],
    brokenTools: [],
    staminaSpent: null,
    nodesRemaining: null
  });
  assert.ok(!content.includes('FABRICATE.Chat.GatherHazards'), 'no hazard section');
  assert.ok(!content.includes('FABRICATE.Chat.GatherToolsBroken'), 'no broken tools section');
  assert.ok(!content.includes('FABRICATE.Chat.GatherStamina'), 'no stamina stat');
  assert.ok(!content.includes('FABRICATE.Chat.GatherNodes'), 'no nodes stat');
  assert.ok(!content.includes('fabricate-gather-chat__footer'), 'footer omitted with no stats');
});

test('zero nodes remaining still renders (0 is meaningful)', () => {
  const content = buildGatheringChatContent(fullModel({ nodesRemaining: 0 }));
  assert.ok(content.includes('FABRICATE.Chat.GatherNodes'), 'nodes label shown');
  assert.ok(content.includes('>0</span>'), 'zero nodes value shown');
});

test('escapes HTML in user-authored names', () => {
  const content = buildGatheringChatContent(fullModel({
    components: [{ name: '<script>x</script> & "rare"', img: 'icons/x.png', quantity: 1 }]
  }));
  assert.ok(!content.includes('<script>x</script>'), 'raw script tag not present');
  assert.ok(content.includes('&lt;script&gt;'), 'angle brackets escaped');
  assert.ok(content.includes('&amp;'), 'ampersand escaped');
  assert.ok(content.includes('&quot;rare&quot;'), 'quotes escaped');
});

test('routes every label through the localize function', () => {
  const seen = [];
  buildGatheringChatContent(fullModel(), (key) => { seen.push(key); return `loc:${key}`; });
  for (const key of ['GatherSuccess', 'GatherActor', 'GatherTask', 'GatherComponents', 'GatherHazards', 'GatherToolsBroken', 'GatherStamina', 'GatherNodes']) {
    assert.ok(seen.includes(`FABRICATE.Chat.${key}`), `localize asked for FABRICATE.Chat.${key}`);
  }
});
