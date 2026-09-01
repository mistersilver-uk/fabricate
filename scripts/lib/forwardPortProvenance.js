/**
 * Change-provenance verifier for the forward-port's content gate (issue #1418).
 *
 * The forward-port merges `release` into `main` and pushes as a ruleset-bypass App installation —
 * the one path by which content reaches the default branch without satisfying `main`'s ruleset. Its
 * content gate used to ask a human to assert that everything in the diff "was authored through a
 * reviewed pull request" and to re-run with `allow_content: true`. That is an unverified assertion,
 * and it is the exception to this repository's own standard (`scripts/lib/promoteGuards.js`:
 * enforcement "MUST be a verification performed by the promotion, never an assumption"). This module
 * performs the verification instead.
 *
 * ── THE PREDICATE (one commit at a time) ────────────────────────────────────────────────────────
 * A commit in the forward-port range is ACCEPTED when either rule holds:
 *
 *   1. CONTENT-FREE MERGE — two parents whose RE-MERGE reproduces the merge's own tree exactly. It
 *      is then precisely what an unattended three-way merge of its parents produces, so it carries
 *      nothing of its own and its parents are judged on their own merits. This rule is not a
 *      loophole, it is a REQUIREMENT: the ordinary release shape is `promote-to-early-access.yml`
 *      merging a beta tag into `release` with `--no-ff` under the App token, and that merge commit
 *      is associated with no pull request at all. A gate demanding a pull request for it would red
 *      every routine release.
 *   2. PULL-REQUEST AUTHORED — associated with a pull request that is MERGED, whose base ref is in
 *      the accepted-base list, and which belongs to this repository. "Reviewed" alone is not
 *      enough: a change reviewed against a DIFFERENT line was never reviewed for landing on this
 *      one, which is exactly the shape the gate exists to refuse.
 *
 * Rule 1 is evaluated first and short-circuits, so the ordinary promote merge never needs an API
 * answer and a failed association read cannot red it.
 *
 * Anything else is REFUSED, naming the sha, its subject, its author, and which rule it failed.
 *
 * ── RULE 1 IS NOT A COMBINED DIFF, AND MUST NEVER GO BACK TO BEING ONE ──────────────────────────
 * It was originally "an empty `git diff-tree --cc -r --no-commit-id --name-only <merge>`". That
 * predicate cannot express the question. `--name-only` follows the `-c` FILE selection ("files
 * modified from all parents") and `--cc`'s hunk compression only ever affects PATCH output, so it
 * never reaches the name list: a clean auto-merge in which one file took hunks from both sides and
 * a genuine EVIL merge of the same two parents print exactly the same thing. Of the last 38 merges
 * reachable from this repository's `origin/main`, 5 have a non-empty combined diff and every one of
 * them invented nothing — two on `CHANGELOG.md`, which is the release path itself.
 *
 * So the evidence this module reads for rule 1 is no longer a file list. It is a one-line verdict
 * written by `scripts/forward-port-content-gate.sh`, which re-merges the two parents with
 * `git merge-tree --write-tree` and compares the resulting tree with the merge's own. See
 * `MERGE_CONTENT_VERDICTS`.
 *
 * **Stated limitation.** The rule catches content introduced by a RESOLUTION. It does not catch an
 * additive semantic duplicate: two sides independently adding the same test in different places
 * merge cleanly, the re-merge reproduces the tree exactly, and every hunk is attributable to one
 * parent. That shape is handled procedurally in `CONTRIBUTING.md`, not here.
 *
 * ── THE REST PAYLOAD IS NOT THE GRAPHQL PAYLOAD ─────────────────────────────────────────────────
 * The association evidence is the REST `GET /repos/{owner}/{repo}/commits/{sha}/pulls` response,
 * verbatim. Its shape differs from GraphQL's `associatedPullRequests` in three ways that each
 * produce a WRONG verdict if assumed:
 *
 *   * the base ref is nested (`base.ref`), not flat (`baseRefName`);
 *   * there is NO `merged` boolean — merged-ness is `merged_at != null` and nothing else;
 *   * `state` is `"closed"` for a merged pull request AND for an abandoned one, so a verifier that
 *     keyed on `state` would accept a pull request that was closed unmerged.
 *
 * The documented qualifier on that endpoint — "if the commit is not present in the default branch,
 * will only return open pull requests" — was tested against commits genuinely absent from `main`
 * and did NOT bite: the merged pull request was returned. That is why no GraphQL query and no
 * enumerate-all-pull-requests fallback exist here.
 *
 * ── FAIL CLOSED, ALWAYS ─────────────────────────────────────────────────────────────────────────
 * Every unverifiable input is exit 2 with a distinct message, never 0 and never "no pull request
 * found, therefore refuse". An absence of evidence is not evidence of absence of unreviewed
 * content, and it is not evidence that there is nothing to check either. Empty input, malformed
 * input, an unreadable evidence file, an API error payload, a rate-limited read, a page that may be
 * truncated, an association naming another repository's pull request, and a range above the commit
 * cap are all unverifiable rather than decided.
 *
 * ── PURE, ZERO-DEPENDENCY, SPAWNS NOTHING ───────────────────────────────────────────────────────
 * This module never runs `git`, never calls the API, and imports nothing. Evidence arrives as text
 * through injected accessors, so the tests drive it with recorded CONTENT rather than a subprocess
 * or the live API. `scripts/forward-port-provenance.mjs` is the thin CLI that supplies file reads,
 * and `scripts/forward-port-content-gate.sh` is the collector that produces the files.
 *
 * Purity has a cost this module pays deliberately: the git behaviour underneath rule 1 cannot be
 * tested here, only the reading of the collector's verdict. `tests/forward-port-content-gate.test.js`
 * covers the other half, by running the real script over real constructed merges.
 *
 * These `.js` files parse as ESM only because the root `package.json` declares `"type": "module"`;
 * do not drop that declaration or relocate them under a directory with its own `package.json`.
 */

