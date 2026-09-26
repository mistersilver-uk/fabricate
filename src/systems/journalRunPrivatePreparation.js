function safePrepareRecord(record, invalidateLegacy = true) {
  const binding = record?.binding ?? {};
  const safeBinding = Object.fromEntries(
    ['senderId', 'actorUuid', 'runType', 'runId', 'expectedRevision', 'operation']
      .filter((key) => Object.hasOwn(binding, key))
      .map((key) => [key, binding[key]])
  );
  safeBinding.decisionPolicy = {
    allowsSituationalModifier: binding.decisionPolicy?.allowsSituationalModifier === true,
    allowAdvantage: binding.decisionPolicy?.allowAdvantage === true,
  };
  const legacyPrivate = invalidateLegacy && Object.hasOwn(binding, 'privateEvaluation');
  return {
    status: legacyPrivate && record?.status === 'active' ? 'released' : record?.status,
    binding: safeBinding,
    createdAt: record?.createdAt,
    expiresAt: record?.expiresAt,
    issuerGMId: record?.issuerGMId ?? null,
    issuerInstanceId: record?.issuerInstanceId ?? null,
    consumedByRequestId: record?.consumedByRequestId,
    releasedAt: record?.releasedAt,
  };
}

function sameBinding(actual, expected) {
  for (const key of ['senderId', 'actorUuid', 'runType', 'runId', 'expectedRevision']) {
    if (String(actual?.[key] ?? '') !== String(expected?.[key] ?? '')) return false;
  }
  return true;
}

export function safeJournalRunResponse(response) {
  if (!response || typeof response !== 'object') return response;
  const { promptDescriptor, rollHandoff, ...safe } = response;
  return safe;
}

/**
 * The `[parentPath, key]` pair of every caller-private field a RAW persisted state still holds,
 * relative to the state flag, so the adapter can delete what normalization only omits.
 */
export function legacyPrivatePaths(rawState) {
  const pairs = [];
  for (const [token, record] of Object.entries(rawState?.prepareTokens ?? {})) {
    if (Object.hasOwn(record?.binding ?? {}, 'privateEvaluation')) {
      pairs.push([`prepareTokens.${token}.binding`, 'privateEvaluation']);
    }
  }
  for (const [id, record] of Object.entries(rawState?.requests ?? {})) {
    for (const key of ['promptDescriptor', 'rollHandoff']) {
      if (Object.hasOwn(record?.response ?? {}, key)) pairs.push([`requests.${id}.response`, key]);
    }
  }
  return pairs;
}

export function normalizeJournalRunAuthorityState(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    version: 1,
    requests: Object.fromEntries(
      Object.entries(source.requests ?? {}).map(([id, record]) => [
        id,
        { ...record, response: safeJournalRunResponse(record?.response) },
      ])
    ),
    prepareTokens: Object.fromEntries(
      Object.entries(source.prepareTokens ?? {}).map(([token, record]) => [
        token,
        safePrepareRecord(record),
      ])
    ),
    reconciliations: Array.isArray(source.reconciliations) ? [...source.reconciliations] : [],
  };
}

function createPreparedTokenStore({
  now,
  currentUser,
  nextRandomId,
  localInstanceId,
  dropReply,
  pruneReplies,
}) {
  const snapshots = new Map();

  function prune() {
    for (const [token, snapshot] of snapshots) {
      if (snapshot.expiresAt <= now()) snapshots.delete(token);
    }
  }

  function issue(state, request, binding, expiresAt) {
    const token = nextRandomId();
    if (!token) throw new Error('Secure random ID API unavailable');
    const issuerInstanceId = localInstanceId();
    if (!issuerInstanceId) throw new Error('Secure random ID API unavailable');
    const expiry = Number.isFinite(Number(expiresAt)) ? Number(expiresAt) : now() + 60_000;
    snapshots.set(token, {
      binding: structuredClone(binding),
      expiresAt: expiry,
      requestId: request.requestId,
    });
    state.prepareTokens[token] = safePrepareRecord(
      {
        status: 'active',
        binding: { ...binding, senderId: request.senderId },
        createdAt: now(),
        expiresAt: expiry,
        issuerGMId: currentUser?.()?.id,
        issuerInstanceId,
      },
      false
    );
    return token;
  }

  function consume(state, request, token, binding) {
    const record = state.prepareTokens[token];
    const snapshot = snapshots.get(token);
    prune();
    pruneReplies();
    if (
      record?.status !== 'active' ||
      record.expiresAt <= now() ||
      !snapshot ||
      record.issuerGMId !== currentUser?.()?.id ||
      record.issuerInstanceId !== localInstanceId() ||
      !sameBinding(record.binding, { ...binding, senderId: request.senderId })
    ) {
      return null;
    }
    snapshots.delete(token);
    dropReply(snapshot.requestId);
    record.status = 'consumed';
    record.consumedByRequestId = request.requestId;
    return { ...structuredClone(record), binding: structuredClone(snapshot.binding) };
  }

  function release(state, request, token, binding) {
    const record = state.prepareTokens[token];
    if (
      record?.status !== 'active' ||
      record.issuerGMId !== currentUser?.()?.id ||
      record.issuerInstanceId !== localInstanceId() ||
      !sameBinding(record.binding, { ...binding, senderId: request.senderId })
    ) {
      return false;
    }
    const snapshot = snapshots.get(token);
    snapshots.delete(token);
    if (snapshot) dropReply(snapshot.requestId);
    record.status = 'released';
    record.releasedAt = now();
    return true;
  }

  return { prune, issue, consume, release };
}

/** Owns prepared secrets and recipient replies for exactly one authority instance. */
export function createJournalRunPrivatePreparation({ now, currentUser, activeGM, nextRandomId }) {
  const replies = new Map();
  let instanceId = null;
  const localInstanceId = () => (instanceId ??= nextRandomId());
  const tokens = createPreparedTokenStore({
    now,
    currentUser,
    nextRandomId,
    localInstanceId,
    dropReply: (id) => replies.delete(id),
    pruneReplies,
  });

  function pruneReplies() {
    for (const [requestId, reply] of replies) {
      if (reply.expiresAt <= now()) replies.delete(requestId);
    }
  }

  function prune() {
    tokens.prune();
    pruneReplies();
  }

  function belongsHere(request, state) {
    const token = state.prepareTokens[request?.payload?.prepareToken];
    const prior = state.requests[request?.requestId];
    const issuer = token ?? (prior?.response?.checkRequired ? prior : null);
    return !(
      issuer?.issuerGMId === activeGM?.()?.id &&
      issuer?.issuerInstanceId &&
      issuer.issuerInstanceId !== localInstanceId()
    );
  }

  function rememberReply(requestId, response, state) {
    if (!response?.promptDescriptor && !response?.rollHandoff) return;
    replies.set(requestId, {
      response: structuredClone(response),
      expiresAt: state.prepareTokens[response.prepareToken]?.expiresAt ?? now() + 60_000,
    });
  }

  return {
    instanceId: localInstanceId,
    prune,
    belongsHere,
    issue: tokens.issue,
    consume: tokens.consume,
    release: tokens.release,
    rememberReply,
    reply: (requestId) => structuredClone(replies.get(requestId)?.response ?? null),
  };
}
