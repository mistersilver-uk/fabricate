/**
 * The decisions a documentation screenshot run makes, apart from the run that carries them out.
 *
 * `scripts/docs-screenshots.mjs` is a CLI: it dispatches from `process.argv` at module scope, so it
 * cannot be imported without running a capture, and therefore nothing inside it can be reached from
 * a test. That mattered, because the load-bearing parts of it are refusals — the reasons a frame is
 * NOT published — and a refusal is invisible when it works. Every one of them could be deleted with
 * the suite still green, which is the same thing as not having them.
 *
 * So the judgements live here and the `.mjs` is the shell that performs their consequences. Nothing
 * in this module reads the filesystem, spawns anything, or prints: it takes what a run observed and
 * returns what the run should do about it. `scripts/lib/webpFrames.js` is the same arrangement for
 * the pixel comparison, for the same reason.
 *
 * WHY THESE FOUR AND NOT MORE
 * ---------------------------
 * Each one answers a question whose wrong answer publishes a picture that is not of this commit:
 * whether the renderer actually ran, which of its frames belong to this run, whether the tools that
 * decide "changed" are even present, and whether a partial run may certify the whole set. The
 * rendering, encoding and file copying around them are IO with no decision in them, and stay in the
 * CLI where they can be read as a sequence.
 */

/**
 * Why this run's manifest cannot be trusted to describe this run, if it cannot.
 *
 * The renderer writes `manifest.json` as the LAST thing it does, and it accumulates into an output
 * directory it never clears. So a throw before its render loop — a squatted lab port, no browser
 * installed, a viewport assertion — exits without writing a manifest at all, and leaves whatever an
 * earlier run wrote sitting there to be picked up as this run's own account of itself. Every
 * downstream refusal then agrees with it, including the per-frame head check, because both sides of
 * that comparison come out of the same stale file and agree by construction. The observable result
 * is a `check` that prints "all 46 committed frame(s) match a fresh render" having rendered
 * nothing.
 *
 * The modification time is what closes it, rather than the recorded head. A manifest from an
 * earlier run AT THIS COMMIT carries this commit's head and is indistinguishable by content; it is
 * distinguishable only by the fact that this run did not write it. The renderer's own exit status
 * cannot close it either: a run with per-case failures legitimately exits non-zero having written a
 * perfectly good manifest, and that case is what {@link consumableFrames} is for.
 *
 * @param {string} outputDirectory Where the manifest was expected, for the message.
 * @param {number|undefined} before The manifest's modification time before the renderer ran, in
 *   milliseconds, or undefined when there was no manifest.
 * @param {number|undefined} after The same, after it ran.
 * @returns {string|null} Why nothing may be published, or null when the manifest is this run's.
 */
export function staleManifestReason(outputDirectory, before, after) {
  if (after === undefined) {
    return (
      `the renderer wrote no manifest to ${outputDirectory}, so nothing this run produced can be` +
      ' identified. Nothing was written.'
    );
  }
  if (before !== undefined && after <= before) {
    return (
      `the manifest in ${outputDirectory} was not rewritten by this run, so the renderer failed` +
      ' before it produced anything and what is on disk belongs to an earlier run. Publishing that' +
      " would ship an earlier run's pictures as this commit's documentation. Scroll up for what" +
      ' the renderer reported. Nothing was written.'
    );
  }
  return null;
}

/**
 * Split the mapped cases into the frames this run produced and the ones it did not.
 *
 * Four separate ways a case fails to be publishable, kept apart because they need different things
 * done about them and a reader of the report has to be able to tell which happened. The head
 * comparison is the subtle one: without it a case that failed today would be served from whatever
 * the renderer left on disk at some earlier commit and published as current documentation, with
 * nothing to show it was stale.
 *
 * @param {object} manifest The manifest this run wrote.
 * @param {string[]} caseIds Case ids the map declares.
 * @param {(caseId: string) => string|null} locateRenderedFrame The source frame this run left on
 *   disk for a case, or null when there is none there.
 * @returns {{usable: Map<string, string>, refused: string[]}} Usable case ids to source frame
 *   paths, and a line per refused case saying why.
 */
