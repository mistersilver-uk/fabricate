/**
 * The `check-screenshots` gate's composed decision: await the automated producer for this head,
 * then decide whether what it published is evidence for this head and these views.
 */

import { mapChangedFilesToCases } from './viewLabCases.js';

/**
 * Bound defaults, exported so `tests/ci-workflow-semantics.test.js` can read them rather than
 * restate them, and so `main()`'s adapter passes no bound literal of its own.
 */

/** How long a producer run for this head is given to APPEAR before the gate gives up on it. */
export const GRACE_MS = 3 * 60_000;

/** Tolerance added to the producer's own job timeout, for its publish step and API latency. */
export const SLACK_MS = 5 * 60_000;

/** The whole gate's wall-clock ceiling, whatever the producer's own deadline works out to. */
export const MAX_WAIT_MS = 100 * 60_000;

/** The gap between polls of the runs list. */
export const POLL_INTERVAL_MS = 20_000;

/**
 * The clock-independent iteration cap: a bound on iterations, so a frozen or backwards clock cannot
 * spin this loop forever.
 */
export const MAX_POLLS = 360;

/**
 * The producer's own job timeout, as a default. `--capture-timeout-minutes` pins this to
 * `capture`'s real `timeout-minutes` in `pr-screenshots.yml`, and Task 6 asserts the two agree.
 */
export const CAPTURE_TIMEOUT_MS = 75 * 60_000;

/** The default workflow file the gate waits on. */
export const DEFAULT_CAPTURE_WORKFLOW = 'pr-screenshots.yml';

/**
 * The diagnostic codes. Each failure emits `::error::<code>: <prose>` so a test asserts on the code
 * rather than on wording, and — more importantly — so a reader is pointed at the right thing to
 * fix.
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

/** The image patterns are deliberately split into "find the whole span" and "narrow it in code". */

/** The whole `![alt](target)` target, title and all. */
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\(([^)]*)\)/g;

/** A whole `<img …>` tag's attribute text, up to the closing `>` or the end of the input. */
const HTML_IMAGE_TAG_PATTERN = /<img\b([^>]*)/gi;