/** The base refs a merged pull request may target for its commits to count as reviewed here. */
const DEFAULT_ACCEPTED_BASES = ['release'];

/**
 * The page size the collector requests, mirrored here so a FULL page can be recognised.
 *
 * A response holding exactly `per_page` entries may have been truncated, and the pull request that
 * accounts for the commit could be on the next page. Reading that as "no qualifying association"
 * would refuse a legitimate commit, so it is reported as incomplete instead.
 */
const DEFAULT_PER_PAGE = 100;

/** Above this many commits the forward-port range is an unexpected shape and is not decided. */
const DEFAULT_MAX_COMMITS = 200;

/** An abbreviated or full object id. Anchored, so a subject line can never pass for one. */
const OBJECT_ID_RE = /^[0-9a-f]{7,64}$/i;

/**
 * The merge-content verdicts `scripts/forward-port-content-gate.sh` writes, one per commit.
 *
 * The collector owns the git work — re-merging a merge's two parents with
 * `git merge-tree --write-tree` and comparing the result with the merge's own tree — and states its
 * conclusion as the first token of a one-line file. This module owns the meaning of that token.
 *
 * Exactly ONE of them accepts. The other three are all "not established as content-free", and each
 * says why in a refusal message, because they are genuinely different situations: a re-merge that
 * conflicts means the recorded merge embeds a human resolution, which is the seam a pre-resolved
 * merge recovery path attaches to; a parent count other than two means the predicate has no
 * two-parent re-merge to run at all. None of them is a pass, and none of them is by itself a
 * refusal either — a merge inside the range that fails rule 1 can still be accounted for by rule 2.
 *
 * An unknown token is UNVERIFIABLE rather than either, because it means the collector and this
 * module have drifted apart and nothing can be concluded from a verdict neither one agrees on.
 */
const MERGE_CONTENT_VERDICTS = new Map([
  ['content-free', { contentFree: true, reason: '' }],
  [
    'carries-content',
    {
      contentFree: false,
      reason:
        're-merging its two parents produces a different tree, so it carries content neither parent has',
    },
  ],
  [
    'remerge-conflicted',
    {
      contentFree: false,
      reason:
        'its two parents do not merge cleanly, so it embeds a resolution — content neither parent has',
    },
  ],
  [
    'parent-count',
    {
      contentFree: false,
      reason:
        'it does not have exactly two parents, so there is no two-parent re-merge to establish that ' +
        'it introduced nothing',
    },
  ],
]);

