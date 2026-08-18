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
 * How a GM would set one granular entity class back to the arrangement every Fabricate
 * version can read.
 *
 * The vocabulary is the shipped GM vocabulary — the settings row's own NAME and its own
 * combined-option LABEL — so the dialog and the settings row read as ONE instruction rather
 * than two. Written out here rather than derived from the choices maps, because a labeller fed
 * a LAYOUT leaks the raw token: the layout enumeration carries `unsettled`, which no
 * operator-facing choices map has a label for and never will.
 *
 * @type {Readonly<Record<string, {control: string, combined: string, granularState: string}>>}
 */
const GRANULAR_CLASS_CONTROLS = Object.freeze({
  recipes: Object.freeze({
    control: 'Recipe Storage Arrangement',
    combined: 'One combined record',
    granularState: 'stores each recipe in its own record',
  }),
  components: Object.freeze({
    control: 'Component Storage Arrangement',
    combined: 'Nested inside each crafting system',
    granularState: 'stores each crafting component in its own record',
  }),
});

/**
 * The advice SEVERITY one class's layout implies, ordered worst first.
 *
 * @type {readonly string[]}
 */
const SEVERITY_ORDER = Object.freeze(['midConversion', 'unknown', 'granular', 'safe']);

/**
 * @param {*} layout
 * @returns {string} a member of {@link SEVERITY_ORDER}.
 */
function severityOf(layout) {
  if (layout === DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY) return 'safe';
  if (layout === DEFINITION_STORAGE_LAYOUTS.PER_RECORD) return 'granular';
  if (layout === DEFINITION_STORAGE_LAYOUTS.UNSETTLED) return 'midConversion';
  return 'unknown';
}

/**
 * The downgrade advice, selected over the SET of granular Definition Storage Layouts the
 * aborted pass ran against (issues 1242, 1212).
 *
 * Four facts make this a selection over COMPLETE sentences rather than one sentence with a
 * layout interpolated into it, or a concatenation of per-class sentences:
 *
 * 1. **The advice is false on a converted world.** "Downgrade to keep using your existing
 *    data" is true only under the combined arrangement. An older build has no granular
 *    reader, serves the registered empty default, and then writes that empty-derived corpus
 *    back — with no arrangement guard in that build to refuse it. The GM then authors into a
 *    competing corpus that the next upgrade discards. So the downgrade is unsafe there, not
 *    merely unhelpful.
 * 2. **The reverse conversion can only be run on the current build.** After a downgrade there
 *    is no code left to run it with, so the instruction has to come before the downgrade. It
 *    must also instruct a RELOAD: the bridge that turns a layout change into a reconcile is
 *    registered AFTER initialization.
 * 3. **No layout token may be interpolated into a GM-facing string.** Selecting a whole
 *    sentence makes the leak unrepresentable rather than merely detected.
 * 4. **It MUST NOT be a concatenation of per-class sentences** (issue 1212). A GM with recipes
 *    granular and components combined needs ONE instruction, not one plus a no-op — so the
 *    severity of the WORST class picks the sentence shape and only the classes that actually
 *    need setting back are named in it.
 *
 * @param {*} [layouts] A member of `DEFINITION_STORAGE_LAYOUTS` — read as the RECIPE layout,
 *   the shipped single-class call shape — or a `{recipes, components}` map. A class whose
 *   entry is `undefined` was never sampled and contributes nothing.
 * @returns {{promptKey: string, promptFallback: (version: string) => string,
 *   consoleSentence: (version: string) => string}}
 */
export function selectDowngradeAdvice(layouts) {
  const byClass =
    layouts !== null && typeof layouts === 'object' && !Array.isArray(layouts)
      ? layouts
      : { recipes: layouts };
  const classified = Object.entries(GRANULAR_CLASS_CONTROLS)
    .filter(([kind]) => byClass[kind] !== undefined)
    .map(([kind, control]) => ({ kind, control, severity: severityOf(byClass[kind]) }));
  const worst =
    SEVERITY_ORDER.find((severity) => classified.some((entry) => entry.severity === severity)) ??
    'safe';
  const affected = classified.filter((entry) => entry.severity !== 'safe');
  return buildDowngradeAdvice(worst, affected);
}