const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*$/;
const NEXT_HEADING_PATTERN = /^(#{1,6})\s/;

// Pure parsing: what the body carries, and which frame each published URL is.

/** The managed block's text, or `''` when the body carries no complete block. */
function managedBlockText(text) {
  const start = text.indexOf(SCREENSHOTS_BLOCK_START);
  if (start === -1) return '';
  const end = text.indexOf(SCREENSHOTS_BLOCK_END, start);
  if (end === -1) return '';
  return text.slice(start, end + SCREENSHOTS_BLOCK_END.length);
}

/** The body with the managed block blanked out, line count preserved. */
function maskManagedBlock(text) {
  const block = managedBlockText(text);
  if (!block) return text;
  return text.replaceAll(block, block.replaceAll(/[^\n]/g, ' '));
}

/**
 * The body of the Markdown section a heading opens, running to the next heading of the same or a
 * higher level.
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

/** Every "Screenshots" section of a body. */
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

/** The URL half of a Markdown image target, dropping the optional `"title"` that may follow it. */
function markdownImageUrl(target) {
  return target.trimStart().split(/\s/, 1)[0];
}

/** The `src` a `<img …>` tag's attribute text carries, or `''` when it carries none. */
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
 */
function imageUrlsIn(text) {
  const source = String(text || '');
  return [
    ...Array.from(source.matchAll(MARKDOWN_IMAGE_PATTERN), (match) => markdownImageUrl(match[1])),
    ...Array.from(source.matchAll(HTML_IMAGE_TAG_PATTERN), (match) => htmlImageSrc(match[1])),
  ].filter(Boolean);
}

/** Drop a filename's extension. */
function withoutExtension(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * The View Lab case and head SHA a published frame's URL identifies, or `null` when the URL is not
 * one of this pull request's published frames.
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

// Run selection: `head_sha` identifies a commit, not a run.

/** Whether a workflow run belongs to this pull request. */
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

/** A run's creation time in milliseconds, or 0 when it carries none. */
function createdAtMs(run) {
  const parsed = Date.parse(run?.created_at ?? '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** The producer run this gate should await, from every run reported for this head. */
export function selectCaptureRun(runs = [], scope = {}) {
  const mine = runs.filter((run) => runBelongsToPullRequest(run, scope));
  if (mine.length === 0) return null;
  const pending = mine.filter((run) => run.status !== 'completed');
  const candidates = pending.length > 0 ? pending : mine;
  // Seeded with `null`, not left seedless.
  return candidates.reduce(
    (best, run) => (best === null || createdAtMs(run) >= createdAtMs(best) ? run : best),
    null
  );
}

// Body assessment.

/**
 * The identified frames this gate is entitled to treat as drawn for the pull request's current
 * head.
 */
function framesForThisHead(identified, context) {
  if (!context.headSha) return identified;
  return identified.filter((frame) => frame.headSha === null || frame.headSha === context.headSha);
}

/**
 * Whether the automatically published frames in the block are evidence for this head and these
 * views.
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
  // Defensive, and pinned unreachable by the property test in
  // `tests/screenshot-evidence-matching.test.js`: `mapChangedFilesToCases` filters to `publish:
  // true` cases and so can return `[]` in principle, but cannot while this gate is armed, because
  // selection falls back to a publishable default case.
  if (expected.size === 0)
    return { state: EVIDENCE.SATISFIED, message: matchedMessage(forThisHead) };

  const matched = forThisHead.filter((frame) => expected.has(frame.caseId));
  if (matched.length === 0) {
    return { state: EVIDENCE.WRONG_VIEWS, message: wrongViewsMessage(forThisHead, expected) };
  }
  return { state: EVIDENCE.SATISFIED, message: matchedMessage(matched) };
}

/** What the pull request body says about screenshot evidence. */
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

// Messages.

/**
 * @param {{caseId: string}[]} frames Matched frames.
 * @returns {string} The pass message.
 */
function matchedMessage(frames) {
  const ids = frames.map((frame) => frame.caseId).join(', ');
  return `UI smoke screenshot evidence found for this head: ${ids}.`;
}

/** The head SHA as a noun phrase, never an empty interpolation. */
function headPhrase(context) {
  return context.headSha || "this pull request's head";
}

/** The head SHA as a trailing qualifier, or nothing at all when the gate was given none. */
function headSuffix(context) {
  return context.headSha ? ` ${context.headSha}` : '';
}

/** The diagnostic for a body whose Screenshots section produced no identifiable published frame. */
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

/** The `capture-published-nothing` diagnostic. */
function publishedNothingMessage(run, context) {
  return `${runSummary(run, context)} It published no screenshot block for this head. Four causes conclude that way, none of them a fault in this pull request: the S3 upload role could not be assumed (an IAM trust-policy gap); Foundry credentials were unavailable, so capture was skipped; the changed files selected no View Lab case; or the producer's own UI predicate did not arm while this gate did (the two are hand-maintained mirrors of one rule and can drift). Paste evidence into the body, or ask a maintainer for the '${context.exemptLabel}' label.`;
}

/** The `capture-run-not-found` diagnostic. */
function runNotFoundMessage(context, tracker) {
  const grace = `${Math.round(context.graceMs / 1000)}s`;
  if (tracker.listReads === 0) {
    return `The ${context.captureWorkflow} runs for ${headPhrase(context)} could not be read within ${grace}: all ${tracker.listFailures} attempt(s) to list them failed, so this gate never saw the run list. A GitHub API outage or a rate limit answers exactly as an absent producer does, so this is NOT evidence that ${context.captureWorkflow} failed to dispatch, and it is not missing author evidence either. Re-run this check; if it keeps failing, the run-list call is what to investigate, not this pull request.`;
  }
  return `No ${context.captureWorkflow} run for ${headPhrase(context)} appeared within ${grace}. A producer WAS expected for this head, so this is not missing author evidence — check whether ${context.captureWorkflow} is dispatching for this pull request at all.`;
}

/** The `pull-request-read-failed` diagnostic. */
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

// Collaborator calls.

/** Every producer run GitHub reports for this head, or `[]` when the call fails. */
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

/** Read a `gh pr view --json <field>` scalar. */
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

// The composed decision.

/** Build the verdict the adapter applies. */
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

/** Normalize the call's inputs, applying the exported bound defaults. */
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

/** Sleep one poll interval, recording it. */
async function sleepOnce(context, tracker) {
  tracker.sleeps += 1;
  await context.sleep(context.pollIntervalMs);
}

/** Record the deadline anchor at the first NON-`queued` observation. */
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

/** The earlier of the producer's anchored deadline and this gate's own wall-clock ceiling. */
function effectiveDeadline(context, tracker) {
  const ceiling = tracker.gateStart + context.maxWaitMs;
  if (tracker.anchorMs === null) return ceiling;
  return Math.min(tracker.anchorMs + context.captureTimeoutMs + context.slackMs, ceiling);
}

/** Poll until a producer run for this head appears, for the grace window. */
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
 * Poll until the located run reaches a conclusion, the deadline passes, or the iteration cap is
 * hit.
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
    // Re-read the run we are awaiting, by id — not a fresh selection.
    const runs = listCaptureRuns(context, tracker);
    run = runs.find((candidate) => candidate?.id === initial?.id) ?? run;
  }
}

/** The code that names why the body carries no evidence, given the producer run's conclusion. */
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

/** Decide on a run that has concluded: re-read the live body, never the pre-fetch copy. */
function decideFromConcludedRun(context, tracker, run) {
  // Scoped to `cancelled`, deliberately. A newer push cancels its predecessor's capture through
  // workflow concurrency, so a cancelled run has no output through no fault of the head it was
  // drawn for.
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

/** Locate the producer's run, await it, and decide on what it published. */
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

/** The `check-screenshots` gate's whole decision, in order. */
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
