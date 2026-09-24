/**
 * Drive the real startup migration pass (`runMigrations` in `src/bootstrap/migrations.js`) over one
 * runner summary, recording what reached the GM's notifications and the console (issue 1933). The
 * runner is stubbed on its prototype, the one seam the pass constructs rather than receives.
 */
import { runMigrations } from '../../src/bootstrap/migrations.js';
import { MigrationRunner } from '../../src/migration/MigrationRunner.js';
import { MIGRATION_NOTICE_DETAIL_CONSOLE_MESSAGE } from '../../src/migration/migrationNoticeDetail.js';

/** The role-4 GAMEMASTER the pass runs on: `game.users.activeGM`. */
export const ACTIVE_GM = Object.freeze({ id: 'gm', isGM: true, role: 4, active: true });

/** A connected role-3 assistant, who holds `isGM` but is not the active GM. */
export const ASSISTANT = Object.freeze({ id: 'assistant', isGM: true, role: 3, active: true });

/** A connected role-1 player. */
export const PLAYER = Object.freeze({ id: 'player', isGM: false, role: 1, active: true });

/** The console line `logMigrationNoticeDetail` writes, the one the release build keeps. */
export const detailLine = (label, detail) => [
  'info',
  MIGRATION_NOTICE_DETAIL_CONSOLE_MESSAGE,
  `${label}\n${detail}`,
];

const RECORDED_CONSOLE = Object.freeze(['info', 'debug', 'log', 'error']);

/**
 * @returns {Promise<{posted: Array, logged: Array}>} `[level, message, options]` per notification
 * and `[level, ...args]` per console line, `game.i18n` answering nothing so every string is the
 * composed English fallback.
 */
export async function dispatchMigrationSummary(summary, user = ACTIVE_GM) {
  const posted = [];
  const logged = [];
  const { run } = MigrationRunner.prototype;
  const original = Object.fromEntries(RECORDED_CONSOLE.map((level) => [level, console[level]]));
  MigrationRunner.prototype.run = async () => summary;
  for (const level of RECORDED_CONSOLE) {
    console[level] = (...args) => logged.push([level, ...args]);
  }
  globalThis.game = { user, users: { activeGM: ACTIVE_GM }, i18n: {} };
  const post = (level) => (message, options) => posted.push([level, message, options]);
  globalThis.ui = {
    notifications: { info: post('info'), warn: post('warn'), error: post('error') },
  };
  try {
    await runMigrations({ _promptMigrationRecovery: () => {} });
  } finally {
    MigrationRunner.prototype.run = run;
    Object.assign(console, original);
  }
  return { posted, logged };
}
