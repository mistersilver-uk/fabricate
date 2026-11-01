/**
 * The `Popover` anchor watch (issue 2861) in a happy-dom window: one read per animation frame
 * however many mutations land in it, none for a mutation inside the panel, `onMoved` for an anchor
 * that stayed, `onChange` for one that went or came, no layout read while the mount is detached,
 * and no observer once it is disabled or destroyed.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { Window } from 'happy-dom';

import { followAnchor } from '../src/ui/svelte/actions/followAnchor.js';

let view;
let doc;

beforeEach(() => {
  view = new Window({ url: 'http://localhost/' });
  doc = view.document;
});

afterEach(async () => {
  await view.happyDOM.close();
});

const frame = () => new Promise((done) => view.requestAnimationFrame(() => setTimeout(done, 0)));

/** A mount element, an anchor carrying `cell`, and a panel, all in the document. */
function scene() {
  const node = doc.createElement('span');
  const anchor = doc.createElement('button');
  anchor.id = 'cell';
  const panel = doc.createElement('div');
  doc.body.append(node, anchor, panel);
  const seen = { changes: [], moves: 0, reads: 0 };
  const read = anchor.getClientRects.bind(anchor);
  anchor.getClientRects = () => {
    seen.reads += 1;
    return read();
  };
  const options = {
    id: 'cell',
    enabled: true,
    ignore: () => panel,
    onChange: (next) => {
      seen.changes.push(next);
    },
    onMoved: () => {
      seen.moves += 1;
    },
  };
  return { node, anchor, panel, seen, options };
}

describe('the popover anchor watch', () => {
  it('reads once per frame for many mutations, and reports an anchor that stayed as moved', async () => {
    const { node, anchor, seen, options } = scene();
    const action = followAnchor(node, options);
    try {
      assert.deepEqual(seen.changes, [anchor], 'read at once');
      for (let at = 0; at < 5; at += 1) doc.body.append(doc.createElement('p'));
      await frame();
      assert.equal(seen.moves, 1, 'one read for the frame');
    } finally {
      action.destroy();
    }
  });

  it('ignores a mutation inside the panel, as its own style writes', async () => {
    const { node, panel, seen, options } = scene();
    const action = followAnchor(node, options);
    try {
      const reads = seen.reads;
      panel.setAttribute('style', 'top: 12px;');
      panel.append(doc.createElement('p'));
      await frame();
      assert.equal(seen.moves, 0);
      assert.equal(seen.reads, reads, 'no layout read');
    } finally {
      action.destroy();
    }
  });

  it('reports the anchor going and a new one carrying the id as changes', async () => {
    const { node, anchor, seen, options } = scene();
    const action = followAnchor(node, options);
    try {
      anchor.remove();
      await frame();
      const next = doc.createElement('button');
      next.id = 'cell';
      doc.body.append(next);
      await frame();
      assert.deepEqual(seen.changes, [anchor, null, next]);
    } finally {
      action.destroy();
    }
  });

  it('watches only for its return while the mount is detached, and reads again once it returns', async () => {
    const { node, anchor, seen, options } = scene();
    const action = followAnchor(node, options);
    try {
      node.remove();
      await frame();
      assert.deepEqual(seen.changes.at(-1), null, 'no anchor while detached');
      const reads = seen.reads;
      const request = view.requestAnimationFrame.bind(view);
      let scheduled = 0;
      view.requestAnimationFrame = (run) => {
        scheduled += 1;
        return request(run);
      };
      anchor.setAttribute('class', 'moved');
      anchor.setAttribute('style', 'left: 4px');
      await new Promise((done) => setTimeout(done, 0));
      assert.equal(scheduled, 0, 'an attribute write schedules no read while detached');
      view.requestAnimationFrame = request;
      doc.body.append(doc.createElement('p'));
      await frame();
      assert.equal(seen.reads, reads, 'nothing measured while detached');
      doc.body.prepend(node);
      await frame();
      assert.ok(seen.changes.at(-1) === anchor, 'found again on return');
    } finally {
      action.destroy();
    }
  });

  it('watches nothing once disabled or destroyed', async () => {
    const { node, seen, options } = scene();
    const action = followAnchor(node, options);
    action.update({ ...options, enabled: false });
    assert.equal(seen.changes.at(-1), null);
    doc.body.append(doc.createElement('p'));
    await frame();
    assert.equal(seen.moves, 0, 'disabled');
    action.update(options);
    action.destroy();
    const moves = seen.moves;
    doc.body.append(doc.createElement('p'));
    await frame();
    assert.equal(seen.moves, moves, 'destroyed');
  });
});
