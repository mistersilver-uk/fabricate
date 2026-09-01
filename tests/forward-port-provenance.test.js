/**
 * The forward-port's change-provenance verifier (issue #1418).
 *
 * The gate this module powers is the one path by which content reaches `main` without satisfying
 * `main`'s ruleset, and it runs perhaps twice a month. A path that rarely runs is a path whose
 * defects are discovered late, so the verifier is driven here from RECORDED EVIDENCE rather than
 * from a shape someone typed out from memory.
 *
 * ── THE FIXTURES ARE VERBATIM CAPTURED PAYLOADS ─────────────────────────────────────────────────
 * `tests/fixtures/forward-port-provenance/` holds real responses, captured on 2026-09-01 against
 * commits that were genuinely absent from `main` at the time:
 *
 *   rev-list-parents.txt  `git rev-list --parents origin/main..origin/release`
 *   pulls/<sha>.json      `GET /repos/mistersilver-uk/fabricate/commits/<sha>/pulls`
 *   merges/<sha>.txt      the merge-content verdict `scripts/forward-port-content-gate.sh` computes
 *                         for that commit — DERIVED by running the script's own predicate against
 *                         these four commits' real objects, not typed out from expectation
 *
 * The range is pull request #1421 (`d904316a`, merged as `74e0988f`) and #1425 (`9a27eb2e`, merged
 * as `efebbb90`), both genuinely reviewed against `release`. They are the positive control, and
 * both merges re-merge to exactly their own trees, so they are also real content-free-merge
 * fixtures.
 *
 * Recording them verbatim rather than restating them is load-bearing, and the reason is a mistake
 * that was actually made while planning this: a `--jq` projection reported
 * `{"number":1414,"base":"main","merged":true}`, but the raw payload has NO `merged` key at all —
 * `--jq` had synthesised it. A hand-written fixture would have encoded that invented shape and the
 * suite would have passed against a verifier that could not read a real response. Every negative
 * control below is therefore DERIVED from the captured payload by changing one field, so each one
 * still proves which real field the predicate reads.
 *
 * ── WHAT THIS FILE CANNOT PROVE, AND WHERE THAT IS PROVED INSTEAD ───────────────────────────────
 * The verifier is pure and never runs `git`, so everything below exercises how it READS the
 * collector's merge-content verdict. Nothing here can show that the verdict itself is right.
 *
 * That gap is precisely where the original combined-diff predicate hid. Its "evil merge" case
 * handed the verifier a hand-written filename string, which proves the plumbing and not the git
 * behaviour beneath it; and the recorded fixtures come from a linear, fast-forwardable topology, on
 * which a broken predicate happens to answer correctly. `tests/forward-port-content-gate.test.js`
 * closes it by running the real script over real constructed merges — including the divergent clean
 * auto-merge, the one shape that tells a working predicate from a broken one.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  parseAssociations,
  parseRevListParents,
  readMergeContentStatus,
  run,
} from '../scripts/lib/forwardPortProvenance.js';

const REPO_ROOT = path
  .join(path.dirname(fileURLToPath(import.meta.url)), '..')
  .replaceAll(path.sep, '/');
const FIXTURES = `${REPO_ROOT}/tests/fixtures/forward-port-provenance`;

const REPOSITORY = 'mistersilver-uk/fabricate';

/** #1421's own commit — one parent, accounted for by a merged pull request based on `release`. */
const PR_COMMIT = 'd904316a4a1f7689826da0eecf6f95f05016b330';
/** #1421's merge commit — two parents, re-merging to exactly its own tree. */
const MERGE_COMMIT = '74e0988f16f63a7c6e9be4add94eb94c5d762b10';