const USAGE =
  'Usage: node scripts/forward-port-provenance.mjs <commits-file> <merge-status-dir> ' +
  '<associations-dir> --repository=<owner>/<name> [--accepted-bases=release,...] ' +
  '[--per-page=100] [--max-commits=200]\n' +
  '  <commits-file>       `git rev-list --parents <range>` output, optionally with a tab-separated\n' +
  '                       author and subject appended per line.\n' +
  '  <merge-status-dir>   one `<sha>.txt` per commit, holding the merge-content verdict\n' +
  '                       `scripts/forward-port-content-gate.sh` computed for it: one of\n' +
  '                       `content-free`, `carries-content <tree>`, `remerge-conflicted` or\n' +
  '                       `parent-count <n>`.\n' +
  '  <associations-dir>   one `<sha>.json` per commit, holding the verbatim REST response of\n' +
  '                       `GET /repos/{owner}/{repo}/commits/{sha}/pulls`.';

/**
 * Parse a `git rev-list --parents <range>` listing into commits with their parent object ids.
 *
 * Each line is `<sha> <parent-sha>…`. The line MAY carry a tab-separated `<author>` and `<subject>`
 * after the topology, which is what `git log --format='%H %P%x09%an%x09%s'` emits — the same shape
 * with the metadata a refusal message needs. A plain `git rev-list --parents` listing parses fine
 * and simply yields no author or subject.
 *
 * Empty or unparseable input THROWS rather than returning an empty list: the caller only reaches
 * this when the merge carries content, so "no commits in the range" is a contradiction and an
 * unverifiable state, never a pass.
 *
 * @param {string} text The listing.
 * @returns {{sha: string, parents: string[], author: string, subject: string}[]} The commits.
 * @throws {Error} If a line is not a topology line, a sha repeats, or nothing parses at all.
 */
export function parseRevListParents(text) {
  const commits = [];
  const seen = new Set();

  for (const line of String(text).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const [topology, author = '', ...subject] = trimmed.split('\t');
    const [sha, ...parents] = topology.trim().split(/\s+/).filter(Boolean);
    if (!sha || [sha, ...parents].some((id) => !OBJECT_ID_RE.test(id))) {
      throw new Error(
        `'${trimmed}' is not a '<sha> <parent-sha>…' line. Pipe ` +
          '`git rev-list --parents <range>` output; anything else is unverifiable (fail closed).'
      );
    }
    if (seen.has(sha)) {
      throw new Error(`${sha} appears more than once in the commit listing, which cannot happen.`);
    }
    seen.add(sha);
    commits.push({ sha, parents, author: author.trim(), subject: subject.join('\t').trim() });
  }

  if (commits.length === 0) {
    throw new Error(
      'the commit listing is empty. The gate only verifies provenance when the merge carries ' +
        'content, so an empty range contradicts its own precondition and is treated as ' +
        'unverifiable (fail closed).'
    );
  }
  return commits;
}

/**
 * Describe a payload that is not the array this endpoint returns on success.
 *
 * GitHub answers an error with a JSON OBJECT carrying `message`, so the shape itself distinguishes
 * a failed read from an empty result. The two 403s are named apart deliberately: a rate limit is
 * transient and retryable, while a permissions 403 means the App installation lacks
 * **Pull requests: Read** and no amount of retrying will fix it.
 *
 * @param {unknown} payload The parsed non-array payload.
 * @returns {string} The message for the thrown error.
 */
function describeNonArrayPayload(payload) {
  const message = typeof payload?.message === 'string' ? payload.message : '';
  if (/rate limit/i.test(message)) {
    return (
      `the association read was RATE LIMITED ("${message}"). That is a transient API state, not ` +
      'evidence that this commit has no pull request, so the forward-port refuses until the read ' +
      'can be completed.'
    );
  }
  if (message) {
    return (
      `the association read failed ("${message}"). Nothing about this commit can be established ` +
      'from an error response, and a 403 in particular is normally the release-bot App ' +
      'installation missing the `Pull requests: Read` permission — a configuration fault rather ' +
      'than an absent association.'
    );
  }
  return (
    'the association payload is not the JSON array `GET /repos/{owner}/{repo}/commits/{sha}/pulls` ' +
    'returns, so nothing about this commit can be established from it.'
  );
}

