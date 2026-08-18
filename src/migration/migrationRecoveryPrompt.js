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

import { DEFINITION_STORAGE_LAYOUTS } from '../config/settings.js';

/**
 * The downgrade advice, selected by the recipe **Definition Storage Layout** the aborted pass
 * ran against (issue 1242).
 *
 * Three facts make this a table of COMPLETE sentences rather than one sentence with the
 * layout interpolated into it:
 *
 * 1. **The advice is false on a converted world.** "Downgrade to keep using your existing
 *    data" is true only under the combined-record arrangement. An older build has no granular
 *    reader, serves the registered empty default, and then writes that empty-derived corpus
 *    back through `game.settings.set` — which finds no legacy document and CREATES one, with
 *    no arrangement guard in that build to refuse it. The GM then authors into a competing
 *    legacy corpus that the next upgrade discards. So the downgrade is unsafe there, not
 *    merely unhelpful.
 * 2. **The reverse conversion can only be run on the current build.** After a downgrade there
 *    is no code left to run it with, so the instruction has to come before the downgrade.
 *    It must also instruct a RELOAD: the bridge that turns a layout change into a reconcile is
 *    registered AFTER initialization, so a GM who flips the arrangement from this dialog gets
 *    no mid-session conversion at all.
 * 3. **No layout token may be interpolated into a GM-facing string.** The layout enumeration
 *    carries `unsettled`, which the operator-facing choices map has no label for and never
 *    will, so any labeller fed a LAYOUT leaks the raw token. Selecting a whole sentence makes
 *    the leak unrepresentable rather than merely detected.
 *
 * The vocabulary is the shipped GM vocabulary: the setting is "Recipe Storage Arrangement"
 * and its combined option is "One combined record", so the dialog and the settings row read
 * as ONE instruction rather than two.
 *
 * @type {Readonly<Record<string, {promptKey: string, promptFallback: (version: string) => string, consoleSentence: (version: string) => string}>>}
 */
const DOWNGRADE_ADVICE_BY_LAYOUT = Object.freeze({
  [DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY]: Object.freeze({
    promptKey: 'FABRICATE.Migration.Recovery.Downgrade',
    promptFallback: (version) =>
      `Recommended: downgrade Fabricate to version ${version} to keep using your existing data without manual remediation.`,
    consoleSentence: (version) =>
      `downgrade Fabricate to version ${version} to continue using your existing data without manual remediation.`,
  }),
  [DEFINITION_STORAGE_LAYOUTS.PER_RECORD]: Object.freeze({
    promptKey: 'FABRICATE.Migration.Recovery.DowngradeGranular',
    promptFallback: (version) =>
      `Do not downgrade yet. This world stores each recipe in its own record, and an older Fabricate — including version ${version} — reads no recipes from it and will start writing over them. Open Settings → Fabricate → Recipe Storage Arrangement, set it back to "One combined record", reload Foundry, and let the conversion finish first — it can only be run on this version, because after a downgrade there is no code left to run it with.`,
    consoleSentence: (version) =>
      `do NOT downgrade yet. This world stores each recipe in its own record, and an older Fabricate — including version ${version} — reads no recipes from it and will start writing over them. Open Settings → Fabricate → Recipe Storage Arrangement, set it back to "One combined record", reload Foundry, and let the conversion finish first — it can only be run on this version, because after a downgrade there is no code left to run it with.`,
  }),
  [DEFINITION_STORAGE_LAYOUTS.UNSETTLED]: Object.freeze({
    promptKey: 'FABRICATE.Migration.Recovery.DowngradeMidConversion',
    promptFallback: (version) =>
      `Do not downgrade yet. This world's recipes are part-way through a storage change, so they are not all in one place. Open Settings → Fabricate → Recipe Storage Arrangement, set it to "One combined record", reload Foundry, and let the conversion finish before downgrading to Fabricate version ${version} — it can only be run on this version, because after a downgrade there is no code left to run it with.`,
    consoleSentence: (version) =>
      `do NOT downgrade yet. This world's recipes are part-way through a storage change, so they are not all in one place. Open Settings → Fabricate → Recipe Storage Arrangement, set it to "One combined record", reload Foundry, and let the conversion finish before downgrading to Fabricate version ${version} — it can only be run on this version, because after a downgrade there is no code left to run it with.`,
  }),
});

