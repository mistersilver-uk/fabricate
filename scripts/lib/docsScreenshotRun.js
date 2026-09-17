/** The decisions a documentation screenshot run makes, apart from the run that carries them out. */

/** Why this run's manifest cannot be trusted to describe this run, if it cannot. */
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

/** Split the mapped cases into the frames this run produced and the ones it did not. */
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

/** Why the run cannot compare a frame at all, if it cannot. */
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

/** What a `generate` run may write, given what it managed to produce. */
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