/**
 * Normalise one raw REST pull-request entry, refusing a shape the predicate cannot read.
 *
 * `merged_at` is the ONLY merged-ness evidence REST carries — there is no `merged` boolean, and
 * `state` reads `"closed"` for a merged pull request and an abandoned one alike.
 *
 * @param {unknown} entry The raw entry.
 * @param {number} index Its position, for the error message.
 * @returns {{number: number, baseRef: string, repository: string, mergedAt: string|null, state: string}}
 * @throws {Error} If the entry lacks a field the predicate reads.
 */
function toAssociation(entry, index) {
  const number = entry?.number;
  const baseRef = entry?.base?.ref;
  const repository = entry?.base?.repo?.full_name;
  if (typeof number !== 'number' || typeof baseRef !== 'string' || typeof repository !== 'string') {
    throw new TypeError(
      `association ${index} carries no 'number', 'base.ref' or 'base.repo.full_name'. The verifier ` +
        'reads the verbatim REST payload and refuses a shape it cannot read rather than guessing.'
    );
  }
  const mergedAt =
    typeof entry.merged_at === 'string' && entry.merged_at.trim() ? entry.merged_at : null;
  return {
    number,
    baseRef,
    repository,
    mergedAt,
    state: typeof entry.state === 'string' ? entry.state : '',
  };
}

/**
 * Parse a verbatim `GET /repos/{owner}/{repo}/commits/{sha}/pulls` response into associations.
 *
 * @param {string} payloadText The response body, exactly as the API returned it.
 * @param {{perPage?: number}} [options] `perPage` is the page size the read requested.
 * @returns {{number: number, baseRef: string, repository: string, mergedAt: string|null, state: string}[]}
 * @throws {Error} On empty, non-JSON, non-array, possibly-truncated, or unreadable payloads.
 */
export function parseAssociations(payloadText, options = {}) {
  const { perPage = DEFAULT_PER_PAGE } = options;
  const text = String(payloadText).trim();

  if (!text) {
    throw new Error(
      'the association payload is empty. An API read that produced no output is unverifiable, not ' +
        '"this commit has no pull request".'
    );
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(
      'the association payload is not JSON, so the read did not complete as expected and nothing ' +
        'can be established from it.'
    );
  }

  if (!Array.isArray(payload)) throw new Error(describeNonArrayPayload(payload));

  if (payload.length >= perPage) {
    throw new Error(
      `the association payload holds ${payload.length} entries and fills the ${perPage}-entry ` +
        'page, so a further page may hold the pull request that accounts for this commit. A ' +
        'possibly-truncated page is treated as incomplete, never as "no association".'
    );
  }

  return payload.map((entry, index) => toAssociation(entry, index));
}

/**
 * Read the collector's merge-content verdict for one merge commit.
 *
 * Only the FIRST token of the first line is the verdict; `carries-content` and `parent-count` carry
 * a detail token after it (the re-merged tree, and the parent count) that this module reports but
 * does not interpret.
 *
 * @param {string} text The verdict file's contents.
 * @returns {{contentFree: boolean, verdict: string, reason: string}} What the collector established.
 * @throws {Error} If the file is empty or names a verdict this module does not know.
 */
export function readMergeContentStatus(text) {
  const [firstLine = ''] = String(text).trim().split('\n');
  const [verdict = ''] = firstLine.trim().split(/\s+/);

  if (!verdict) {
    throw new Error(
      'the merge-content status is empty. It is written by ' +
        '`scripts/forward-port-content-gate.sh` for every commit it collects, so an empty one means ' +
        'the collection did not complete — which is unverifiable, not "this merge introduced nothing".'
    );
  }

  const known = MERGE_CONTENT_VERDICTS.get(verdict);
  if (!known) {
    throw new Error(
      `'${verdict}' is not a merge-content verdict this verifier knows ` +
        `(${[...MERGE_CONTENT_VERDICTS.keys()].join(', ')}). The collector and the verifier have ` +
        'drifted apart, and nothing can be concluded from a verdict only one of them understands.'
    );
  }

  return { contentFree: known.contentFree, verdict, reason: known.reason };
}

/**
 * Read one piece of evidence through an injected accessor, turning any failure into a fail-closed
 * error that names the commit and what could not be read.
 *
 * @param {(sha: string) => string} accessor The evidence reader.
 * @param {string} sha The commit the evidence belongs to.
 * @param {string} what A human name for the evidence.
 * @returns {string} The evidence text.
 * @throws {Error} If no accessor was supplied, it threw, or it did not return text.
 */