/** A tree object id shape; the verifier reports the collector's detail token but never reads it. */
const REMERGED_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** A sha shape for constructed fixtures; hex and unique, which is all the parser requires. */
const CONSTRUCTED = {
  ordinaryMerge: 'aaaa111111111111111111111111111111111111',
  ordinaryParent: 'bbbb222222222222222222222222222222222222',
  evilMerge: 'cccc333333333333333333333333333333333333',
  loose: 'dddd444444444444444444444444444444444444',
};

/** The verbatim REST payload the negative controls are derived from. */
function capturedPulls(sha = PR_COMMIT) {
  return readFileSync(`${FIXTURES}/pulls/${sha}.json`, 'utf8');
}

/**
 * The captured payload with one field changed, so a negative control still reads the real shape.
 * @param {(pull: object) => void} mutate Applied to the single captured pull request.
 * @returns {string} The payload text.
 */
function derivedPulls(mutate) {
  const payload = JSON.parse(capturedPulls());
  assert.equal(payload.length, 1, 'the captured payload holds exactly one pull request');
  mutate(payload[0]);
  return JSON.stringify(payload);
}

/**
 * Drive the CLI entry point with injected io, capturing its streams.
 * @param {string[]} argv The arguments.
 * @param {Record<string, string|Error>} overlay In-memory files; anything absent falls through to disk.
 * @returns {{code: number, out: string, err: string}} The outcome.
 */
