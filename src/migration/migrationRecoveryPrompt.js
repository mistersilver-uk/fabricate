/**
 * Pure builder for the GM migration-abort recovery prompt.
 *
 * When a startup migration pass aborts (a `FatalMigrationError`), the runner has
 * already rolled the in-memory payload back, persisted nothing, and left
 * `migrationVersion` unchanged. This module turns the abort context
 * (`{ downgradeTo, documents, label }`) into a plain, Foundry-free configuration
 * object describing the GM decision prompt: a window title, content that mirrors
 * the console recovery guidance, and two buttons.
 *
 * The function is intentionally PURE — it never imports or calls Foundry's
 * `DialogV2`. The thin Foundry edge (`src/main.js` `_runMigrations`) feeds this
 * config to `foundry.applications.api.DialogV2`. Keeping the builder pure lets a
 * unit test assert the default choice (spec § "GM prompt defaults") and the
 * surfaced remediation without a Foundry runtime.
 *
 * Retry mechanism (spec § "Migration Abort Recovery Guidance" steps 5-7):
 * retry is EXPLICIT and user-initiated, never automatic within the aborted pass.
 * Because the runner leaves `migrationVersion` unchanged on abort, migrations
 * re-run on the next world reload. The fix/retry choice is therefore purely
 * INFORMATIONAL: it tells the GM to fix or delete the failed documents and then
 * reload Foundry, at which point the pending migrations run again automatically.
 * There is no same-pass auto-retry.
 *
 * See `openspec/specs/destructive-changes-and-migrations/spec.md`
 * (§ "Startup Migration Flow" step 10, § "Migration Abort Recovery Guidance").
 */

/**
 * Stable action keys for the two prompt buttons. `KEEP` is the default choice.
 * @type {{ KEEP: string, FIX_AND_RETRY: string }}
 */
export const MIGRATION_RECOVERY_ACTIONS = Object.freeze({
  KEEP: 'keep',
  FIX_AND_RETRY: 'fixAndRetry',
});

/**
 * @typedef {object} MigrationRecoveryButton
 * @property {string} action stable action key (one of MIGRATION_RECOVERY_ACTIONS)
 * @property {string} label localized button label
 * @property {boolean} default true for the pre-selected button
 */

/**
 * @typedef {object} MigrationRecoveryPromptConfig
 * @property {string} title localized window title
 * @property {string} content HTML content mirroring the console guidance
 * @property {string} default action key of the pre-selected button (always KEEP)
 * @property {MigrationRecoveryButton[]} buttons ordered button descriptors
 */

/**
 * Build the GM migration-abort recovery prompt configuration.
 *
 * @param {object} context abort context passed to the `promptRecovery` seam
 * @param {string|null} [context.downgradeTo] recommended downgrade target version
 * @param {Array<object>} [context.documents] per-document remediation details
 * @param {string} [context.label] label of the aborted migration
 * @param {(key: string, data?: object) => string} [localize] i18n seam; receives
 *   a key and optional interpolation data and returns the localized string. When
 *   absent, English fallbacks are used so the helper is usable without Foundry.
 * @returns {MigrationRecoveryPromptConfig} a plain, Foundry-free config object.
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

  // `Keep existing data` is always the default / pre-selected button and is
  // ordered first (spec § "GM prompt defaults"). The fix/retry button is
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

/**
 * Build the HTML content mirroring the console recovery guidance.
 *
 * @param {object} args
 * @param {(key: string, data?: object, fallback?: string) => string} args.t
 * @param {string} args.label
 * @param {string} args.downgradeTarget
 * @param {Array<object>} args.failures
 * @returns {string}
 */
function buildContent({ t, label, downgradeTarget, failures }) {
  const intro = `<p>${escapeHtml(
    t(
      'FABRICATE.Migration.Recovery.Intro',
      {},
      'A Fabricate data migration could not complete. Your existing data has been kept unchanged.'
    )
  )}</p>`;

  const abortedDuring = label
    ? `<p>${escapeHtml(
        t('FABRICATE.Migration.Recovery.AbortedDuring', { label }, `Aborted during: ${label}`)
      )}</p>`
    : '';

  const downgrade = `<p>${escapeHtml(
    t(
      'FABRICATE.Migration.Recovery.Downgrade',
      { version: downgradeTarget },
      `Recommended: downgrade Fabricate to version ${downgradeTarget} to keep using your existing data without manual remediation.`
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

  // Retry guidance: reloading Foundry re-runs the pending migrations because the
  // version was not advanced. There is no same-pass auto-retry (spec step 7).
  const retryHint = `<p>${escapeHtml(
    t(
      'FABRICATE.Migration.Recovery.RetryHint',
      {},
      'To retry: fix or delete the documents above, then reload Foundry. The migration runs again automatically because it was not marked complete.'
    )
  )}</p>`;

  return [intro, abortedDuring, downgrade, documentsBlock, retryHint].join('');
}

/**
 * Build a single per-document remediation list item.
 *
 * @param {(key: string, data?: object, fallback?: string) => string} t
 * @param {object} doc
 * @returns {string}
 */
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
 * Wrap an optional Foundry-style localizer into a `(key, data, fallback)` helper.
 * Foundry's `game.i18n.format(key, data)` and `game.i18n.localize(key)` are
 * collapsed into one call shape; when no localizer is supplied (e.g. unit tests),
 * the English fallback string is returned.
 *
 * @param {((key: string, data?: object) => string) | undefined} localize
 * @returns {(key: string, data?: object, fallback?: string) => string}
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

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
