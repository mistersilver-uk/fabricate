/**
 * The `check-screenshots` gate's composed decision: await the automated producer for THIS head,
 * then decide whether what it published is evidence for THIS head and THESE views.
 *
 * WHY THIS IS ONE FUNCTION AND NOT TWO (issue #1133)
 * -------------------------------------------------
 * The unit of behaviour is the ORDER: locate the producer's run, wait for it to conclude, re-read
 * the body it wrote, and only then decide. Exporting `await` and `evaluate` separately would leave
 * the ordering in `main()`, where no test can see it — a test that itself awaits, itself evaluates
 * and then asserts proves only that its own fakes returned what they were told, and would stay
 * green with the await call deleted. So {@link decideScreenshotGate} performs the whole decision and
 * returns a verdict; `main()`'s `check` branch is a thin adapter that supplies collaborators, maps
 * flags, and applies the returned exit code.
 *
 * WHY THIS MODULE IS A LEAF
 * -------------------------
 * It imports NOTHING from `scripts/ui-pr-screenshot-evidence.mjs`. Steps 1-3 and 8 need
 * `isExemptByLabel`, `validateChangedFilesForCheck`, `hasUiChanges` and
 * `explainScreenshotEvidenceFailure`, all of which live in that script — importing them would make
 * a `lib -> script -> lib` ESM cycle, and that script holds `VIEW_RECIPES` as a top-level
 * `Object.freeze([...])` which a cyclic partial-evaluation order can observe as `undefined`, in a
 * file `npm run lint` does not gate. Moving the predicates here instead is not viable either: they
 * depend on `VIEW_RECIPES`, which would drag the whole recipe registry with them.
 *
 * They therefore arrive through the injected `evaluate` collaborator bundle. That bundle is a
 * CYCLE-AVOIDANCE SEAM, NOT A TEST DOUBLE: `tests/screenshot-evidence-matching.test.js` passes the
 * real functions, because stubbing them would make the delegated verdicts a test asserting its own
 * stubs. Only `runGh`, `sleep` and `now` are faked. `scripts/lib/viewLabCases.js` IS imported — it
 * imports only `node:fs` and `node:url`, so there is no cycle, and it is the same
 * `mapChangedFilesToCases` the producer selects with, which is what makes the two selections
 * identical by construction rather than by coincidence.
 *
 * It spawns nothing (SonarCloud S4036: a new `spawnSync('gh', …)` resolving a bare name through
 * `PATH` is a new-code security finding) and reads no clock: `runGh`, `sleep` and `now` are all
 * injected, and the poll loop carries BOTH a deadline and an iteration cap so a clock bug fails
 * fast instead of hanging.
 */

import { mapChangedFilesToCases } from './viewLabCases.js';

/**
 * Bound defaults, EXPORTED so `tests/ci-workflow-semantics.test.js` can read them rather than
 * restate them, and so `main()`'s adapter passes no bound literal of its own.
 *
 * They must satisfy, and that test asserts:
 *
 *   graceMs + captureTimeoutMs + slackMs <= maxWaitMs <= maxPolls * pollIntervalMs
 *   maxWaitMs < (check-screenshots job timeout-minutes, converted to ms)
 *
 * The `maxPolls * pollIntervalMs` term is not decoration: without it the poll interval is a free
 * variable, and a product below `maxWaitMs` would red every UI PR at that product with
 * `capture-did-not-conclude` — this issue's own symptom under a new code — while every
 * injected-bound test stayed green.
 */

/** How long a producer run for this head is given to APPEAR before the gate gives up on it. */
export const GRACE_MS = 3 * 60_000;

/** Tolerance added to the producer's own job timeout, for its publish step and API latency. */
export const SLACK_MS = 5 * 60_000;

/** The whole gate's wall-clock ceiling, whatever the producer's own deadline works out to. */
export const MAX_WAIT_MS = 65 * 60_000;

/** The gap between polls of the runs list. */
export const POLL_INTERVAL_MS = 20_000;

/** The clock-independent iteration cap. A clock bug must fail fast, never hang a required check. */
export const MAX_POLLS = 240;

/**
 * The producer's own job timeout, as a default. `--capture-timeout-minutes` pins this to
 * `capture`'s real `timeout-minutes` in `pr-screenshots.yml`, and Task 6 asserts the two agree.
 */
export const CAPTURE_TIMEOUT_MS = 40 * 60_000;

/** The default workflow file the gate waits on. */
export const DEFAULT_CAPTURE_WORKFLOW = 'pr-screenshots.yml';

/**
 * The diagnostic codes. Each failure emits `::error::<code>: <prose>` so a test asserts on the code
 * rather than on wording, and — more importantly — so a reader is pointed at the right thing to fix.
 *
 * Three of these exist specifically because collapsing them reproduces this issue's own failure
 * under a new name: `capture-run-not-found` ("the producer has not appeared yet" is NOT "the author
 * supplied nothing"), `capture-run-failed` (the run failed on the change's own content) and
 * `capture-published-nothing` (the infrastructure the producer depends on was unavailable, which
 * the producer itself treats as outside the pull request's control).
 *
 * `pull-request-read-failed` exists for the same reason one level down. The body read is the most
 * exercised `gh` call in this module — it runs on every awaited run, and twice on a cancelled one —
 * and it used to THROW past the adapter, so a rate-limited `gh pr view` printed a bare
 * `Failed to read body for pull request #<n>: HTTP 403: API rate limit exceeded` with no
 * `::error::<code>` at all. An uncoded red is the failure this whole issue exists to remove, and the
 * runs-list call one function above already treats the SAME API under the SAME rate limit as a
 * warned, coded failure; the asymmetry was accidental. Both now fail closed, and both say which of
 * "the answer was no" and "there was no answer" happened.
 */
export const GATE_CODES = Object.freeze({
  NO_SCREENSHOTS_SECTION: 'no-screenshots-section',
  CAPTURE_RUN_NOT_FOUND: 'capture-run-not-found',
  CAPTURE_RUN_FAILED: 'capture-run-failed',
  CAPTURE_PUBLISHED_NOTHING: 'capture-published-nothing',
  NO_FRAMES_FOR_THIS_HEAD: 'no-frames-for-this-head',
  NO_FRAMES_FOR_CHANGED_VIEWS: 'no-frames-for-changed-views',
  CAPTURE_CANCELLED: 'capture-cancelled',
  CAPTURE_DID_NOT_CONCLUDE: 'capture-did-not-conclude',
  SUPERSEDED: 'superseded',
  PULL_REQUEST_READ_FAILED: 'pull-request-read-failed',
});

/** The managed screenshot block's delimiters, as `upsertScreenshotsBlock` writes them. */
const SCREENSHOTS_BLOCK_START = '<!-- fabricate:screenshots:start -->';
const SCREENSHOTS_BLOCK_END = '<!-- fabricate:screenshots:end -->';

/** What the body says about evidence, independent of what the producer's run did. */
const EVIDENCE = Object.freeze({
  SATISFIED: 'satisfied',
  NONE: 'none',
  STALE_HEAD: 'stale-head',
  WRONG_VIEWS: 'wrong-views',
});

