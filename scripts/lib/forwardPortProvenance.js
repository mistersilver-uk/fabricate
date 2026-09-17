/** Change-provenance verifier for the forward-port's content gate (issue #1418). */

/** The base refs a merged pull request may target for its commits to count as reviewed here. */
const DEFAULT_ACCEPTED_BASES = ['release'];

/** The page size the collector requests, mirrored here so a full page can be recognised. */
const DEFAULT_PER_PAGE = 100;

/** Above this many commits the forward-port range is an unexpected shape and is not decided. */
const DEFAULT_MAX_COMMITS = 200;

/** An abbreviated or full object id. Anchored, so a subject line can never pass for one. */
const OBJECT_ID_RE = /^[0-9a-f]{7,64}$/i;

/** The merge-content verdicts `scripts/forward-port-content-gate.sh` writes, one per commit. */
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

/** Parse a `git rev-list --parents <range>` listing into commits with their parent object ids. */
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

/** Describe a payload that is not the array this endpoint returns on success. */
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

/** Normalise one raw REST pull-request entry, refusing a shape the predicate cannot read. */
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

/** Parse a verbatim `GET /repos/{owner}/{repo}/commits/{sha}/pulls` response into associations. */
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

/** Read the collector's merge-content verdict for one merge commit. */
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

/** Explain why one association does not account for a commit. */
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

/** The refusal detail for a commit no association accounts for. */
function explainRefusal(associations, deps) {
  if (associations.length === 0) return 'no pull request is associated with it at all';
  return associations.map((association) => describeDisqualification(association, deps)).join('; ');
}

/** Decide one commit against the two acceptance rules. */
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
    // merge commit closing a reviewed pull request based on the release line was reviewed, its
    // resolution included.
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

/** Reject a verification parameter that would make every verdict meaningless. */
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

/** Verify that every commit a forward-port would carry is attributable to a reviewed change. */
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

/** Read a comma-separated list option. */
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

/** Read a positive-integer option, refusing anything else rather than silently defaulting. */
function positiveInteger(named, name, fallback) {
  if (!named.has(name)) return fallback;
  const raw = named.get(name);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer, got '${raw}'.`);
  }
  return parsed;
}

/** Parse the CLI's three positional paths and its `--name=value` options. */
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

/** Resolve the CLI to a process exit code. */
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

    // The verdict's own `code` is what the process exits with, rather than a `0`/`1` restated here.
    return verdict.code;
  } catch (error_) {
    error(`::error::forward-port-provenance: ${error_.message}`);
    return 2;
  }
}