function readEvidence(accessor, sha, what) {
  if (typeof accessor !== 'function') {
    throw new TypeError(`no ${what} reader was supplied, so ${sha} cannot be verified.`);
  }
  let text;
  try {
    text = accessor(sha);
  } catch (error) {
    throw new Error(
      `the ${what} for ${sha} could not be read (${error.message}). The forward-port's change ` +
        'provenance is therefore UNVERIFIABLE — not "unaccounted" and not "clear".',
      { cause: error }
    );
  }
  if (typeof text !== 'string') {
    throw new TypeError(`the ${what} reader returned no text for ${sha}, which is unverifiable.`);
  }
  return text;
}

/**
 * Explain why one association does not account for a commit.
 *
 * @param {{number: number, baseRef: string, repository: string, mergedAt: string|null, state: string}} association
 * @param {{repository: string, acceptedBases: string[]}} deps The verification parameters.
 * @returns {string} The clause naming this association's disqualification.
 */
function describeDisqualification(association, deps) {
  if (association.repository !== deps.repository) {
    return `pull request #${association.number} belongs to ${association.repository}, not ${deps.repository}`;
  }
  if (association.mergedAt === null) {
    return `pull request #${association.number} is not merged (state: ${association.state || 'unknown'})`;
  }
  if (!deps.acceptedBases.includes(association.baseRef)) {
    return (
      `pull request #${association.number} was reviewed against '${association.baseRef}', not ` +
      deps.acceptedBases.map((base) => `'${base}'`).join(' or ')
    );
  }
  return `pull request #${association.number} does not account for it`;
}

/**
 * The refusal detail for a commit no association accounts for.
 *
 * @param {object[]} associations The commit's associations.
 * @param {{repository: string, acceptedBases: string[]}} deps The verification parameters.
 * @returns {string} The detail clause.
 */
function explainRefusal(associations, deps) {
  if (associations.length === 0) return 'no pull request is associated with it at all';
  return associations.map((association) => describeDisqualification(association, deps)).join('; ');
}

/**
 * Decide one commit against the two acceptance rules.
 *
 * Rule 1 is evaluated first and short-circuits, so a content-free merge is decided from local
 * evidence alone and never needs — or waits on — an association read.
 *
 * @param {{sha: string, parents: string[], author: string, subject: string}} commit The commit.
 * @param {object} deps `mergeStatusFor`, `associationsFor`, `repository`, `acceptedBases`, `perPage`.
 * @returns {{sha: string, subject: string, author: string, accepted: boolean, rule: string, detail: string}}
 * @throws {Error} If the evidence this commit needs is unavailable or unreadable.
 */
function classifyCommit(commit, deps) {
  const described = { sha: commit.sha, subject: commit.subject, author: commit.author };
  let mergeNote = '';

  if (commit.parents.length >= 2) {
    const status = readMergeContentStatus(
      readEvidence(deps.mergeStatusFor, commit.sha, 'merge-content status')
    );
    if (status.contentFree) {
      return {
        ...described,
        accepted: true,
        rule: 'content-free merge',
        detail:
          `a merge of ${commit.parents.length} parents whose re-merge reproduces its tree exactly, ` +
          'so it introduces nothing of its own',
      };
    }
    // Rule 1 did not hold, but a merge inside the range can still be accounted for by rule 2 — a
    // merge commit closing a reviewed pull request based on the release line WAS reviewed, its
    // resolution included. So this is carried as a note on the eventual refusal rather than being a
    // refusal in itself, and the refusal says both halves of why the commit was not accounted for.
    mergeNote = `${status.reason}; `;
  }

  const associations = parseAssociations(
    readEvidence(deps.associationsFor, commit.sha, 'pull-request associations'),
    { perPage: deps.perPage }
  );
  const qualifying = associations.find(
    (association) =>
      association.mergedAt !== null &&
      association.repository === deps.repository &&
      deps.acceptedBases.includes(association.baseRef)
  );

  if (qualifying) {
    return {
      ...described,
      accepted: true,
      rule: 'pull-request authored',
      detail: `merged pull request #${qualifying.number} reviewed against '${qualifying.baseRef}'`,
    };
  }

  return {
    ...described,
    accepted: false,
    rule: 'unaccounted',
    detail: `${mergeNote}${explainRefusal(associations, deps)}`,
  };
}