/**
 * The safe default for a layout this build could not read at all.
 *
 * It cannot promise the downgrade is safe, because it does not know how the recipes are
 * stored; it names the one thing the GM can check. This is the arm every world with no
 * readable layout takes, so it must be actionable rather than alarming.
 */
const DOWNGRADE_ADVICE_UNKNOWN_LAYOUT = Object.freeze({
  promptKey: 'FABRICATE.Migration.Recovery.DowngradeCheckArrangement',
  promptFallback: (version) =>
    `Before downgrading to Fabricate version ${version}, check Settings → Fabricate → Recipe Storage Arrangement. If it is not "One combined record", set it back, reload Foundry, and let the conversion finish first — an older Fabricate cannot read the other arrangement and will start writing over it, and the conversion can only be run on this version, because after a downgrade there is no code left to run it with.`,
  consoleSentence: (version) =>
    `before downgrading to Fabricate version ${version}, check Settings → Fabricate → Recipe Storage Arrangement. If it is not "One combined record", set it back, reload Foundry, and let the conversion finish first — an older Fabricate cannot read the other arrangement and will start writing over it, and the conversion can only be run on this version, because after a downgrade there is no code left to run it with.`,
});

/**
 * The downgrade advice for one recipe storage layout.
 *
 * A POSITIVE lookup on the three recognised layout values with a safe default, never a
 * truthiness test: a fixture answering `[]` for the layout key is TRUTHY and must still take
 * the default.
 *
 * @param {string|null} [storageLayout] A member of `DEFINITION_STORAGE_LAYOUTS`, or anything
 *   else when the layout could not be read.
 * @returns {{promptKey: string, promptFallback: (version: string) => string, consoleSentence: (version: string) => string}}
 */
export function selectDowngradeAdvice(storageLayout) {
  return Object.hasOwn(DOWNGRADE_ADVICE_BY_LAYOUT, String(storageLayout))
    ? DOWNGRADE_ADVICE_BY_LAYOUT[String(storageLayout)]
    : DOWNGRADE_ADVICE_UNKNOWN_LAYOUT;
}

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
 * @param {string|null} [context.storageLayout] the recipe Definition Storage Layout the
 *   aborted pass ran against, threaded in by the runner rather than read here so the builder
 *   stays pure and so the message describes the pass that just failed rather than a layout a
 *   remote conversion may have moved since (issue 1242)
 * @param {(key: string, data?: object) => string} [localize] i18n seam; receives
 *   a key and optional interpolation data and returns the localized string. When
 *   absent, English fallbacks are used so the helper is usable without Foundry.
 * @returns {MigrationRecoveryPromptConfig} a plain, Foundry-free config object.
 */
export function buildMigrationRecoveryPrompt(
  { downgradeTo = null, documents = [], label = '', storageLayout = null } = {},
  localize
) {
  const t = makeLocalizer(localize);
  const failures = Array.isArray(documents) ? documents : [];
  const downgradeTarget =
    typeof downgradeTo === 'string' && downgradeTo.trim()
      ? downgradeTo.trim()
      : t('FABRICATE.Migration.Recovery.UnknownVersion', {}, 'unknown');

  const content = buildContent({
    t,
    label: String(label ?? ''),
    downgradeTarget,
    failures,
    storageLayout,
  });

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
 * @param {string|null} args.storageLayout
 * @returns {string}
 */
function buildContent({ t, label, downgradeTarget, failures, storageLayout }) {
  // Scoped to THIS PASS, deliberately. "A failed migration leaves your data unchanged" is not
  // true in general: a NON-FATAL migration error is logged and the pass continues, so the next
  // migration's success advances the version past the failed one and the pass writes. What is
  // true here is narrower and still worth saying — the aborted pass returns before the first
  // write, so nothing was persisted.
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

  // One COMPLETE sentence per layout, never one sentence with the layout interpolated into
  // it. See DOWNGRADE_ADVICE_BY_LAYOUT for why the leak is closed structurally.
  const advice = selectDowngradeAdvice(storageLayout);
  const downgrade = `<p>${escapeHtml(
    t(advice.promptKey, { version: downgradeTarget }, advice.promptFallback(downgradeTarget))
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
