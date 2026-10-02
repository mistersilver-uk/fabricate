/**
 * A pure builder for the abort recovery prompt's `DialogV2` config. Spec § Startup Migration Flow
 * step 10 and § Migration Abort Recovery Guidance own the content and the user-initiated retry.
 */

/** Complete sentences, so console and dialog cannot drift or leak an internal token. */
export const DOWNGRADE_ADVICE = Object.freeze({
  promptKey: 'FABRICATE.Migration.Recovery.Downgrade',
  promptFallback: (version) =>
    `Recommended: downgrade Fabricate to version ${version} to keep using your existing data without manual remediation.`,
  consoleSentence: (version) =>
    `downgrade Fabricate to version ${version} to continue using your existing data without manual remediation.`,
});

/** `KEEP` is the default. */
export const MIGRATION_RECOVERY_ACTIONS = Object.freeze({
  KEEP: 'keep',
  FIX_AND_RETRY: 'fixAndRetry',
});

/** Without `localize`, the English fallbacks. */
export function buildMigrationRecoveryPrompt(
  { downgradeTo = null, documents = [], label = '' } = {},
  localize
) {
  const t = makeLocalizer(localize);
  const failures = Array.isArray(documents) ? documents : [];
  const downgradeTarget =
    typeof downgradeTo === 'string' && downgradeTo.trim()
      ? downgradeTo.trim()
      : t('FABRICATE.Migration.Recovery.UnknownVersion', {}, 'unknown');

  const content = buildContent({ t, label: String(label ?? ''), downgradeTarget, failures });

  // Keep is the default and first; fix/retry is informational, with no same-pass retry.
  const buttons = [
    {
      action: MIGRATION_RECOVERY_ACTIONS.KEEP,
      label: t('FABRICATE.Migration.Recovery.KeepButton', {}, 'Keep existing data'),
      default: true,
    },
    {
      action: MIGRATION_RECOVERY_ACTIONS.FIX_AND_RETRY,
      label: t(
        'FABRICATE.Migration.Recovery.FixAndRetryButton',
        {},
        'I will manually fix or delete failed documents, then retry migration'
      ),
      default: false,
    },
  ];

  return {
    title: t('FABRICATE.Migration.Recovery.Title', {}, 'Fabricate migration aborted'),
    content,
    default: MIGRATION_RECOVERY_ACTIONS.KEEP,
    buttons,
  };
}

function buildContent({ t, label, downgradeTarget, failures }) {
  // Scoped to this pass: a non-fatal error lets later migrations advance and write, but an
  // aborted pass returns before the first write.
  const intro = `<p>${escapeHtml(
    t(
      'FABRICATE.Migration.Recovery.Intro',
      {},
      "A Fabricate data migration could not complete. This pass saved nothing: your stored data is exactly as it was before this startup. Reload Foundry to discard this session's partly-migrated copy."
    )
  )}</p>`;

  const abortedDuring = label
    ? `<p>${escapeHtml(
        t('FABRICATE.Migration.Recovery.AbortedDuring', { label }, `Aborted during: ${label}`)
      )}</p>`
    : '';

  const downgrade = `<p>${escapeHtml(
    t(
      DOWNGRADE_ADVICE.promptKey,
      { version: downgradeTarget },
      DOWNGRADE_ADVICE.promptFallback(downgradeTarget)
    )
  )}</p>`;

  let documentsBlock = '';
  if (failures.length > 0) {
    const header = `<p>${escapeHtml(
      t(
        'FABRICATE.Migration.Recovery.DocumentsHeader',
        { count: failures.length },
        `${failures.length} document(s) require manual remediation:`
      )
    )}</p>`;
    const items = failures.map((doc) => buildDocumentLine(t, doc)).join('');
    documentsBlock = `${header}<ul class="fabricate-migration-recovery-documents">${items}</ul>`;
  }

  // Reloading Foundry re-runs the pending migrations because the version was not advanced.
  const retryHint = `<p>${escapeHtml(
    t(
      'FABRICATE.Migration.Recovery.RetryHint',
      {},
      'To retry: fix or delete the documents above, then reload Foundry. The migration runs again automatically because it was not marked complete.'
    )
  )}</p>`;

  return [intro, abortedDuring, downgrade, documentsBlock, retryHint].join('');
}

function buildDocumentLine(t, doc) {
  const type = doc?.type ?? 'unknown';
  const identity = doc?.id ?? doc?.name ?? 'unknown';
  const name = doc?.name ? ` (${doc.name})` : '';
  const error = doc?.error ?? t('FABRICATE.Migration.Recovery.UnknownError', {}, 'unknown error');
  const fix = doc?.fix ?? t('FABRICATE.Migration.Recovery.NoFix', {}, 'no fix action provided');

  const summary = t(
    'FABRICATE.Migration.Recovery.DocumentLine',
    { type, identity, name, error },
    `${type} ${identity}${name}: ${error}`
  );
  const fixLine = t('FABRICATE.Migration.Recovery.DocumentFix', { fix }, `Fix: ${fix}`);

  let line = `<li>${escapeHtml(summary)}<br>${escapeHtml(fixLine)}`;
  if (doc?.macroHint) {
    const macroLine = t(
      'FABRICATE.Migration.Recovery.DocumentMacroHint',
      { macroHint: doc.macroHint },
      `Macro hint: ${doc.macroHint}`
    );
    line += `<br>${escapeHtml(macroLine)}`;
  }
  line += '</li>';
  return line;
}

/** One `(key, data, fallback)` shape over `format` and `localize`. */
function makeLocalizer(localize) {
  if (typeof localize !== 'function') {
    return (_key, _data, fallback = '') => fallback;
  }
  return (key, data, fallback = '') => {
    const result = localize(key, data);
    // A localizer that cannot resolve a key conventionally echoes the key back.
    if (typeof result !== 'string' || result === key || result.length === 0) {
      return fallback;
    }
    return result;
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