function runWith(argv, overlay = {}) {
  const out = [];
  const err = [];
  const code = run(argv, {
    log: (message) => out.push(String(message)),
    error: (message) => err.push(String(message)),
    readFile: (file) => {
      const key = String(file).replaceAll('\\', '/');
      if (!Object.hasOwn(overlay, key)) return readFileSync(file, 'utf8');
      const value = overlay[key];
      if (value instanceof Error) throw value;
      return value;
    },
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

/**
 * Drive the CLI over a wholly in-memory range, so a case states exactly its own evidence.
 *
 * Any commit whose evidence is not supplied resolves to a path that exists nowhere, so the read
 * throws — which is the fail-closed behaviour several cases below assert.
 *
 * @param {{commits: string, merges?: Record<string, string|Error>, pulls?: Record<string, string|Error>, options?: string[]}} input
 * @returns {{code: number, out: string, err: string}} The outcome.
 */
function verifyInMemory({ commits, merges = {}, pulls = {}, options = [] }) {
  const overlay = { 'memory/commits.txt': commits };
  for (const [sha, text] of Object.entries(merges)) overlay[`memory/merges/${sha}.txt`] = text;
  for (const [sha, text] of Object.entries(pulls)) overlay[`memory/pulls/${sha}.json`] = text;
  return runWith(
    [
      'memory/commits.txt',
      'memory/merges',
      'memory/pulls',
      `--repository=${REPOSITORY}`,
      ...options,
    ],
    overlay
  );
}

/** A two-parent merge line carrying the author and subject a refusal message names. */
function mergeCommitLine(sha, subject) {
  return `${sha} ${CONSTRUCTED.ordinaryParent} ${MERGE_COMMIT}\tfabricate-release-bot\t${subject}`;
}

/** A one-parent commit line carrying the author and subject a refusal message names. */
function ordinaryCommitLine(sha, parent, subject = 'chore: something') {
  return `${sha} ${parent}\tA Contributor\t${subject}`;
}

// ── 1. POSITIVE CONTROL, FROM RECORDED DATA ─────────────────────────────────────────────────────

test('the recorded release-line range is accepted in full, from the captured payloads on disk', () => {
  const { code, out } = runWith([
    `${FIXTURES}/rev-list-parents.txt`,
    `${FIXTURES}/merges`,
    `${FIXTURES}/pulls`,
    `--repository=${REPOSITORY}`,
  ]);

  assert.equal(code, 0, `expected every recorded commit to be accounted for, got:\n${out}`);
  assert.match(out, /All 4 commit\(s\)/);
  // Both rules are exercised by the real range, and each names the rule that admitted the commit.
  assert.match(out, new RegExp(`accounted ${PR_COMMIT} — merged pull request #1421`));
  assert.match(out, new RegExp(`accounted ${MERGE_COMMIT} — a merge of 2 parents`));
  assert.match(out, /merged pull request #1425/);
});

test('the captured REST payload is read through its real field names', () => {
  const [association] = parseAssociations(capturedPulls());

  assert.deepEqual(association, {
    number: 1421,
    baseRef: 'release',
    repository: REPOSITORY,
    mergedAt: '2026-09-01T07:48:19Z',
    state: 'closed',
  });

  // The trap this pins: REST reports `state: "closed"` for a MERGED pull request, exactly as it
  // does for an abandoned one, and carries no `merged` boolean at all. A verifier keying on
  // `state` would accept a pull request that was closed unmerged.
  assert.ok(!Object.hasOwn(JSON.parse(capturedPulls())[0], 'merged'), 'REST carries no `merged`');
});

test('the captured rev-list listing parses to its real topology', () => {
  const commits = parseRevListParents(readFileSync(`${FIXTURES}/rev-list-parents.txt`, 'utf8'));

  assert.equal(commits.length, 4);
  const byId = Object.fromEntries(commits.map((commit) => [commit.sha, commit.parents]));
  assert.equal(byId[MERGE_COMMIT].length, 2, 'the merge commit has two parents');
  assert.equal(byId[PR_COMMIT].length, 1, 'the pull request commit has one');
});

// ── 2. THE TWO ACCEPTANCE RULES, ISOLATED ───────────────────────────────────────────────────────

test('the ordinary release shape — a CI --no-ff promote merge with NO pull request — is accepted', () => {
  // promote-to-early-access.yml merges a beta tag into `release` with the App token, and that merge
  // is associated with no pull request at all. A gate demanding one would red every routine
  // release, so this case is the reason the content-free-merge rule exists.
  const { code, out } = verifyInMemory({
    commits: mergeCommitLine(CONSTRUCTED.ordinaryMerge, 'chore(#627): promote v1.9.2 into release'),
    merges: { [CONSTRUCTED.ordinaryMerge]: 'content-free\n' },
    // Deliberately a THROWING accessor: the content-free rule must decide from local evidence
    // alone, so a failed or unavailable association read cannot red the routine release.
    pulls: { [CONSTRUCTED.ordinaryMerge]: new Error('the association read must not be reached') },
  });

  assert.equal(code, 0, out);
  assert.match(out, /a merge of 2 parents whose re-merge reproduces its tree exactly/);
});

test('an EVIL merge — content present in no parent — is refused', () => {
  const { code, err } = verifyInMemory({
    commits: mergeCommitLine(CONSTRUCTED.evilMerge, 'chore: forward-port release into main'),
    merges: { [CONSTRUCTED.evilMerge]: `carries-content ${REMERGED_TREE}\n` },
    pulls: { [CONSTRUCTED.evilMerge]: '[]' },
  });

  assert.equal(code, 1);
  assert.match(err, new RegExp(`REFUSED ${CONSTRUCTED.evilMerge}`));
  // BOTH halves of why: rule 1 did not hold for the merge, AND rule 2 found nothing either. A
  // refusal naming only the missing pull request would send an operator looking for a review that
  // could never have accounted for invented content in the first place.
  assert.match(err, /re-merging its two parents produces a different tree/);
  assert.match(err, /no pull request is associated with it at all/);
});

test('EVERY merge-content verdict except `content-free` leaves the merge to rule 2', () => {
  // The collector re-merges a merge's two parents and states its conclusion as one token. Only
  // `content-free` is an acceptance. The other three are genuinely different situations and each
  // must say which one it was, because they point at different remedies — but none of them is a
  // refusal in itself: a merge commit closing a reviewed pull request based on `release` WAS
  // reviewed, its resolution included, so rule 2 still gets to answer.
  for (const [verdict, reason] of [
    [`carries-content ${REMERGED_TREE}`, /produces a different tree/],
    ['remerge-conflicted', /do not merge cleanly, so it embeds a resolution/],
    ['parent-count 3', /does not have exactly two parents/],
  ]) {
    const refused = verifyInMemory({
      commits: mergeCommitLine(CONSTRUCTED.evilMerge, 'chore: a merge'),
      merges: { [CONSTRUCTED.evilMerge]: `${verdict}\n` },
      pulls: { [CONSTRUCTED.evilMerge]: '[]' },
    });
    assert.equal(refused.code, 1, `'${verdict}' must not pass rule 1: ${refused.out}`);
    assert.match(refused.err, reason);

    const accounted = verifyInMemory({
      commits: mergeCommitLine(CONSTRUCTED.evilMerge, 'chore: a merge'),
      merges: { [CONSTRUCTED.evilMerge]: `${verdict}\n` },
      pulls: { [CONSTRUCTED.evilMerge]: capturedPulls() },
    });
    assert.equal(
      accounted.code,
      0,
      `'${verdict}' must still be accountable by a merged release-based pull request: ${accounted.err}`
    );
  }
});

test('the merge-content vocabulary is read from the FIRST token, and its detail is ignored', () => {
  // The collector writes `carries-content <tree>` and `parent-count <n>`: the verdict is the first
  // token and the rest is diagnostic detail this module reports but never interprets. Reading the
  // whole line would make every `carries-content` verdict unknown — which fails closed, but on the
  // wrong diagnosis, and would make the re-merged tree unusable as the refusal's evidence.
  assert.deepEqual(readMergeContentStatus('content-free\n'), {
    contentFree: true,
    verdict: 'content-free',
    reason: '',
  });

  const carries = readMergeContentStatus(`carries-content ${REMERGED_TREE}\n`);
  assert.equal(carries.contentFree, false);
  assert.equal(carries.verdict, 'carries-content');

  assert.equal(readMergeContentStatus('parent-count 5\n').verdict, 'parent-count');
  assert.equal(readMergeContentStatus('remerge-conflicted\n').contentFree, false);
});

test('a merge-content verdict the verifier does not know is UNVERIFIABLE, never a pass', () => {
  // The collector and the verifier are two files that have to agree on one vocabulary. If they
  // drift, nothing can be concluded — and the direction that matters is that the drift must not
  // resolve to "introduced nothing". An empty file is the same case: the collector writes one for
  // every commit it collects, so an empty one means the collection did not finish.
  for (const [label, status, pattern] of [
    ['unknown', 'content-free-ish\n', /is not a merge-content verdict this verifier knows/],
    ['empty', '   \n', /merge-content status is empty/],
  ]) {
    const { code, err } = verifyInMemory({
      commits: mergeCommitLine(CONSTRUCTED.ordinaryMerge, 'chore: promote'),
      merges: { [CONSTRUCTED.ordinaryMerge]: status },
      pulls: { [CONSTRUCTED.ordinaryMerge]: capturedPulls() },
    });
    assert.equal(code, 2, `a ${label} verdict must fail closed`);
    assert.match(err, pattern);
  }
});

// ── 3. REFUSALS ─────────────────────────────────────────────────────────────────────────────────

test('a commit with no associated pull request is refused BY SHA, with its subject and author', () => {
  const { code, err } = verifyInMemory({
    commits: ordinaryCommitLine(CONSTRUCTED.loose, MERGE_COMMIT, 'fix: pushed straight to release'),
    pulls: { [CONSTRUCTED.loose]: '[]' },
  });

  assert.equal(code, 1);
  assert.match(err, new RegExp(`REFUSED ${CONSTRUCTED.loose}`));
  assert.match(err, /fix: pushed straight to release/);
  assert.match(err, /<A Contributor>/);
  assert.match(err, /no pull request is associated with it at all/);
});

test('a merged pull request based on the WRONG line is refused', () => {
  // This is the finding that settled the canonical requirement: #1414 was a merged, reviewed pull
  // request — based on `main`. Reviewing a change against a different line is not reviewing it for
  // landing on this one, so "it was reviewed" is not the question the gate asks.
  const { code, err } = verifyInMemory({
    commits: ordinaryCommitLine(CONSTRUCTED.loose, MERGE_COMMIT),
    pulls: {
      [CONSTRUCTED.loose]: derivedPulls((pull) => {
        pull.base.ref = 'main';
      }),
    },
  });

  assert.equal(code, 1);
  assert.match(err, /was reviewed against 'main', not 'release'/);
});

test('an UNMERGED pull request is refused', () => {
  const { code, err } = verifyInMemory({
    commits: ordinaryCommitLine(CONSTRUCTED.loose, MERGE_COMMIT),
    pulls: {
      [CONSTRUCTED.loose]: derivedPulls((pull) => {
        pull.merged_at = null;
        pull.state = 'open';
      }),
    },
  });

  assert.equal(code, 1);
  assert.match(err, /is not merged \(state: open\)/);
});

test('an ABANDONED pull request is refused, even though its state reads `closed`', () => {
  // The whole reason merged-ness is derived from `merged_at` and never from `state`.
  const { code, err } = verifyInMemory({
    commits: ordinaryCommitLine(CONSTRUCTED.loose, MERGE_COMMIT),
    pulls: {
      [CONSTRUCTED.loose]: derivedPulls((pull) => {
        pull.merged_at = null;
      }),
    },
  });

  assert.equal(code, 1);
  assert.match(err, /is not merged \(state: closed\)/);
});

test('a BLANK merged_at is not a merge date', () => {
  // `merged_at` is the single field the whole predicate rests on, and it is a string — so the
  // difference between "absent" and "present but empty" is real. Read without trimming, a payload
  // carrying whitespace would be truthy and the pull request would read as merged.
  const { code, err } = verifyInMemory({
    commits: ordinaryCommitLine(CONSTRUCTED.loose, MERGE_COMMIT),
    pulls: {
      [CONSTRUCTED.loose]: derivedPulls((pull) => {
        pull.merged_at = '   ';
      }),
    },
  });

  assert.equal(code, 1);
  assert.match(err, /is not merged \(state: closed\)/);
});

test("an association naming ANOTHER repository's pull request is refused", () => {
  const { code, err } = verifyInMemory({
    commits: ordinaryCommitLine(CONSTRUCTED.loose, MERGE_COMMIT),
    pulls: {
      [CONSTRUCTED.loose]: derivedPulls((pull) => {
        pull.base.repo.full_name = 'someone-else/fabricate';
      }),
    },
  });

  assert.equal(code, 1);
  assert.match(err, /belongs to someone-else\/fabricate, not mistersilver-uk\/fabricate/);
});

test('the accepted-base list is a parameter, not a hardcoded `release`', () => {
  const argv = [
    `${FIXTURES}/rev-list-parents.txt`,
    `${FIXTURES}/merges`,
    `${FIXTURES}/pulls`,
    `--repository=${REPOSITORY}`,
    '--accepted-bases=main',
  ];

  const { code, err } = runWith(argv);
  assert.equal(code, 1, 'the recorded range is release-based, so a main-only list must refuse it');
  assert.match(err, /was reviewed against 'release', not 'main'/);
});

// ── 4. FAIL-CLOSED: EVERY UNVERIFIABLE INPUT EXITS 2 ────────────────────────────────────────────

test('an empty or malformed commit listing is unverifiable, never "nothing to check"', () => {
  const empty = verifyInMemory({ commits: '   \n\n' });
  assert.equal(empty.code, 2);
  assert.match(empty.err, /contradicts its own precondition/);

  const malformed = verifyInMemory({ commits: 'not a sha at all\n' });
  assert.equal(malformed.code, 2);
  assert.match(malformed.err, /is not a '<sha> <parent-sha>…' line/);

  // The object-id pattern is ANCHORED. Unanchored it matches the hex PREFIX of a token that is not
  // an object id at all, so a corrupted listing would be accepted and each of its "commits" would
  // then fail later, on an unreadable evidence file — the same exit code reached by a different and
  // far less useful route, and one that no longer says the listing itself is wrong.
  const almostASha = verifyInMemory({
    commits: `${'d'.repeat(40)}zzz ${MERGE_COMMIT}\tA Contributor\tchore: something`,
  });
  assert.equal(almostASha.code, 2);
  assert.match(almostASha.err, /is not a '<sha> <parent-sha>…' line/);

  // A repeated sha cannot come out of `git rev-list`, so a listing containing one was not produced
  // the way this verifier's contract says it was. Deciding the same commit twice would also double
  // its weight in the "N of M commits" count a refusal reports.
  const line = ordinaryCommitLine(CONSTRUCTED.loose, MERGE_COMMIT);
  const duplicated = verifyInMemory({ commits: `${line}\n${line}` });
  assert.equal(duplicated.code, 2);
  assert.match(duplicated.err, /appears more than once in the commit listing/);
});

test('a range above the commit cap is an unexpected shape, and is not decided one commit at a time', () => {
  const commits = Array.from({ length: 201 }, (_, index) =>
    ordinaryCommitLine(String(index).padStart(40, '0'), MERGE_COMMIT)
  ).join('\n');

  const { code, err } = verifyInMemory({ commits });
  assert.equal(code, 2);
  assert.match(err, /carries 201 commits, above the 200-commit cap/);

  // ...and the cap is a parameter that fires BEFORE any evidence is read, so the assertion above is
  // not merely counting to 201: raising it moves the refusal on to the first unreadable payload.
  const raised = verifyInMemory({ commits, options: ['--max-commits=250'] });
  assert.ok(!/commit cap/.test(raised.err), `raising the cap must lift it, got:\n${raised.err}`);
  assert.match(raised.err, /pull-request associations for .* could not be read/);
});

test('an evidence file that cannot be read is unverifiable, for either kind of evidence', () => {
  const missingStatus = verifyInMemory({
    commits: `${CONSTRUCTED.evilMerge} ${CONSTRUCTED.ordinaryParent} ${MERGE_COMMIT}`,
  });
  assert.equal(missingStatus.code, 2);
  assert.match(missingStatus.err, /merge-content status for .* could not be read/);

  const missingAssociations = verifyInMemory({
    commits: ordinaryCommitLine(CONSTRUCTED.loose, MERGE_COMMIT),
  });
  assert.equal(missingAssociations.code, 2);
  assert.match(missingAssociations.err, /pull-request associations for .* could not be read/);
  assert.match(missingAssociations.err, /UNVERIFIABLE/);
});

test('a network failure part-way through the per-commit reads makes the WHOLE range unverifiable', () => {
  // Not "the resolved prefix passed and the remainder is unknown": a forward-port whose provenance
  // is partly established is not established.
  const { code, err } = verifyInMemory({
    commits: [
      ordinaryCommitLine(PR_COMMIT, MERGE_COMMIT),
      ordinaryCommitLine(CONSTRUCTED.loose, MERGE_COMMIT),
    ].join('\n'),
    pulls: {
      [PR_COMMIT]: capturedPulls(),
      [CONSTRUCTED.loose]: new Error('ECONNRESET'),
    },
  });

  assert.equal(code, 2);
  assert.match(err, /ECONNRESET/);
  assert.ok(!/All 2 commit/.test(err), 'the resolved prefix must not be reported as a pass');
});

test('an empty or non-JSON association payload is unverifiable, never "no pull request"', () => {
  for (const [label, payload, pattern] of [
    ['empty', '', /association payload is empty/],
    ['non-JSON', '<html>502 Bad Gateway</html>', /is not JSON/],
  ]) {
    const { code, err } = verifyInMemory({
      commits: ordinaryCommitLine(CONSTRUCTED.loose, MERGE_COMMIT),
      pulls: { [CONSTRUCTED.loose]: payload },
    });
    assert.equal(code, 2, `a ${label} payload must fail closed`);
    assert.match(err, pattern);
  }
});

test('a rate-limited read and a permissions 403 are unverifiable, and are named APART', () => {
  const refusal = (message) =>
    verifyInMemory({
      commits: ordinaryCommitLine(CONSTRUCTED.loose, MERGE_COMMIT),
      pulls: {
        [CONSTRUCTED.loose]: JSON.stringify({
          message,
          documentation_url: 'https://docs.github.com/rest',
        }),
      },
    });

  const limited = refusal('API rate limit exceeded for installation ID 1234.');
  assert.equal(limited.code, 2);
  assert.match(limited.err, /RATE LIMITED/);

  const forbidden = refusal('Resource not accessible by integration');
  assert.equal(forbidden.code, 2);
  assert.match(forbidden.err, /Pull requests: Read/);
  assert.ok(!/RATE LIMITED/.test(forbidden.err), 'a permissions 403 is not a rate limit');
});

test('a FULL association page may be truncated, so it is incomplete rather than "no association"', () => {
  // The endpoint paginates. An answer on page 2 must not read as an absence of association.
  const page = JSON.stringify([JSON.parse(capturedPulls())[0], JSON.parse(capturedPulls())[0]]);
  const { code, err } = verifyInMemory({
    commits: ordinaryCommitLine(CONSTRUCTED.loose, MERGE_COMMIT),
    pulls: { [CONSTRUCTED.loose]: page },
    options: ['--per-page=2'],
  });

  assert.equal(code, 2);
  assert.match(err, /fills the 2-entry page/);
  assert.match(err, /never as "no association"/);
});

test('an association missing a field the predicate reads is refused as unreadable, not guessed at', () => {
  const { code, err } = verifyInMemory({
    commits: ordinaryCommitLine(CONSTRUCTED.loose, MERGE_COMMIT),
    pulls: { [CONSTRUCTED.loose]: JSON.stringify([{ number: 7, base: { ref: 'release' } }]) },
  });

  assert.equal(code, 2);
  assert.match(err, /carries no 'number', 'base\.ref' or 'base\.repo\.full_name'/);
});

test('a missing or malformed --repository is refused rather than defaulted', () => {
  const absent = runWith(['memory/commits.txt', 'memory/diffs', 'memory/pulls'], {
    'memory/commits.txt': ordinaryCommitLine(CONSTRUCTED.loose, MERGE_COMMIT),
  });
  assert.equal(absent.code, 2);
  assert.match(absent.err, /is not an '<owner>\/<name>' repository/);
});

test('argv mistakes exit 2, and --help does not', () => {
  assert.equal(runWith([]).code, 2);
  assert.equal(runWith(['--help']).code, 0);

  const tooFew = runWith(['only-one-path', `--repository=${REPOSITORY}`]);
  assert.equal(tooFew.code, 2);
  assert.match(tooFew.err, /expected 3 paths/);

  const unknown = runWith(['a', 'b', 'c', `--repository=${REPOSITORY}`, '--bogus']);
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /unknown option '--bogus'/);

  const emptyList = runWith(['a', 'b', 'c', `--repository=${REPOSITORY}`, '--accepted-bases=']);
  assert.equal(emptyList.code, 2);
  assert.match(emptyList.err, /--accepted-bases was supplied but names nothing/);

  const badNumber = runWith(['a', 'b', 'c', `--repository=${REPOSITORY}`, '--per-page=zero']);
  assert.equal(badNumber.code, 2);
  assert.match(badNumber.err, /--per-page must be a positive integer/);
});
