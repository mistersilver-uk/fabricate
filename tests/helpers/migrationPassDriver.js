/**
 * Drive the real startup migration pass (`runMigrations` in `src/bootstrap/migrations.js`) over one
 * runner summary, recording what reached the GM's notifications and the console (issue 1933). The
 * runner is stubbed on its prototype, the one seam the pass constructs rather than receives.
 */
import { runMigrations } from '../../src/bootstrap/migrations.js';
import { MigrationRunner } from '../../src/migration/MigrationRunner.js';
import { MIGRATION_NOTICE_DETAIL_CONSOLE_MESSAGE } from '../../src/migration/migrationNoticeDetail.js';
import { recordNoticeOutput } from './bootContractProbes.js';

/** The role-4 GAMEMASTER the pass runs on: `game.users.activeGM`. */
export const ACTIVE_GM = Object.freeze({ id: 'gm', isGM: true, role: 4, active: true });

/** A connected role-1 player. */
export const PLAYER = Object.freeze({ id: 'player', isGM: false, role: 1, active: true });

/** An actor whose bare run-container read throws: one `skippedErrors` in either remap pass. */
export const brokenActor = () => ({
  id: 'probe-broken',
  items: [],
  getFlag: (scope, key) => {
    if (key === 'gatheringRuns') throw new Error('probe: the document refused the read');
    return null;
  },
});

/** The console line `logMigrationNoticeDetail` writes, the one the release build keeps. */
export const detailLine = (label, detail) => [
  'info',
  MIGRATION_NOTICE_DETAIL_CONSOLE_MESSAGE,
  `${label}\n${detail}`,
];

/** `game.i18n` answers nothing, so every string recorded is the composed English fallback. */
export async function dispatchMigrationSummary(summary, user = ACTIVE_GM) {
  const { run } = MigrationRunner.prototype;
  const { game, ui } = globalThis;
  MigrationRunner.prototype.run = async () => summary;
  globalThis.game = { user, users: { activeGM: ACTIVE_GM }, i18n: {} };
  globalThis.ui = { notifications: {} };
  try {
    const { posted, logged } = await recordNoticeOutput(() =>
      runMigrations({ _promptMigrationRecovery: () => {} })
    );
    return { posted, logged };
  } finally {
    MigrationRunner.prototype.run = run;
    globalThis.game = game;
    globalThis.ui = ui;
  }
}
