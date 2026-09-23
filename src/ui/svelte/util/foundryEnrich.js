// `.implementation` is the system-registered subclass. From 13.340 core's base `enrichHTML`
// self-dispatches to it, so the `?? base` fallback is equivalent THERE and degraded below it —
// harmlessly, because that subclass carries only secrets and visibility behaviour while system and
// module enrichers live on `CONFIG.TextEditor.enrichers`, which the base runs too. Read that
// conditionally, not as unconditional equivalence.
// Always through `globalThis.foundry?.…`: a bare `foundry.` throws a ReferenceError in Node.
function textEditorImplementation() {
  return (
    globalThis.foundry?.applications?.ux?.TextEditor?.implementation ??
    globalThis.foundry?.applications?.ux?.TextEditor ??
    null
  );
}

// Resolve a raw description through Foundry's own enricher and return the enriched HTML: a
// label-less `@UUID[…]` comes back as an anchor carrying the referenced document's real NAME, which
// is the whole point of resolving at write time. Named `enrichToHtml` rather than `enrichText`
// because the caller normalizes with `plainTextDescription`, whose broken-anchor and privacy passes
// need the MARKUP rather than `textContent`.
// Every option below is load-bearing. `secrets: false` is EXPLICIT because PF2e does
// `options.secrets ??= game.user.isGM` and we enrich AS GM but store the result for PLAYERS.
// `rolls: false` because a command-less `[[1d6]]` is evaluated EAGERLY and would freeze as a
// literal in the stored description forever. `embeds: false` because `@Embed[uuid]` inlines a whole
// journal page into a one-line description.
// `processVisibility` is DELIBERATELY ABSENT and re-adding it is pinned as a failing test: `false`
// is wrong in DIRECTION, because PF2e strips `[data-visibility="gm"]` only when the user is NOT a
// GM — so it never closes the leak it appears to, and it re-opens the unconditional
// `[data-visibility="none"]` removal the default performs for free. The flag filters for the user
// DOING the enriching while the result is stored for a broader audience; the leak is closed by an
// audience-independent attribute scrub in `plainTextDescription` instead.
// Falls back to the raw text and never throws, so a headless path loses no text.
export async function enrichToHtml(raw, { relativeTo = null } = {}) {
  const text = typeof raw === 'string' ? raw : '';
  if (!text) return '';
  const impl = textEditorImplementation();
  if (typeof impl?.enrichHTML !== 'function') return text;
  try {
    const enriched = await impl.enrichHTML(text, {
      secrets: false,
      documents: true,
      links: false,
      rolls: false,
      embeds: false,
      custom: true,
      relativeTo,
    });
    return typeof enriched === 'string' ? enriched : text;
  } catch {
    return text;
  }
}

// Deliberately GENEROUS: every candidate goes to the authoritative `foundry.utils.parseUuid`, so
// over-matching costs one cheap parse while under-matching would silently revert priming to one
// round-trip per description with every call-count test still passing. Bounded quantifiers only
// (Sonar S5852), so an unterminated run of `@Word[` stays linear.
const COMPENDIUM_UUID_CANDIDATE =
  /@[A-Za-z]{1,32}\[([^\]]{0,2048})\]|(?<![\w.])(Compendium\.[\w.-]{1,512})/g;

// Foundry documents no cap on `_id__in`, so this is chunked defensively.
const PRIME_CHUNK_SIZE = 250;

// Ids already resident in a pack's document cache are skipped: priming them again is a wasted trip.
function groupUncachedCompendiumIds(rawTexts) {
  const parseUuid = globalThis.foundry?.utils?.parseUuid;
  const byPack = new Map();
  if (typeof parseUuid !== 'function') return byPack;

  for (const raw of rawTexts ?? []) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    for (const match of raw.matchAll(COMPENDIUM_UUID_CANDIDATE)) {
      const candidate = String(match[1] ?? match[2] ?? '')
        .split('#', 1)[0]
        .trim();
      if (!candidate.startsWith('Compendium.')) continue;
      let parsed;
      try {
        parsed = parseUuid(candidate);
      } catch {
        parsed = null;
      }
      const pack = parsed?.collection;
      const id = parsed?.primaryId ?? parsed?.documentId;
      if (!pack || !id || typeof pack.getDocuments !== 'function') continue;
      if (pack.get?.(id)) continue;
      const ids = byPack.get(pack);
      if (ids) {
        if (!ids.includes(id)) ids.push(id);
      } else {
        byPack.set(pack, [id]);
      }
    }
  }

  return byPack;
}

// Core's enricher primes compendiums per `enrichHTML` call, so 400 descriptions cost up to 400
// round-trips. One sweep collapses that to one query per PACK, and the fetched documents are
// retained for the session, which is what makes the later per-description calls cache hits.
export async function primeEnricherCache(rawTexts) {
  const byPack = groupUncachedCompendiumIds(rawTexts);
  const fetches = [];
  for (const [pack, ids] of byPack) {
    for (let offset = 0; offset < ids.length; offset += PRIME_CHUNK_SIZE) {
      const chunk = ids.slice(offset, offset + PRIME_CHUNK_SIZE);
      fetches.push(Promise.resolve(pack.getDocuments({ _id__in: chunk })).catch(() => []));
    }
  }
  await Promise.all(fetches);
}