/**
 * Reject a verification parameter that would make every verdict meaningless.
 *
 * @param {string} repository The `<owner>/<name>` this forward-port belongs to.
 * @param {string[]} acceptedBases The base refs a merged pull request may target.
 * @throws {Error} If either is unusable.
 */
function assertParameters(repository, acceptedBases) {
  if (typeof repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new TypeError(
      `'${String(repository)}' is not an '<owner>/<name>' repository. Without it an association ` +
        'naming a DIFFERENT repository would be accepted, so this is refused rather than defaulted.'
    );
  }
  if (!Array.isArray(acceptedBases) || acceptedBases.length === 0) {
    throw new Error(
      'no accepted base refs were supplied, so no pull request could ever qualify and every ' +
        'commit would be refused for the wrong reason.'
    );
  }
}

/**
 * Verify that every commit a forward-port would carry is attributable to a reviewed change.
 *
 * @param {object} input The verification inputs.
 * @param {string} input.parentsText `git rev-list --parents <range>` output for the range.
 * @param {(sha: string) => string} input.mergeStatusFor The collector's merge-content verdict for a merge commit.
 * @param {(sha: string) => string} input.associationsFor Verbatim REST association payload for a commit.
 * @param {string} input.repository The `<owner>/<name>` the pull requests must belong to.
 * @param {string[]} [input.acceptedBases] Base refs a merged pull request may target.
 * @param {number} [input.perPage] The page size the association reads requested.
 * @param {number} [input.maxCommits] The largest range shape this will decide.
 * @returns {{ok: boolean, code: number, accepted: object[], refused: object[], message: string}} The verdict.
 * @throws {Error} If any input is unverifiable — never a verdict of "accounted for".
 */
export function verifyForwardPortProvenance(input) {
  const {
    parentsText,
    mergeStatusFor,
    associationsFor,
    repository,
    acceptedBases = DEFAULT_ACCEPTED_BASES,
    perPage = DEFAULT_PER_PAGE,
    maxCommits = DEFAULT_MAX_COMMITS,
  } = input;

  assertParameters(repository, acceptedBases);

  const commits = parseRevListParents(parentsText);
  if (commits.length > maxCommits) {
    throw new Error(
      `the forward-port range carries ${commits.length} commits, above the ${maxCommits}-commit ` +
        'cap. A range that large is an unexpected shape for this operation, so it is reported as ' +
        'unverifiable rather than verified one commit at a time.'
    );
  }

  const deps = { mergeStatusFor, associationsFor, repository, acceptedBases, perPage };
  const verdicts = commits.map((commit) => classifyCommit(commit, deps));
  const accepted = verdicts.filter((verdict) => verdict.accepted);
  const refused = verdicts.filter((verdict) => !verdict.accepted);

  if (refused.length === 0) {
    return {
      ok: true,
      code: 0,
      accepted,
      refused,
      message:
        `All ${commits.length} commit(s) this forward-port would carry are accounted for:\n` +
        accepted.map((verdict) => `  accounted ${verdict.sha} — ${verdict.detail}`).join('\n'),
    };
  }

  return {
    ok: false,
    code: 1,
    accepted,
    refused,
    message:
      `${refused.length} of ${commits.length} commit(s) this forward-port would carry onto main ` +
      'cannot be attributed to a change reviewed against ' +
      `${acceptedBases.map((base) => `'${base}'`).join(' or ')}:\n` +
      refused
        .map(
          (verdict) =>
            `  REFUSED ${verdict.sha} — ${verdict.subject || '(no subject)'} ` +
            `<${verdict.author || 'unknown author'}>: ${verdict.detail}`
        )
        .join('\n'),
  };
}

/**
 * Read a comma-separated list option.
 *
 * A supplied-but-empty list THROWS rather than falling back to the default. Silently defaulting
 * would answer an operator who narrowed the accepted bases to nothing with the widest list they
 * could have meant, which is the wrong direction for a gate.
 *
 * @param {Map<string, string>} named The parsed `--name=value` options.
 * @param {string} name The option name.
 * @param {string[]} fallback The value used when the option is absent.
 * @returns {string[]} The items.
 * @throws {Error} If the option is present but names nothing.
 */
