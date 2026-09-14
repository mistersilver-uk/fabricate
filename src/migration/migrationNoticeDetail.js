/**
 * A migration notice is a concise toast plus a console detail (issue 1737): Foundry's
 * `.notification` has no `max-height`, so the explanation belongs in the console, not the toast.
 */

import { localizeWith } from '../utils/localizeWithFallback.js';

/** The literal every detail line starts with; `tests/release-build.test.js` finds it in the bundle. */
export const MIGRATION_NOTICE_DETAIL_CONSOLE_MESSAGE = 'Fabricate | migration notice detail:';

/** Substitute `{token}` placeholders the way `game.i18n.format` does, for the English fallbacks. */
function fillNoticeTemplate(template, data) {
  return String(template).replaceAll(/\{(\w+)\}/g, (match, token) =>
    data?.[token] == null ? match : String(data[token])
  );
}

/** Localize one clause, falling back to its `{token}` English template filled with `data`. */
export function localizeNoticeClause(localize, key, data, template) {
  return localizeWith(localize, key, data, fillNoticeTemplate(template, data));
}

/**
 * Compose a notice from its findings, in reading order; a finding whose `when` is false says nothing.
 * A finding with a `key` adds a toast clause; its `detailKey` clause (or, without one, the toast
 * clause again) goes to the detail. `detailData` defaults to `data`.
 *
 * @returns {{message: string, detail: string}}
 */
export function composeFindingsNotice(localize, findings, trailingDetail = []) {
  const toast = [];
  const detail = [];
  for (const finding of findings) {
    if (!finding.when) continue;
    const clause =
      finding.key && localizeNoticeClause(localize, finding.key, finding.data, finding.fallback);
    if (clause) toast.push(clause);
    detail.push(
      finding.detailKey
        ? localizeNoticeClause(
            localize,
            finding.detailKey,
            finding.detailData ?? finding.data,
            finding.detailFallback
          )
        : clause
    );
  }
  return finishMigrationNotice(toast, [...detail, ...trailingDetail], localize);
}

/** Join the clauses and append the console pointer once; no detail when it would repeat the toast. */
export function finishMigrationNotice(toastClauses, detailClauses, localize) {
  const toast = toastClauses.filter(Boolean);
  const details = detailClauses.filter(Boolean);
  if (toast.length === 0) return { message: '', detail: '' };
  const message = toast.join(' ');
  if (details.length === 0 || details.join(' ') === message) return { message, detail: '' };
  const pointer = localizeWith(
    localize,
    'FABRICATE.Migration.ConsoleDetails',
    undefined,
    'Details are in the console (F12).'
  );
  return { message: `${message} ${pointer}`, detail: details.join('\n') };
}

/** The inline `src/main.js` notices; each fallback is its `lang/en.json` string verbatim. */
const INLINE_NOTICE_COPY = Object.freeze({
  'FABRICATE.Migration.UnifyRegions.Notice': {
    fallback:
      'Fabricate unified gathering realms for: {systems}. Travel & Realms is now off by default.',
    detailKey: 'FABRICATE.Migration.UnifyRegions.NoticeDetail',
    detailFallback:
      'Fabricate unified gathering realms for: {systems}. Realms are now geography only — Travel & Realms is disabled by default, so enable it per system to use travel. Realm-scoped tasks/events no longer match by realm and may now appear in more environments.',
  },
  'FABRICATE.Migration.EssenceGroups.CollisionNotice': {
    fallback:
      'Fabricate disabled {count} alchemy recipe(s) whose essence requirements now collide. Rework and re-enable them.',
    detailKey: 'FABRICATE.Migration.EssenceGroups.CollisionNoticeDetail',
    detailFallback:
      'Fabricate disabled these alchemy recipe(s) whose essence requirements now collide after essences became first-class ingredients: {recipes}. Rework their ingredients so they no longer overlap, then re-enable them.',
  },
  'FABRICATE.Migration.UnifyModifiers.CollisionNotice': {
    fallback:
      'Fabricate renamed {count} gathering modifier(s) in {systems} with a "-gathering" suffix.',
    detailKey: 'FABRICATE.Migration.UnifyModifiers.CollisionNoticeDetail',
    detailFallback:
      'Fabricate merged each system’s check modifiers and gathering character modifiers into one Modifiers library. {count} gathering modifier(s) in {systems} shared an id with a check modifier and were renamed with a "-gathering" suffix; every reference to them was updated. Review them under System settings › Modifiers.',
  },
  'FABRICATE.Migration.CharacterLibraries.CollisionNotice': {
    fallback:
      'Fabricate merged character prerequisites and modifiers into one world library. {count} conflicting entr(ies) kept one definition.',
    detailKey: 'FABRICATE.Migration.CharacterLibraries.CollisionNoticeDetail',
    detailFallback:
      "Fabricate merged every crafting system's character prerequisites and modifiers into one world library. {count} entr(ies) shared an id across systems but were defined differently, so only one definition survived: {entries}. Every reference still resolves, but it now resolves to the surviving rule — review them under World › Rules & Resources.",
  },
  'FABRICATE.Migration.Deferred.CorpusUnreadable': {
    fallback:
      "Fabricate skipped its data migrations because it could not read this world's recipes. Nothing was changed.",
    detailKey: 'FABRICATE.Migration.Deferred.CorpusUnreadableDetail',
    detailFallback:
      "Fabricate did not run its data migrations, because it could not read this world's recipes. Nothing was changed and nothing was saved. Once the reason logged here is fixed, the migrations will run the next time a GM loads this world.",
  },
  'FABRICATE.Migration.Deferred.WritebackFailed': {
    fallback:
      'Fabricate could not save its data migrations, so nothing was saved. Reload Foundry now, before making changes.',
    detailKey: 'FABRICATE.Migration.Deferred.WritebackFailedDetail',
    detailFallback:
      'Fabricate ran its data migrations but could not save them, so it saved nothing at all and this world is still marked as un-migrated. Reload Foundry now, before you make any further changes: this session is holding a half-migrated copy of your data, and saving from it would record migrated data under an un-migrated world.',
  },
  'FABRICATE.Migration.Aborted.Notice': {
    fallback:
      'Fabricate migration aborted and saved nothing. Reload Foundry; recovery steps are in the console (F12).',
  },
});

/** Compose one inline `src/main.js` notice from its toast key; `data` feeds toast and detail. */
export function composeMigrationNotice(key, data, localize) {
  const copy = INLINE_NOTICE_COPY[key];
  if (!copy) return { message: '', detail: '' };
  return finishMigrationNotice(
    [localizeNoticeClause(localize, key, data, copy.fallback)],
    copy.detailKey
      ? [localizeNoticeClause(localize, copy.detailKey, data, copy.detailFallback)]
      : [],
    localize
  );
}

/** The inline notice copy, exposed read-only for the fallback-agreement test. */
export function inlineMigrationNoticeCopy() {
  return INLINE_NOTICE_COPY;
}

/**
 * Write a notice's detail to the console at `info`, the one write every detail goes through.
 * An OPTIONAL call because `vite.config.js` marks `console.info` pure and the minifier deletes a
 * bare statement (`tests/release-build.test.js` pins the survivor); `info` because `debug` is
 * hidden by Chromium's default filter and the View Lab fails on a `Fabricate |` warning.
 */
export function logMigrationNoticeDetail(label, detail) {
  if (!detail) return;
  console.info?.(MIGRATION_NOTICE_DETAIL_CONSOLE_MESSAGE, `${label}\n${detail}`);
}