export function consumableFrames(manifest, caseIds, locateRenderedFrame) {
  if (!manifest.head) {
    throw new Error(
      'the renderer could not record the commit each frame was rendered at, so a frame left over' +
        ' from an earlier run cannot be told from one this run produced. Nothing was written.'
    );
  }

  const rendered = new Map((manifest.frames ?? []).map((frame) => [frame.id, frame]));
  const failed = new Set((manifest.failures ?? []).map((failure) => failure.id));
  const usable = new Map();
  const refused = [];

  for (const caseId of caseIds) {
    const frame = rendered.get(caseId);
    if (failed.has(caseId)) {
      refused.push(`${caseId}: the renderer reported a failure for it`);
      continue;
    }
    if (!frame) {
      refused.push(`${caseId}: this run rendered no frame for it`);
      continue;
    }
    if (frame.head !== manifest.head) {
      refused.push(`${caseId}: its frame is left over from ${frame.head}, not this run`);
      continue;
    }
    const source = locateRenderedFrame(caseId);
    if (source) usable.set(caseId, source);
    else refused.push(`${caseId}: the manifest lists it but its frame is not on disk`);
  }

  return { usable, refused };
}

/**
 * Why the run cannot compare a frame at all, if it cannot.
 *
 * Both libwebp tools are required, and the decoder is required even by a run that ends up encoding
 * nothing: it is what turns "these two WebPs differ" into "this view changed". Without it the only
 * comparison available is byte equality, which this renderer's own jitter fails on roughly a tenth
 * of the set — so a run that quietly fell back to it would rewrite those frames and report them as
 * visual changes. This fails closed instead.
 *
 * @param {Array<[string, string|null]>} tools Each tool's name and its resolved path, or null.
 * @returns {string|null} Why nothing may be compared, or null when both are present.
 */
export function missingImageToolReason(tools) {
  const missing = tools.filter(([, path]) => !path).map(([name]) => name);
  if (missing.length === 0) return null;
  return (
    `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not on PATH, so a` +
    ' documentation frame can neither be encoded nor compared against the committed one.' +
    ' Install libwebp (winget install Google.Libwebp, brew install webp, or apt install webp)' +
    ' and try again. Nothing was written.'
  );
}

/**
 * What a `generate` run may write, given what it managed to produce.
 *
 * The provenance header is the part that has to be decided rather than assumed. It records the
 * toolchain the committed set was produced by — the Foundry chrome, the Chromium build — and a
 * reader takes it to describe every frame beside it. A run that rewrote forty frames and refused
 * six would, if it stamped anyway, certify six frames it never rendered as the work of this
 * toolchain, and the drift report that exists to catch exactly that would go quiet about them
 * forever. So the stamp waits until a run has actually seen the whole set.
 *
 * @param {object[]} verdicts One verdict per frame this run produced.
 * @param {string[]} refused A line per case it did not produce.
 * @returns {{rewrite: object[], untouched: number, stampProvenance: boolean,
 *   provenanceNote: string|null, exitCode: number}} What the run may do.
 */
export function publicationPlan(verdicts, refused) {
  const complete = refused.length === 0;
  return {
    rewrite: verdicts.filter((verdict) => verdict.state !== 'unchanged'),
    untouched: verdicts.filter((verdict) => verdict.state === 'unchanged').length,
    stampProvenance: complete,
    provenanceNote: complete
      ? null
      : `the recorded provenance is left alone: ${refused.length} case(s) were not produced by` +
        ' this run, so this toolchain has not rendered the whole set and cannot be recorded as' +
        ' having produced it',
    exitCode: complete ? 0 : 1,
  };
}