function listOption(named, name, fallback) {
  if (!named.has(name)) return fallback;
  const items = named
    .get(name)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) throw new Error(`--${name} was supplied but names nothing.`);
  return items;
}

/**
 * Read a positive-integer option, refusing anything else rather than silently defaulting.
 *
 * @param {Map<string, string>} named The parsed `--name=value` options.
 * @param {string} name The option name.
 * @param {number} fallback The value used when the option is absent.
 * @returns {number} The bound.
 * @throws {Error} If the option is present but not a positive integer.
 */
function positiveInteger(named, name, fallback) {
  if (!named.has(name)) return fallback;
  const raw = named.get(name);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer, got '${raw}'.`);
  }
  return parsed;
}

/**
 * Parse the CLI's three positional paths and its `--name=value` options.
 *
 * File paths cross on ARGV rather than on stdin, deliberately: this tool needs three independent
 * inputs, and assembling them into one JSON document inside a bash heredoc is a known corruption
 * hazard here. Reading a file is not spawning, so nothing is resolved off `PATH`.
 *
 * @param {string[]} argv Arguments after the script name.
 * @returns {object} The parsed invocation.
 * @throws {Error} On an unknown option or the wrong number of positional arguments.
 */
function parseArguments(argv) {
  const positional = [];
  const named = new Map();

  for (const argument of argv) {
    const match = /^--([a-z][a-z-]*)=(.*)$/.exec(argument);
    if (match) {
      named.set(match[1], match[2]);
      continue;
    }
    if (argument.startsWith('-')) throw new Error(`unknown option '${argument}'.\n${USAGE}`);
    positional.push(argument);
  }

  if (positional.length !== 3) {
    throw new Error(
      `expected 3 paths (commits file, combined-diff directory, associations directory), got ` +
        `${positional.length}.\n${USAGE}`
    );
  }

  const [commitsFile, mergeStatusDirectory, associationDirectory] = positional;
  return {
    commitsFile,
    mergeStatusDirectory,
    associationDirectory,
    repository: named.get('repository') ?? '',
    acceptedBases: listOption(named, 'accepted-bases', DEFAULT_ACCEPTED_BASES),
    perPage: positiveInteger(named, 'per-page', DEFAULT_PER_PAGE),
    maxCommits: positiveInteger(named, 'max-commits', DEFAULT_MAX_COMMITS),
  };
}

/**
 * Resolve the CLI to a process exit code.
 *
 * A pure function of its argv and its injected io, so the tests drive it with recorded evidence
 * CONTENT and never a subprocess, a temporary directory, or the live API.
 *
 * @param {string[]} argv Arguments after the script name.
 * @param {{log?: (msg: string) => void, error?: (msg: string) => void, readFile?: (path: string) => string}} [io]
 *   Injectable output and file reads.
 * @returns {number} 0 all accounted for, 1 at least one refused, 2 usage error or unverifiable input.
 */
export function run(argv, io = {}) {
  const { log = console.log, error = console.error, readFile } = io;

  if (argv.length === 0) {
    error(USAGE);
    return 2;
  }
  if (argv.some((argument) => ['--help', '-h'].includes(argument))) {
    error(USAGE);
    return 0;
  }

  try {
    const options = parseArguments(argv);
    if (typeof readFile !== 'function') {
      throw new TypeError('io.readFile was not supplied, so no evidence could be read.');
    }

    const verdict = verifyForwardPortProvenance({
      parentsText: readFile(options.commitsFile),
      mergeStatusFor: (sha) => readFile(`${options.mergeStatusDirectory}/${sha}.txt`),
      associationsFor: (sha) => readFile(`${options.associationDirectory}/${sha}.json`),
      repository: options.repository,
      acceptedBases: options.acceptedBases,
      perPage: options.perPage,
      maxCommits: options.maxCommits,
    });

    // `::error::` is a GitHub Actions annotation; harmless noise anywhere else.
    if (verdict.ok) log(verdict.message);
    else error(`::error::${verdict.message}`);

    // The verdict's OWN `code` is what the process exits with, rather than a `0`/`1` restated here.
    // The field is documented as this function's contract, and a documented field nothing reads is
    // a contract by assertion only — it drifts the moment the verdict grows a third outcome.
    return verdict.code;
  } catch (error_) {
    error(`::error::forward-port-provenance: ${error_.message}`);
    return 2;
  }
}
