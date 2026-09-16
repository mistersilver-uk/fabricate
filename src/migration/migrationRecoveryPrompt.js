/**
 * PURE builder for the GM migration-abort recovery prompt: the abort context to a Foundry-free
 * config the `src/main.js` edge feeds to `DialogV2`. Keeping it pure is what lets a unit test assert
 * the default choice and the surfaced remediation. Spec § Startup Migration Flow step 10 and
 * § Migration Abort Recovery Guidance own the content and the explicit, user-initiated retry.
 */

/**
 * The recommended downgrade action. A complete sentence in each register rather than a template
 * with a value interpolated in, so the console guidance and the GM dialog cannot drift apart and
 * neither can leak an internal token into a GM-facing string.
 */
export const DOWNGRADE_ADVICE = Object.freeze({
  promptKey: 'FABRICATE.Migration.Recovery.Downgrade',
  promptFallback: (version) =>
    `Recommended: downgrade Fabricate to version ${version} to keep using your existing data without manual remediation.`,
  consoleSentence: (version) =>
    `downgrade Fabricate to version ${version} to continue using your existing data without manual remediation.`,
});

/** Stable action keys for the two prompt buttons. `KEEP` is the default choice. */
export const MIGRATION_RECOVERY_ACTIONS = Object.freeze({
  KEEP: 'keep',
  FIX_AND_RETRY: 'fixAndRetry',
});

/**
 * Build the recovery prompt configuration. `localize` is an i18n seam; without it the English
 * fallbacks are used, so the helper is usable off a Foundry runtime.
 */
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

  // `Keep existing data` is always the default and is ordered first. The fix/retry button is
  // informational: it does NOT trigger a same-pass retry.
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

/** Build the HTML content mirroring the console recovery guidance. */
function buildContent({ t, label, downgradeTarget, failures }) {
  // Scoped to THIS PASS, deliberately. "A failed migration leaves your data unchanged" is not true
  // in general: a NON-FATAL error is logged and the pass continues, so the next migration's success
  // advances the version and writes. What is true here is narrower — the aborted pass returns
  // before the first write.
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

/** Build a single per-document remediation list item. */
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

/**
 * Wrap an optional Foundry-style localizer into a `(key, data, fallback)` helper, collapsing
 * `format` and `localize` into one call shape. Without one, the English fallback is returned.
 */
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