/**
 * The image patterns are deliberately split into "find the whole span" and "narrow it in code".
 *
 * A single regex doing both is AMBIGUOUS and therefore backtracks super-linearly (SonarCloud S5852):
 * `\(\s*([^)\s]+)[^)]*\)` lets the capture and the tail compete for the same characters, and
 * `<img\b[^>]*\bsrc` lets `[^>]*` eat into the `src` it is looking for. Neither was theoretical —
 * on an unterminated `![a](aaa…` and on a run of `<img ` starts with no `src`, both forms cost
 * ~4x per doubling of the input (18ms at 4k characters, 1.1s at 32k); the two image patterns below
 * are flat at ~0.1ms on the same inputs.
 *
 * Each image pattern below is a single character-class repetition with a terminator the class
 * excludes, so there is exactly one way to match and nothing to backtrack over. The narrowing rules
 * that used to live in the quantifiers live in {@link markdownImageUrl} and {@link htmlImageSrc}
 * instead, where they are plain code. A differential fuzz over the old patterns agreed on every
 * input, so this is the same answer computed a different way — not a new parsing rule.
 */

/** The whole `![alt](target)` target, title and all. */
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\(([^)]*)\)/g;

/** A whole `<img …>` tag's attribute text, up to the closing `>` or the end of the input. */
const HTML_IMAGE_TAG_PATTERN = /<img\b([^>]*)/gi;

const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*$/;
const NEXT_HEADING_PATTERN = /^(#{1,6})\s/;

// ────────────────────────────────────────────────────────────────────────────────────────────────
// Pure parsing: what the body carries, and which frame each published URL is.
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The managed block's text, or `''` when the body carries no complete block.
 *
 * THE END DELIMITER IS SOUGHT FROM THE START DELIMITER, not from the beginning of the body. This
 * read `indexOf(END)` with an `end < start` ordering guard behind it, and that pair had a hole: on a
 * hand-edited body carrying a STRAY end delimiter above the real block, the first `end` precedes
 * `start`, the guard answered "no block", and the block's own auto-published frames were then
 * counted as images OUTSIDE the block — which satisfies the gate outright through the human-pasted
 * precedence rule, with no head or view matching applied. A stray delimiter must not launder
 * published frames into maintainer-supplied evidence.
 *
 * The ordering guard is gone with it rather than kept, because it was unfalsifiable: two
 * non-overlapping delimiters with the end one FIRST always satisfy `end + END.length <= start`, so
 * `slice(start, end + END.length)` already answered `''` and no input could tell the guard from its
 * absence. A scoped search states the same intent as code that runs.
 *
 * @param {string} text The normalized body.
 * @returns {string} The block, delimiters included.
 */
function managedBlockText(text) {
  const start = text.indexOf(SCREENSHOTS_BLOCK_START);
  if (start === -1) return '';
  const end = text.indexOf(SCREENSHOTS_BLOCK_END, start);
  if (end === -1) return '';
  return text.slice(start, end + SCREENSHOTS_BLOCK_END.length);
}

/**
 * The body with the managed block blanked out, LINE COUNT PRESERVED.
 *
 * Blanking rather than deleting keeps the surrounding heading structure exactly as a reader sees
 * it, and removes the block's own `## Screenshots` heading along with its frames — so what remains
 * is precisely the evidence a person put there.
 *
 * @param {string} text The normalized body.
 * @returns {string} The masked body.
 */
function maskManagedBlock(text) {
  const block = managedBlockText(text);
  if (!block) return text;
  return text.replaceAll(block, block.replaceAll(/[^\n]/g, ' '));
}

/**
 * The body of the Markdown section a heading opens, running to the next heading of the same or a
 * higher level.
 *
 * @param {string[]} lines The body's lines.
 * @param {number} headingIndex The heading's line index.
 * @param {number} level The heading's level.
 * @returns {string} The section body.
 */
function sectionBody(lines, headingIndex, level) {
  const collected = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const next = NEXT_HEADING_PATTERN.exec(lines[index]);
    if (next && next[1].length <= level) break;
    collected.push(lines[index]);
  }
  return collected.join('\n');
}

/**
 * Every "Screenshots" section of a body.
 *
 * Scoped EXACTLY as `hasScreenshotEvidence` scopes it. That scoping is load-bearing rather than
 * tidy: collecting every image in the body instead would make this gate WEAKER than today, because
 * a badge or an inline diagram in the Description would newly satisfy a UI PR.
 *
 * @param {string} body The pull request body.
 * @returns {string[]} The section bodies.
 */
function screenshotSections(body) {
  const lines = String(body || '')
    .replaceAll('\r\n', '\n')
    .split('\n');
  const sections = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = HEADING_PATTERN.exec(lines[index]);
    if (!heading) continue;
    if (!/^screenshots?\b/i.test(heading[2].trim())) continue;
    sections.push(sectionBody(lines, index, heading[1].length));
  }
  return sections;
}

/**
 * The URL half of a Markdown image target, dropping the optional `"title"` that may follow it.
 *
 * CommonMark separates the destination from the title with whitespace, so the destination is the
 * first whitespace-delimited run — exactly what the old `\(\s*([^)\s]+)` captured, and exactly what
 * made that pattern ambiguous against the `[^)]*` tail behind it.
 *
 * @param {string} target The text between the target's parentheses.
 * @returns {string} The destination, or `''` when the target carries none.
 */
function markdownImageUrl(target) {
  return target.trimStart().split(/\s/, 1)[0];
}

/**
 * The `src` a `<img …>` tag's attribute text carries, or `''` when it carries none.
 *
 * THE RIGHTMOST `src=` WINS, which is what the greedy `[^>]*` in the old single-regex form did:
 * greedy repetition backtracks from the right, so the first prefix length at which `\bsrc` matched
 * was the LAST `src=` in the tag. The value rule is unchanged too: one optional opening quote, then
 * the run of characters that is neither a quote, whitespace, nor `>`.
 *
 * The scan advances by ONE CHARACTER per hit rather than by the whole match, so overlapping
 * occurrences (`src=src=x`, where the value itself contains `src=`) are all considered and the last
 * start position still wins. A differential fuzz against the old pattern found that exact input
 * class to be the only place a non-overlapping `matchAll` diverged.
 *
 * The pattern is declared HERE rather than beside its siblings above because this scan drives
 * `lastIndex` by hand: a module-level global regex would carry that cursor between calls, which is
 * shared mutable state whose correctness depends on every future caller resetting it.
 *
 * @param {string} attributes The text between `<img` and the tag's closing `>`.
 * @returns {string} The `src` value.
 */