/**
 * Join the shipped control names of every class the GM has to set back.
 *
 * @param {Array<{control: {control: string, combined: string}}>} affected
 * @returns {string}
 */
function controlInstruction(affected) {
  return affected
    .map(
      (entry) =>
        `Settings → Fabricate → ${entry.control.control}, set it back to "${entry.control.combined}"`
    )
    .join(', and open ');
}

/**
 * @param {Array<{control: {granularState: string}}>} affected
 * @returns {string}
 */
function granularStateSentence(affected) {
  return affected.map((entry) => entry.control.granularState).join(', and ');
}

/**
 * The advice for one severity over the classes that need setting back.
 *
 * @param {string} severity
 * @param {Array<object>} affected
 * @returns {{promptKey: string, promptFallback: (version: string) => string,
 *   consoleSentence: (version: string) => string}}
 */
function buildDowngradeAdvice(severity, affected) {
  if (severity === 'safe' || affected.length === 0) {
    return {
      promptKey: 'FABRICATE.Migration.Recovery.Downgrade',
      promptFallback: (version) =>
        `Recommended: downgrade Fabricate to version ${version} to keep using your existing data without manual remediation.`,
      consoleSentence: (version) =>
        `downgrade Fabricate to version ${version} to continue using your existing data without manual remediation.`,
    };
  }
  const controls = controlInstruction(affected);
  if (severity === 'granular') {
    const state = granularStateSentence(affected);
    const body = (version) =>
      `This world ${state}, and an older Fabricate — including version ${version} — cannot read them and will start writing over them. Open ${controls}, reload Foundry, and let the conversion finish first — it can only be run on this version, because after a downgrade there is no code left to run it with.`;
    return {
      promptKey: 'FABRICATE.Migration.Recovery.DowngradeGranular',
      promptFallback: (version) => `Do not downgrade yet. ${body(version)}`,
      consoleSentence: (version) => `do NOT downgrade yet. ${body(version)}`,
    };
  }
  if (severity === 'midConversion') {
    const body = (version) =>
      `This world's saved data is part-way through a storage change, so it is not all in one place. Open ${controls}, reload Foundry, and let the conversion finish before downgrading to Fabricate version ${version} — it can only be run on this version, because after a downgrade there is no code left to run it with.`;
    return {
      promptKey: 'FABRICATE.Migration.Recovery.DowngradeMidConversion',
      promptFallback: (version) => `Do not downgrade yet. ${body(version)}`,
      consoleSentence: (version) => `do NOT downgrade yet. ${body(version)}`,
    };
  }
  // The safe default for a layout this build could not read at all. It cannot promise the
  // downgrade is safe, because it does not know how the corpus is stored; it names the one
  // thing the GM can check. Actionable rather than alarming, because it is the arm every world
  // with no readable layout takes.
  const body = (version) =>
    `downgrading to Fabricate version ${version}, check ${controls} if it is not already. An older Fabricate cannot read the other arrangement and will start writing over it, and the conversion can only be run on this version, because after a downgrade there is no code left to run it with.`;
  return {
    promptKey: 'FABRICATE.Migration.Recovery.DowngradeCheckArrangement',
    promptFallback: (version) => `Before ${body(version)}`,
    consoleSentence: (version) => `before ${body(version)}`,
  };
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
  {
    downgradeTo = null,
    documents = [],
    label = '',
    storageLayout = null,
    // NO default, deliberately: an omitted key means the caller never SAMPLED the component
    // class, which `selectDowngradeAdvice` treats differently from a sampled-and-unreadable
    // `null`. The first contributes nothing to the advice; the second is a class to warn about.
    componentStorageLayout,
  } = {},
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
    componentStorageLayout,
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
function buildContent({
  t,
  label,
  downgradeTarget,
  failures,
  storageLayout,
  componentStorageLayout,
}) {
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
  const advice = selectDowngradeAdvice({
    recipes: storageLayout,
    components: componentStorageLayout,
  });
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
