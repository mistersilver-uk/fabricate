import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReviewPayload,
  parseCodexReview,
  parseDiffPatch
} from '../scripts/github-submit-codex-review.mjs';

const PATCH = `diff --git a/src/example.js b/src/example.js
index 1111111..2222222 100644
--- a/src/example.js
+++ b/src/example.js
@@ -10,4 +10,5 @@ function example() {
 const before = true;
-const removed = true;
+const added = true;
 return before;
 }
`;

test('parseCodexReview accepts raw JSON and fenced JSON', () => {
  assert.deepEqual(parseCodexReview('{"event":"COMMENT","body":"NO_FINDINGS","comments":[]}'), {
    event: 'COMMENT',
    body: 'NO_FINDINGS',
    comments: []
  });

  assert.deepEqual(parseCodexReview('```json\n{"event":"COMMENT","body":"ok","comments":[]}\n```'), {
    event: 'COMMENT',
    body: 'ok',
    comments: []
  });
});

test('parseDiffPatch tracks right-side changed and context lines', () => {
  const files = parseDiffPatch(PATCH);
  assert.equal(files.get('src/example.js').right.has(10), true);
  assert.equal(files.get('src/example.js').right.has(11), true);
  assert.equal(files.get('src/example.js').right.has(12), true);
});

test('buildReviewPayload filters comments that are not anchored to the diff', () => {
  const result = buildReviewPayload({
    commitId: 'abc123',
    patch: PATCH,
    review: {
      event: 'REQUEST_CHANGES',
      body: 'Review summary.',
      comments: [
        {
          path: 'src/example.js',
          line: 11,
          side: 'RIGHT',
          body: 'This line is in the diff.'
        },
        {
          path: 'src/example.js',
          line: 99,
          side: 'RIGHT',
          body: 'This line is not in the diff.'
        }
      ]
    }
  });

  assert.equal(result.skip, false);
  assert.equal(result.payload.event, 'REQUEST_CHANGES');
  assert.equal(result.payload.comments.length, 1);
  assert.equal(result.dropped.length, 1);
  assert.match(result.payload.body, /not in the diff/);
});

test('buildReviewPayload validates anchors before capping inline comments', () => {
  const result = buildReviewPayload({
    commitId: 'abc123',
    patch: PATCH,
    review: {
      event: 'COMMENT',
      body: 'Review summary.',
      comments: [
        {
          path: 'src/example.js',
          line: 91,
          side: 'RIGHT',
          body: 'First stale finding.'
        },
        {
          path: 'src/example.js',
          line: 92,
          side: 'RIGHT',
          body: 'Second stale finding.'
        },
        {
          path: 'src/example.js',
          line: 93,
          side: 'RIGHT',
          body: 'Third stale finding.'
        },
        {
          path: 'src/example.js',
          line: 11,
          side: 'RIGHT',
          body: 'This valid finding must survive the cap.'
        }
      ]
    }
  });

  assert.equal(result.payload.comments.length, 1);
  assert.equal(result.payload.comments[0].body, 'This valid finding must survive the cap.');
  assert.equal(result.dropped.length, 3);
});

test('buildReviewPayload skips no-finding reviews', () => {
  const result = buildReviewPayload({
    commitId: 'abc123',
    patch: PATCH,
    review: {
      event: 'COMMENT',
      body: 'NO_FINDINGS',
      comments: []
    }
  });

  assert.deepEqual(result, {
    skip: true,
    reason: 'No material findings.'
  });
});