function htmlImageSrc(attributes) {
  const pattern = /\bsrc\s*=\s*["']?([^"'\s>]+)/gi;
  let src = '';
  for (let match = pattern.exec(attributes); match; match = pattern.exec(attributes)) {
    src = match[1];
    pattern.lastIndex = match.index + 1;
  }
  return src;
}

/**
 * The image URLs in a chunk of Markdown, from both the `![alt](url)` and the `<img src=…>` forms.
 *
 * Empty results are dropped: a target with no destination (`![alt]()`) and a tag with no `src` were
 * both non-matches under the old patterns, so counting them now would newly satisfy the gate on
 * markup carrying no image at all.
 *
 * @param {string} text The Markdown.
 * @returns {string[]} The URLs, in no particular order.
 */
function imageUrlsIn(text) {
  const source = String(text || '');
  return [
    ...Array.from(source.matchAll(MARKDOWN_IMAGE_PATTERN), (match) => markdownImageUrl(match[1])),
    ...Array.from(source.matchAll(HTML_IMAGE_TAG_PATTERN), (match) => htmlImageSrc(match[1])),
  ].filter(Boolean);
}

/**
 * Drop a filename's extension.
 *
 * @param {string} name A path segment.
 * @returns {string} The segment without its extension.
 */
function withoutExtension(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * The View Lab case and head SHA a published frame's URL identifies, or `null` when the URL is not
 * one of this pull request's published frames.
 *
 * THE URL IS THE MACHINE-READABLE IDENTITY, NOT THE ALT TEXT. `labelForCaseId` is not wired into the
 * CLI publish path, so the alt text falls back to a `VIEW_RECIPES` lookup and only then to the bare
 * id — ambiguous by construction. `uploadScreenshotObjects` builds `${prefix}/${pr}[/${sha}]/${name}`,
 * so the last path segment minus its extension is the case id and the segment before it is the head
 * the frames were drawn for.
 *
 * ANCHORED ON THE PR NUMBER, deliberately. "Looks like hex" is unsound as a discriminator, because
 * `normalizeHeadShaSegment` permits `[0-9a-zA-Z._-]+` — a legacy `<view>.png` segment can satisfy
 * it. It must NOT anchor on the configured S3 prefix or base URL either: `check-screenshots` sets no
 * `S3_RELEASE_BUCKET` / `RELEASE_BASE_URL`, so `loadS3Config` is unavailable in that job.
 *
 * A legacy key carrying no SHA segment answers `headSha: null`, which the matcher treats as
 * unmatched-for-head and falls back to the case-id rule — so a publish-flag regression degrades to
 * today's behaviour instead of reddening every UI PR.
 *
 * @param {string} url The image URL.
 * @param {string|number} prNumber The pull request number.
 * @returns {{caseId: string, headSha: string|null}|null} The frame's identity.
 */
export function classifyPublishedFrameUrl(url, prNumber) {
  const target = String(prNumber ?? '').trim();
  if (!target) return null;
  const segments = String(url || '')
    .split(/[?#]/, 1)[0]
    .split('/')
    .filter(Boolean);

  const revisioned = segments.length - 3;
  if (revisioned >= 0 && segments[revisioned] === target) {
    return {
      caseId: withoutExtension(segments[revisioned + 2]),
      headSha: segments[revisioned + 1],
    };
  }
  const legacy = segments.length - 2;
  if (legacy >= 0 && segments[legacy] === target) {
    return { caseId: withoutExtension(segments[legacy + 1]), headSha: null };
  }
  return null;
}

/**
 * Split a body's screenshot images into the automatically published frames and the ones a person
 * put there.
 *
 * `hasManagedBlock` is reported SEPARATELY from `inBlock.length`, because the two are not the same
 * question and a diagnostic that conflates them names a block the reader cannot find. `containsImage`
 * in `scripts/ui-pr-screenshot-evidence.mjs` accepts `<img src="">` and `![a](   )`, whose URL halves
 * {@link imageUrlsIn} correctly drops — so a body with neither a block nor a usable image URL reaches
 * the matcher with an empty `inBlock`, and "the managed screenshot block carries no frame" would then
 * be said of a block that is not there.
 *
 * @param {string} body The pull request body.
 * @param {object} [options] Parsing inputs.
 * @param {string|number} [options.prNumber] The pull request number, the key-shape anchor.
 * @returns {{inBlock: {caseId: string|null, headSha: string|null, url: string}[], outsideBlock: string[], hasManagedBlock: boolean}}
 *   The managed block's frames with their identities, the URLs of the Screenshots-section images that
 *   are not in the block, and whether the body carries a complete managed block at all.
 */
export function parseScreenshotEvidenceImages(body = '', { prNumber } = {}) {
  const text = String(body || '').replaceAll('\r\n', '\n');
  const block = managedBlockText(text);
  const inBlock = imageUrlsIn(block).map((url) => ({
    url,
    ...(classifyPublishedFrameUrl(url, prNumber) ?? { caseId: null, headSha: null }),
  }));
  const outsideBlock = screenshotSections(maskManagedBlock(text)).flatMap((section) =>
    imageUrlsIn(section)
  );
  return { inBlock, outsideBlock, hasManagedBlock: block !== '' };
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// Run selection: `head_sha` identifies a COMMIT, not a run.
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Whether a workflow run belongs to this pull request.
 *
 * One commit can head more than one open pull request, so the head SHA alone is not enough.
 * `pull_requests[].number` is the direct answer; `head_branch` plus `head_repository.full_name` is
 * the fallback for a run whose `pull_requests` array the API left empty.
 *
 * EACH NARROWING INPUT IS OPTIONAL, AND AN ABSENT ONE NARROWS NOTHING — it does not reject
 * everything. `headRepository` is empty on a real CI path: when a contributor deletes their fork
 * while the pull request is open, `head.repo` is null and `ci.yml` renders `--head-repository ''`.
 * The runs list is already scoped to this head SHA and this event, and the two rules above it are
 * the discriminating ones, so dropping an unusable input is the correct degradation. Rejecting
 * every run instead would answer `capture-run-not-found` on a pull request whose producer ran.
 *
 * @param {object} run A workflow run from the runs LIST resource.
 * @param {object} scope The pull request's identity.
 * @returns {boolean} True when the run is this pull request's.
 */
function runBelongsToPullRequest(run, { prNumber, headBranch, headRepository }) {
  const attached = Array.isArray(run?.pull_requests) ? run.pull_requests : [];
  if (attached.length > 0) {
    return attached.some((pullRequest) => Number(pullRequest?.number) === Number(prNumber));
  }
  if (!headBranch) return true;
  if (run?.head_branch !== headBranch) return false;
  const fullName = run?.head_repository?.full_name;
  return !headRepository || !fullName || fullName === headRepository;
}

/**
 * A run's creation time in milliseconds, or 0 when it carries none.
 *
 * @param {object} run A workflow run.
 * @returns {number} Milliseconds since the epoch.
 */
function createdAtMs(run) {
  const parsed = Date.parse(run?.created_at ?? '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * The producer run this gate should await, from every run reported for this head.
 *
 * A NON-TERMINAL run wins over a terminal one, whatever their creation order. That preference is the
 * load-bearing half: a re-run keeps its original `created_at`, so "most recently created" can pick a
 * finished run while an in-flight one is still writing the body — the gate then reads a stale
 * success and reds a body the live run has not written yet, reintroducing the very race this change
 * removes. Among equally terminal (or equally non-terminal) candidates the most recently created
 * wins, because `opened` then `reopened`, or a synchronize landing on the same SHA, can leave
 * several.
 *
 * @param {object[]} runs Runs from the LIST resource, which already reports the LATEST ATTEMPT's
 *   `status` and `conclusion` — so no per-attempt `GET …/attempts/{n}` call is needed.
 * @param {object} scope The pull request's identity (`prNumber`, `headBranch`, `headRepository`).
 * @returns {object|null} The run to await, or null when none belongs to this pull request.
 */
export function selectCaptureRun(runs = [], scope = {}) {
  const mine = runs.filter((run) => runBelongsToPullRequest(run, scope));
  if (mine.length === 0) return null;
  const pending = mine.filter((run) => run.status !== 'completed');
  const candidates = pending.length > 0 ? pending : mine;
  // SEEDED WITH `null`, not left seedless. A seedless `reduce` throws on an empty array, so its
  // safety is a property of the two guards above it rather than of this line; the seed makes the
  // empty case answer `null` — the documented "no run belongs to this pull request" answer — instead
  // of depending on a caller-visible invariant staying true. `>=` keeps the LAST of equally-created
  // runs.
  //
  // The RECENCY rule itself is pinned by (i4), and by that case alone: (i) and (i3) put their two
  // runs in different terminality classes, so `pending` narrows to one candidate there and this
  // reduce never compares a pair. (i4) supplies two equally-classed runs, which is the shape
  // `opened` then `reopened` — and a synchronize landing on the same SHA — actually produces.
  return candidates.reduce(
    (best, run) => (best === null || createdAtMs(run) >= createdAtMs(best) ? run : best),
    null
  );
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// Body assessment.
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The identified frames this gate is entitled to treat as drawn for the pull request's current head.
 *
 * AN ABSENT `headSha` MEANS "CANNOT JUDGE HEAD", NOT "EVERY FRAME IS STALE". `headSha` is optional
 * and defaults to `''`, while a published key's SHA segment is never empty (it is `.filter(Boolean)`-ed
 * out of the path), so a plain equality test classes EVERY identified frame stale the moment the
 * caller supplies no head — which is exactly what `npm run screenshots:ui:check` and any other
 * non-`--await-capture` invocation do. That turned a body carrying a perfectly good published block
 * into `no-frames-for-this-head` (with an empty SHA interpolated into the prose), contradicting the
 * gate's own contract that the default path behaves as it did before this change.
 *
 * The degradation granted here is the one the code ALREADY grants a legacy key that carries no SHA
 * segment: unmatched-for-head falls back to the case-id rule rather than hard-failing. The staleness
 * rule stays strict wherever a head SHA IS available — which is every path that can actually judge
 * staleness, including every CI invocation, since `ci.yml` always passes `--head-sha`.
 *
 * @param {{caseId: string, headSha: string|null}[]} identified The block's identified frames.
 * @param {object} context The normalized gate context.
 * @returns {{caseId: string, headSha: string|null}[]} The frames not known to belong to another head.
 */
function framesForThisHead(identified, context) {
  if (!context.headSha) return identified;
  return identified.filter((frame) => frame.headSha === null || frame.headSha === context.headSha);
}

/**
 * Whether the automatically published frames in the block are evidence for THIS head and THESE
 * views.
 *
 * INTERSECTION, NOT EQUALITY, deliberately: a partial render publishes a proper subset of the
 * selection, and a run that renders 200 of 218 selected cases has still produced evidence. Requiring
 * equality would invent a new class of false red — precisely the failure this change exists to
 * remove. Non-empty intersection is enough for the "genuinely frame-less PR still fails" criterion,
 * because a producer that published nothing has an empty intersection.
 *
 * @param {{inBlock: {caseId: string|null, headSha: string|null}[], hasManagedBlock: boolean}} images
 *   The body's parsed managed-block images.
 * @param {object} context The normalized gate context.
 * @returns {{state: string, message: string}} The assessment.
 */
function matchPublishedFrames({ inBlock, hasManagedBlock }, context) {
  const identified = inBlock.filter((frame) => frame.caseId);
  if (identified.length === 0) {
    return {
      state: EVIDENCE.NONE,
      message: publishedNothingIdentifiable(context, hasManagedBlock),
    };
  }

  const forThisHead = framesForThisHead(identified, context);
  if (forThisHead.length === 0) {
    return { state: EVIDENCE.STALE_HEAD, message: staleHeadMessage(identified, context) };
  }

  const expected = new Set(
    mapChangedFilesToCases(context.changedFiles, { patches: context.patches }).map(
      (viewCase) => viewCase.id
    )
  );
  // Defensive, and pinned UNREACHABLE by the property test in
  // `tests/screenshot-evidence-matching.test.js`: `mapChangedFilesToCases` filters to `publish: true`
  // cases and so CAN return `[]` in principle, but cannot while this gate is armed, because selection
  // falls back to a publishable default case. This is not dead code to be made reachable — it is the
  // answer for the day that fallback stops publishing, when refusing every frame would be worse than
  // accepting the ones that exist.
  if (expected.size === 0)
    return { state: EVIDENCE.SATISFIED, message: matchedMessage(forThisHead) };

  const matched = forThisHead.filter((frame) => expected.has(frame.caseId));
  if (matched.length === 0) {
    return { state: EVIDENCE.WRONG_VIEWS, message: wrongViewsMessage(forThisHead, expected) };
  }
  return { state: EVIDENCE.SATISFIED, message: matchedMessage(matched) };
}

/**
 * What the pull request body says about screenshot evidence.
 *
 * ORDER MATTERS. The human-pasted precedence rule is checked FIRST: any qualifying image in a
 * Screenshots section that is not inside the managed block satisfies the gate outright, with no
 * matching applied. Drag-and-dropped GitHub attachments carry no case id and no head SHA, so
 * matching them is impossible — and that path is the only one open to a fork pull request, as well
 * as the fallback the whole "accelerator, not a gate" design rests on. Matching constrains
 * automatically published frames only.
 *
 * @param {string} body The pull request body.
 * @param {object} context The normalized gate context.
 * @returns {{state: string, message: string}} The assessment.
 */
function assessBody(body, context) {
  const images = parseScreenshotEvidenceImages(body, { prNumber: context.prNumber });
  if (images.outsideBlock.length > 0) {
    return {
      state: EVIDENCE.SATISFIED,
      message: `Screenshot evidence found in the pull request body (${images.outsideBlock.length} image(s) supplied outside the managed block; no matching applied).`,
    };
  }

  const missing = context.evaluate.explainMissingEvidence(context.changedFiles, body, {
    prNumber: context.prNumber,
    exemptLabel: context.exemptLabel,
  });
  if (missing) return { state: EVIDENCE.NONE, message: missing };

  return matchPublishedFrames(images, context);
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// Messages.
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {{caseId: string}[]} frames Matched frames.
 * @returns {string} The pass message.
 */
function matchedMessage(frames) {
  const ids = frames.map((frame) => frame.caseId).join(', ');
  return `UI smoke screenshot evidence found for this head: ${ids}.`;
}

/**
 * The head SHA as a noun phrase, NEVER an empty interpolation.
 *
 * `headSha` is optional, so `run for ${context.headSha}` renders as `run for ` on any call that
 * supplies none — a sentence with a hole in it, which reads as a bug in the gate rather than as a
 * diagnosis of the pull request.
 *
 * @param {object} context The normalized gate context.
 * @returns {string} The SHA, or a phrase naming the head without one.
 */
function headPhrase(context) {
  return context.headSha || "this pull request's head";
}

/**
 * The head SHA as a trailing qualifier, or nothing at all when the gate was given none.
 *
 * @param {object} context The normalized gate context.
 * @returns {string} A leading-space-prefixed SHA, or `''`.
 */
function headSuffix(context) {
  return context.headSha ? ` ${context.headSha}` : '';
}

/**
 * The diagnostic for a body whose Screenshots section produced no identifiable published frame.
 *
 * It has TWO forms because there are two conditions, and the block-less one is reachable: the
 * evidence predicate in `scripts/ui-pr-screenshot-evidence.mjs` accepts `<img src="">` and `![a](  )`
 * as images while {@link imageUrlsIn} correctly reads no URL out of either, so a body carrying that
 * markup under a Screenshots heading and NO managed block lands here. Naming a managed block in that
 * case sends the reader looking for something the body does not contain.
 *
 * @param {object} context The normalized gate context.
 * @param {boolean} hasManagedBlock Whether the body carries a complete managed block at all.
 * @returns {string} The diagnostic.
 */
function publishedNothingIdentifiable(context, hasManagedBlock) {
  if (!hasManagedBlock) {
    return `This pull request's body carries no managed screenshot block, and the image markup under its Screenshots heading supplies no image URL — an \`<img>\` with an empty \`src\`, or an \`![alt]()\` with an empty target, is markup without an image. Embed an image with a real URL, or let the ${context.captureWorkflow} capture publish the block.`;
  }
  return `The managed screenshot block carries no frame this gate can identify as belonging to pull request #${context.prNumber}. Auto-published frames are identified by their published location (\`<prefix>/<pr>/<head-sha>/<case-id>.png\`), not by their caption.`;
}

/**
 * @param {{caseId: string, headSha: string|null}[]} frames The block's identified frames.
 * @param {object} context The normalized gate context.
 * @returns {string} The diagnostic.
 */
function staleHeadMessage(frames, context) {
  const heads = [...new Set(frames.map((frame) => frame.headSha).filter(Boolean))].join(', ');
  return `The managed screenshot block's frames were drawn for ${heads || 'another head'}, not for this pull request's head${headSuffix(context)}. A stale frame depicts a state this pull request no longer proposes, so it is not evidence for it. Push again, or re-run the ${context.captureWorkflow} capture, so the block is republished for this head.`;
}

/**
 * @param {{caseId: string}[]} frames The frames published for this head.
 * @param {Set<string>} expected The case ids this pull request's changed files select.
 * @returns {string} The diagnostic.
 */
function wrongViewsMessage(frames, expected) {
  const published = frames.map((frame) => frame.caseId).join(', ');
  return `The frames published for this head (${published}) depict none of the views this pull request's changed files select (${[...expected].join(', ')}). Evidence has to show the screens that changed.`;
}

/**
 * @param {object} run The concluded producer run.
 * @param {object} context The normalized gate context.
 * @returns {string} A sentence naming the run's conclusion and URL.
 */
function runSummary(run, context) {
  return `The ${context.captureWorkflow} run for ${headPhrase(context)} concluded ${run?.conclusion ?? 'with no conclusion'} (${run?.html_url ?? 'no run URL reported'}).`;
}

/**
 * The `capture-published-nothing` diagnostic.
 *
 * It enumerates FOUR causes rather than the two infrastructure ones, because `capture` concludes
 * `success` while publishing nothing on four real paths: the OIDC assume-role step is
 * `continue-on-error` and its publish step then warns and exits 0; missing Foundry credentials set
 * `SKIP_CAPTURE=true` and every later step is `if:`-skipped while the JOB still concludes `success`;
 * an empty case selection skips the render and publish steps; and an unarmed `has_ui` does the same.
 * The last matters most, because the two jobs arm on two hand-maintained mirrors of the same
 * predicate — `hasUiChanges` in `scripts/lib/viewLabCases.js` for the producer and `hasUiChanges` in
 * `scripts/ui-pr-screenshot-evidence.mjs` for this gate. When they drift, this gate arms, capture
 * skips publishing, and a message naming only IAM and Foundry credentials gives an actively wrong
 * diagnosis. The property test in `tests/screenshot-evidence-matching.test.js` is the drift detector.
 *
 * @param {object} run The concluded producer run.
 * @param {object} context The normalized gate context.
 * @returns {string} The diagnostic.
 */
function publishedNothingMessage(run, context) {
  return `${runSummary(run, context)} It published no screenshot block for this head. Four causes conclude that way, none of them a fault in this pull request: the S3 upload role could not be assumed (an IAM trust-policy gap); Foundry credentials were unavailable, so capture was skipped; the changed files selected no View Lab case; or the producer's own UI predicate did not arm while this gate did (the two are hand-maintained mirrors of one rule and can drift). Paste evidence into the body, or ask a maintainer for the '${context.exemptLabel}' label.`;
}

/**
 * The `capture-run-not-found` diagnostic.
 *
 * It has TWO forms because "no run appeared" has two causes that the run list cannot tell apart from
 * its result alone. When at least one poll READ the list, the absence is a real observation and the
 * reader should check whether the producer dispatches for this pull request. When every poll's list
 * call failed, nothing was observed at all: a GitHub API outage or a rate-limit 403 answers `[]` just
 * as an absent producer does, and asserting the producer never dispatched is then a claim the gate
 * has no evidence for. Both forms still FAIL — only the prose differs.
 *
 * @param {object} context The normalized gate context.
 * @param {object} tracker The loop's mutable state.
 * @returns {string} The diagnostic.
 */
function runNotFoundMessage(context, tracker) {
  const grace = `${Math.round(context.graceMs / 1000)}s`;
  if (tracker.listReads === 0) {
    return `The ${context.captureWorkflow} runs for ${headPhrase(context)} could not be read within ${grace}: all ${tracker.listFailures} attempt(s) to list them failed, so this gate never saw the run list. A GitHub API outage or a rate limit answers exactly as an absent producer does, so this is NOT evidence that ${context.captureWorkflow} failed to dispatch, and it is not missing author evidence either. Re-run this check; if it keeps failing, the run-list call is what to investigate, not this pull request.`;
  }
  return `No ${context.captureWorkflow} run for ${headPhrase(context)} appeared within ${grace}. A producer WAS expected for this head, so this is not missing author evidence — check whether ${context.captureWorkflow} is dispatching for this pull request at all.`;
}

/**
 * The `pull-request-read-failed` diagnostic.
 *
 * It says WHICH question went unanswered, for the same reason `capture-run-not-found` has two forms:
 * an unread body is not evidence that the body is empty, and reporting it as
 * `capture-published-nothing` would tell the reader to go and look at an IAM trust policy for what
 * is really a rate limit on this gate's own call.
 *
 * @param {object} context The normalized gate context.
 * @param {string} error What the failed call reported.
 * @returns {string} The diagnostic.
 */
function bodyUnreadableMessage(context, error) {
  return `This gate could not read pull request #${context.prNumber}'s body after the ${context.captureWorkflow} run for ${headPhrase(context)} concluded: ${error}. It therefore does not know whether that run published evidence, and a gate that cannot read the body must not guess at it — so this fails rather than passing. A GitHub API outage or a rate limit on this gate's own call reads exactly this way, so this is NOT missing author evidence and NOT a fault in the capture: re-run this check.`;
}

/**
 * @param {object} run The concluded producer run.
 * @param {object} context The normalized gate context.
 * @returns {string} The diagnostic.
 */
function runFailedMessage(run, context) {
  return `${runSummary(run, context)} A failed capture usually failed on this pull request's own content — a broken View Lab case, a console error in a frame, or the chrome-provenance / drift gates — rather than on an infrastructure gap. Read that run's log before pasting evidence by hand.`;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// Collaborator calls.
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every producer run GitHub reports for this head, or `[]` when the call fails.
 *
 * A failed list call is warned about and treated as an empty poll rather than thrown: polling
 * retries by construction, and if none ever succeeds the gate ends at `capture-run-not-found`, which
 * is fail-closed.
 *
 * IT ALSO RECORDS WHETHER THE LIST WAS EVER READ. `[]` from a sustained API outage or a rate-limit
 * 403 is byte-identical to `[]` from a producer that never dispatched, and only this function knows
 * which it was. Without the count, `capture-run-not-found` tells the reader to check whether the
 * producer workflow is dispatching at all — the wrong place to look, and this whole issue exists
 * because a red that names the wrong problem trains maintainers to ignore the gate.
 *
 * @param {object} context The normalized gate context.
 * @param {object} tracker The loop's mutable state, which counts read outcomes.
 * @returns {object[]} The runs.
 */
function listCaptureRuns(context, tracker) {
  const query =
    `repos/${context.repo}/actions/workflows/${context.captureWorkflow}/runs` +
    `?head_sha=${encodeURIComponent(context.headSha)}&event=pull_request&per_page=100`;
  const result = context.runGh(['api', query]);
  if (result?.status !== 0) {
    tracker.listFailures += 1;
    console.warn(
      `::warning::Could not list ${context.captureWorkflow} runs for ${headPhrase(context)}: ${result?.stderr || 'unknown error'}`
    );
    return [];
  }
  try {
    const parsed = JSON.parse(String(result.stdout || '{}'));
    tracker.listReads += 1;
    return Array.isArray(parsed.workflow_runs) ? parsed.workflow_runs : [];
  } catch {
    tracker.listFailures += 1;
    console.warn(`::warning::Could not parse the ${context.captureWorkflow} runs response.`);
    return [];
  }
}

/**
 * Read a `gh pr view --json <field>` scalar.
 *
 * IT ANSWERS AN OUTCOME RATHER THAN THROWING. A throw here left the process to the adapter's
 * top-level handler, which prints `error.message` bare — no `::error::<code>`, on the most exercised
 * `gh` call in this module, under exactly the rate limit `listCaptureRuns` already handles as a
 * warned, coded failure. The caller decides what an unread field means: a body it cannot read is
 * `pull-request-read-failed` and fails closed, while a live head it cannot read simply declines to
 * take the `superseded` escape hatch — which can only ever turn a failure into a pass, so failing to
 * perform it is fail-closed by construction.
 *
 * `--repo` SCOPING is not decoration: `gh pr view <n>` without it resolves the number against
 * whatever remote the runner's checkout points at, which on a fork's checkout is a different pull
 * request with the same number.
 *
 * @param {object} context The normalized gate context.
 * @param {string} field The JSON field.
 * @returns {{ok: boolean, value: string, error: string}} The read's outcome.
 */
function readPullRequestField(context, field) {
  const args = ['pr', 'view', String(context.prNumber)];
  if (context.repo) args.push('--repo', context.repo);
  args.push('--json', field, '--jq', `.${field}`);
  const result = context.runGh(args);
  if (result?.status !== 0) {
    const error = result?.stderr || 'unknown error';
    console.warn(
      `::warning::Could not read ${field} for pull request #${context.prNumber}: ${error}`
    );
    return { ok: false, value: '', error };
  }
  return { ok: true, value: String(result.stdout || '').trim(), error: '' };
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// The composed decision.
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build the verdict the adapter applies.
 *
 * @param {object} parts The verdict's parts.
 * @returns {{exitCode: number, code: string|null, message: string, waited: boolean, polls: number, runUrl: string|null, runConclusion: string|null}}
 *   The verdict.
 */
function verdict({ exitCode, code = null, message, tracker = null, run = null }) {
  return {
    exitCode,
    code,
    message,
    waited: (tracker?.sleeps ?? 0) > 0,
    polls: tracker?.polls ?? 0,
    runUrl: run?.html_url ?? null,
    runConclusion: run?.conclusion ?? null,
  };
}

/**
 * Normalize the call's inputs, applying the exported bound defaults.
 *
 * @param {object} options The call's options.
 * @returns {object} The normalized context.
 */
function normalizeOptions(options) {
  const {
    runGh,
    sleep,
    now,
    evaluate,
    changedFiles = [],
    changedFilesRequired = false,
    patches,
    body = '',
    headSha = '',
    prNumber,
    repo = '',
    headBranch = '',
    headRepository = '',
    captureWorkflow = DEFAULT_CAPTURE_WORKFLOW,
    awaitCapture = false,
    captureEligible = false,
    exemptLabel = 'screenshots-exempt',
    labels = [],
    captureTimeoutMs = CAPTURE_TIMEOUT_MS,
    graceMs = GRACE_MS,
    slackMs = SLACK_MS,
    maxWaitMs = MAX_WAIT_MS,
    maxPolls = MAX_POLLS,
    pollIntervalMs = POLL_INTERVAL_MS,
  } = options ?? {};
  return {
    runGh,
    sleep,
    now,
    evaluate,
    changedFiles,
    changedFilesRequired,
    patches,
    body,
    headSha,
    prNumber,
    repo,
    headBranch,
    headRepository,
    captureWorkflow,
    awaitCapture,
    captureEligible,
    exemptLabel,
    labels,
    captureTimeoutMs,
    graceMs,
    slackMs,
    maxWaitMs,
    maxPolls,
    pollIntervalMs,
  };
}

/**
 * Sleep one poll interval, recording it.
 *
 * @param {object} context The normalized gate context.
 * @param {object} tracker The loop's mutable state.
 * @returns {Promise<void>} Resolves after the sleep.
 */
async function sleepOnce(context, tracker) {
  tracker.sleeps += 1;
  await context.sleep(context.pollIntervalMs);
}

/**
 * Record the deadline anchor at the FIRST NON-`queued` observation.
 *
 * `capture`'s `timeout-minutes` counts from JOB START, not from run creation, so a deadline measured
 * from this gate's own start expires on a capture that is queued and about to succeed — trading the
 * old false red for a new one. The anchor rule deliberately does not bet on what `run_started_at`
 * means for a queued run: if this gate ever SAW the run `queued`, the anchor is its own `now()` at
 * the first non-`queued` observation, which is always at or after true job start and therefore errs
 * toward a later deadline — the safe direction. `run_started_at` is used only when the run was
 * already non-`queued` when first observed.
 *
 * @param {object} context The normalized gate context.
 * @param {object} tracker The loop's mutable state.
 * @param {object} run The run as last observed.
 * @returns {void}
 */
function observeAnchor(context, tracker, run) {
  if (tracker.anchorMs !== null) return;
  if (run?.status === 'queued') {
    tracker.sawQueued = true;
    return;
  }
  if (tracker.sawQueued) {
    tracker.anchorMs = context.now();
    return;
  }
  const started = Date.parse(run?.run_started_at ?? '');
  tracker.anchorMs = Number.isNaN(started) ? context.now() : started;
}

/**
 * The earlier of the producer's anchored deadline and this gate's own wall-clock ceiling.
 *
 * Queued time does not consume the capture budget, but it does consume `maxWaitMs`, which bounds the
 * whole gate.
 *
 * @param {object} context The normalized gate context.
 * @param {object} tracker The loop's mutable state.
 * @returns {number} The deadline, on the injected clock.
 */
function effectiveDeadline(context, tracker) {
  const ceiling = tracker.gateStart + context.maxWaitMs;
  if (tracker.anchorMs === null) return ceiling;
  return Math.min(tracker.anchorMs + context.captureTimeoutMs + context.slackMs, ceiling);
}

/**
 * Poll until a producer run for this head APPEARS, for the grace window.
 *
 * The grace window is not optional: both jobs are dispatched from the same event, so without it the
 * race is merely moved up one level — the gate would look once, before the producer's run existed,
 * and give up.
 *
 * @param {object} context The normalized gate context.
 * @param {object} tracker The loop's mutable state.
 * @returns {Promise<object|null>} The run, or null when none appeared.
 */
async function locateCaptureRun(context, tracker) {
  for (;;) {
    tracker.polls += 1;
    const run = selectCaptureRun(listCaptureRuns(context, tracker), context);
    if (run) return run;
    if (context.now() - tracker.gateStart >= context.graceMs) return null;
    if (tracker.polls >= context.maxPolls) return null;
    await sleepOnce(context, tracker);
  }
}

/**
 * Poll until the located run reaches a conclusion, the deadline passes, or the iteration cap is hit.
 *
 * A TIMEOUT MUST FAIL. A gate that passes on a timeout is a gate that can be waited out.
 *
 * @param {object} context The normalized gate context.
 * @param {object} tracker The loop's mutable state.
 * @param {object} initial The located run.
 * @returns {Promise<{run: object, timedOut: boolean}>} The last observed run and why the loop ended.
 */
async function awaitConclusion(context, tracker, initial) {
  let run = initial;
  for (;;) {
    observeAnchor(context, tracker, run);
    if (run?.status === 'completed') return { run, timedOut: false };
    if (tracker.polls >= context.maxPolls) return { run, timedOut: true };
    if (context.now() >= effectiveDeadline(context, tracker)) return { run, timedOut: true };
    await sleepOnce(context, tracker);
    tracker.polls += 1;
    // Re-read THE RUN WE ARE AWAITING, by id — not a fresh selection. Once the awaited run
    // concludes it is no longer non-terminal, so re-selecting would hand the verdict to whichever
    // sibling was created last, and the gate would report a conclusion and a URL belonging to a run
    // it never waited on. The `?? run` fallback keeps the last known state if the list drops it.
    const runs = listCaptureRuns(context, tracker);
    run = runs.find((candidate) => candidate?.id === initial?.id) ?? run;
  }
}

/**
 * The code that names WHY the body carries no evidence, given the producer run's conclusion.
 *
 * @param {object} run The concluded run.
 * @param {object} context The normalized gate context.
 * @returns {{code: string, message: string}} The code and its prose.
 */
function diagnoseConclusion(run, context) {
  if (run?.conclusion === 'cancelled') {
    return {
      code: GATE_CODES.CAPTURE_CANCELLED,
      message: `${runSummary(run, context)} This pull request's head has not moved, so no newer run is authoritative and there is no published evidence for it.`,
    };
  }
  if (run?.conclusion === 'failure') {
    return { code: GATE_CODES.CAPTURE_RUN_FAILED, message: runFailedMessage(run, context) };
  }
  return {
    code: GATE_CODES.CAPTURE_PUBLISHED_NOTHING,
    message: publishedNothingMessage(run, context),
  };
}

/**
 * Turn a body assessment into a verdict, letting the body's own, more specific diagnosis win over
 * the run-conclusion one.
 *
 * That precedence is what makes a failed capture whose body still holds the PREVIOUS head's frames
 * report `no-frames-for-this-head` — the stale-evidence hole — rather than blaming the run.
 *
 * @param {{state: string, message: string}} assessment The body assessment.
 * @param {{code: string, message: string}} fallback The run-conclusion diagnosis.
 * @param {object} tracker The loop's mutable state.
 * @param {object} run The concluded run, if any.
 * @returns {object} The verdict.
 */
function failFromAssessment(assessment, fallback, tracker, run) {
  if (assessment.state === EVIDENCE.STALE_HEAD) {
    return verdict({
      exitCode: 1,
      code: GATE_CODES.NO_FRAMES_FOR_THIS_HEAD,
      message: assessment.message,
      tracker,
      run,
    });
  }
  if (assessment.state === EVIDENCE.WRONG_VIEWS) {
    return verdict({
      exitCode: 1,
      code: GATE_CODES.NO_FRAMES_FOR_CHANGED_VIEWS,
      message: assessment.message,
      tracker,
      run,
    });
  }
  return verdict({ exitCode: 1, code: fallback.code, message: fallback.message, tracker, run });
}

/**
 * Decide on a run that has concluded: re-read the LIVE body, never the pre-fetch copy.
 *
 * @param {object} context The normalized gate context.
 * @param {object} tracker The loop's mutable state.
 * @param {object} run The concluded run.
 * @returns {object} The verdict.
 */
function decideFromConcludedRun(context, tracker, run) {
  // SCOPED TO `cancelled`, deliberately. A newer push cancels its predecessor's capture through
  // workflow concurrency, so a cancelled run has no output through no fault of the head it was drawn
  // for. Any other conclusion means the run RAN for this head, and a head that has since moved is
  // then irrelevant: widening this pass to any conclusion would let every pull request whose head
  // moved during the check pass with no evidence at all.
  if (run?.conclusion === 'cancelled') {
    const liveHead = readPullRequestField(context, 'headRefOid').value;
    if (liveHead && liveHead !== context.headSha) {
      return verdict({
        exitCode: 0,
        code: GATE_CODES.SUPERSEDED,
        message: `This head${headSuffix(context)} was superseded by ${liveHead} before its capture finished, so its capture was cancelled. Required checks are evaluated on the latest head, whose own run is the authoritative one — not this gate.`,
        tracker,
        run,
      });
    }
  }

  const liveBody = readPullRequestField(context, 'body');
  if (!liveBody.ok) {
    return verdict({
      exitCode: 1,
      code: GATE_CODES.PULL_REQUEST_READ_FAILED,
      message: bodyUnreadableMessage(context, liveBody.error),
      tracker,
      run,
    });
  }

  const assessment = assessBody(liveBody.value, context);
  if (assessment.state === EVIDENCE.SATISFIED) {
    return verdict({ exitCode: 0, message: assessment.message, tracker, run });
  }
  return failFromAssessment(assessment, diagnoseConclusion(run, context), tracker, run);
}

/**
 * Locate the producer's run, await it, and decide on what it published.
 *
 * @param {object} context The normalized gate context.
 * @param {{state: string, message: string}} preflight The pre-fetch body assessment.
 * @returns {Promise<object>} The verdict.
 */
async function awaitProducerAndDecide(context, preflight) {
  const tracker = {
    polls: 0,
    sleeps: 0,
    gateStart: context.now(),
    anchorMs: null,
    sawQueued: false,
    // Read outcomes of the runs-list call, so `capture-run-not-found` can tell "the list said there
    // is no run" from "the list was never successfully read". Both fail; they point elsewhere.
    listReads: 0,
    listFailures: 0,
  };

  const located = await locateCaptureRun(context, tracker);
  if (!located) {
    return failFromAssessment(
      preflight,
      {
        code: GATE_CODES.CAPTURE_RUN_NOT_FOUND,
        message: runNotFoundMessage(context, tracker),
      },
      tracker,
      null
    );
  }

  const { run, timedOut } = await awaitConclusion(context, tracker, located);
  if (timedOut) {
    return failFromAssessment(
      preflight,
      {
        code: GATE_CODES.CAPTURE_DID_NOT_CONCLUDE,
        message: `The ${context.captureWorkflow} run for ${headPhrase(context)} did not conclude within this gate's bounds (${run?.html_url ?? 'no run URL reported'}, last status ${run?.status ?? 'unknown'}, ${tracker.polls} poll(s)). A gate that passed on a timeout could be waited out, so this fails.`,
      },
      tracker,
      run
    );
  }

  return decideFromConcludedRun(context, tracker, run);
}

/**
 * The `check-screenshots` gate's whole decision, in order.
 *
 * 1. `screenshots-exempt` label present -> pass.
 * 2. Changed-files input empty when required -> fail.
 * 3. Not a UI change -> pass, gate unarmed.
 * 4. FAST PATH: the body as fetched already satisfies the gate for this head -> pass WITHOUT
 *    waiting, calling neither `sleep` nor `runGh`. This is the common case on `edited`,
 *    `ready_for_review` and any re-run, and it is what keeps those runs at today's ~15s.
 * 5. No producer can run for this head (a fork), or awaiting was not requested -> decide now on the
 *    body, exactly as this gate did before.
 * 6. Locate this pull request's producer run for this exact head, polling for the grace window.
 * 7. Await its conclusion, then RE-READ THE LIVE BODY and evaluate that.
 * 8. Emit one diagnostic code naming which problem it is.
 *
 * Steps 1-3 preserve today's OUTCOMES but are RELOCATED here, so they are new code and carry their
 * own tests: deleting step 1 would silently disable the `screenshots-exempt` label and then make an
 * exempted UI pull request wait the full `maxWaitMs` before failing, and this repository has already
 * been bitten by that regression class.
 *
 * @param {object} options The call's collaborators, inputs and bounds.
 * @param {(args: string[]) => {status: number, stdout: string, stderr: string}} options.runGh The
 *   `gh` runner. Injected: this module spawns nothing.
 * @param {(ms: number) => Promise<void>} options.sleep The sleep collaborator.
 * @param {() => number} options.now The clock collaborator. Injected so the timeout is testable
 *   without a 45-minute test or a patched global clock.
 * @param {{isExempt: Function, validateChangedFiles: Function, isArmed: Function, explainMissingEvidence: Function}}
 *   options.evaluate The evaluation bundle — a CYCLE-AVOIDANCE SEAM carrying the real predicates
 *   from `scripts/ui-pr-screenshot-evidence.mjs`, not a test double.
 * @param {string[]} [options.changedFiles] The pull request's changed files.
 * @param {boolean} [options.changedFilesRequired] Whether an empty changed-file set is fatal.
 * @param {Record<string, string>} [options.patches] Unified diffs by path, for case selection.
 * @param {string} [options.body] The body as already fetched, for the fast path.
 * @param {string} [options.headSha] The pull request's head SHA.
 * @param {string|number} [options.prNumber] The pull request number.
 * @param {string} [options.repo] `owner/name`.
 * @param {string} [options.headBranch] The head branch, for run narrowing.
 * @param {string} [options.headRepository] The head repository's full name, for run narrowing.
 * @param {string} [options.captureWorkflow] The producer workflow's file name.
 * @param {boolean} [options.awaitCapture] Whether to await the producer at all.
 * @param {boolean} [options.captureEligible] Whether a producer run can exist for this head.
 * @param {string} [options.exemptLabel] The exemption label.
 * @param {string[]} [options.labels] The pull request's labels.
 * @param {number} [options.captureTimeoutMs] The producer's own job timeout.
 * @param {number} [options.graceMs] How long a run is given to appear.
 * @param {number} [options.slackMs] Tolerance beyond the producer's job timeout.
 * @param {number} [options.maxWaitMs] The gate's wall-clock ceiling.
 * @param {number} [options.maxPolls] The clock-independent iteration cap.
 * @param {number} [options.pollIntervalMs] The gap between polls.
 * @returns {Promise<{exitCode: number, code: string|null, message: string, waited: boolean, polls: number, runUrl: string|null, runConclusion: string|null}>}
 *   The verdict.
 */
export async function decideScreenshotGate(options) {
  const context = normalizeOptions(options);

  if (context.evaluate.isExempt(context.labels, context.exemptLabel)) {
    return verdict({
      exitCode: 0,
      message: `Screenshot check skipped: '${context.exemptLabel}' label present.`,
    });
  }

  const changedFilesFailure = context.evaluate.validateChangedFiles(context.changedFiles, {
    required: context.changedFilesRequired,
  });
  // Deliberately code-less: this relocated guard keeps today's message verbatim, so a contributor
  // reading CI sees the same line it has always emitted.
  if (changedFilesFailure) return verdict({ exitCode: 1, message: changedFilesFailure });

  if (!context.evaluate.isArmed(context.changedFiles)) {
    return verdict({ exitCode: 0, message: 'No UI files changed - screenshot check skipped.' });
  }

  const preflight = assessBody(context.body, context);
  if (preflight.state === EVIDENCE.SATISFIED) {
    return verdict({ exitCode: 0, message: preflight.message });
  }

  if (!context.awaitCapture || !context.captureEligible) {
    return failFromAssessment(
      preflight,
      { code: GATE_CODES.NO_SCREENSHOTS_SECTION, message: preflight.message },
      null,
      null
    );
  }

  return awaitProducerAndDecide(context, preflight);
}
