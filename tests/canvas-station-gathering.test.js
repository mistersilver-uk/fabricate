/**
 * An activated canvas Tool station through the production app, gathering facade, engine and lab
 * Journal authority (issue 2275): a versioned gathering's execute consults the station its own
 * command carries, so a run begun at a station resolves only while a station supplies its Tool.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { withFabricateLifecycleReplay } from './helpers/extension-composition-harness.js';

test('a canvas station reaches versioned gathering execution', async (t) => {
  await withFabricateLifecycleReplay(async ({ world, loadModule }) => {
    const { SvelteFabricateApp: App } = await loadModule('/src/ui/SvelteFabricateApp.svelte.js');
    const f = world.fabricate;
    const game = globalThis.game;
    const config = game.settings.get('fabricate', 'gatheringConfig');
    // The library record and its system slice, so the composed task is the one edited here.
    const icecapRecords = [config.tasks, config.systems['lab-herbalism'].tasks].flatMap((list) =>
      list.filter((task) => task?.id === 'hb-task-icecap')
    );
    assert.ok(icecapRecords.length > 0, 'the lab authors the Tool-gated task');
    for (const task of icecapRecords) {
      assert.deepEqual(task.toolIds, ['hb-tool-alembic']);
      task.dropRows = task.dropRows.map((row) => ({ ...row, dropRate: 100 }));
    }
    const actor = game.actors.get(f.getSelectedGatheringActorId());
    assert.ok(actor, 'the lab selects a gathering actor');
    const station = {
      systemId: 'lab-herbalism',
      toolId: 'hb-tool-alembic',
      componentId: '',
      label: 'Station alembic',
    };
    const frostcaps = () =>
      actor.items
        .filter((item) => item.name === 'Frostcap Mushroom')
        .reduce((sum, item) => sum + Number(item.system?.quantity ?? 0), 0);
    const activeRun = (runId) => f.gatheringRunManager.getActiveRun(actor, runId);

    const sentCommands = [];
    let app = null;
    const service = f.journalRunCommands;
    const execute = service.executeJournalRunCommand;
    service.executeJournalRunCommand = (command, options) => {
      if (command?.runType === 'gathering') {
        sentCommands.push({
          command: structuredClone(command),
          atStation: Boolean(app?._activeCanvasTool),
        });
      }
      return execute.call(service, command, options);
    };

    function gatherer(activeCanvasTool) {
      app = new App({ activeCanvasTool, actorId: actor.id });
      app._services = app._buildServices();
      return app._services;
    }

    const attempt = (services) =>
      services.startGatheringAttempt({ environmentId: 'hb-env-ridge', taskId: 'hb-task-icecap' });

    const resolve = (services, run) =>
      services.executeJournalRunCommand({
        actorUuid: actor.uuid,
        runType: 'gathering',
        runId: run.id,
        expectedRevision: run.runRevision,
        action: 'execute',
        payload: { trigger: 'manual' },
      });

    await t.test('without a station the attempt is refused and gathers nothing', async () => {
      const before = frostcaps();
      const result = await attempt(gatherer(null));
      assert.notEqual(result?.accepted, true, JSON.stringify(result));
      assert.deepEqual(
        result.blockedReasons?.map((reason) => reason.code),
        ['TOOL_BLOCKED']
      );
      assert.equal(frostcaps(), before);
    });

    await t.test('an untimed attempt at a station resolves in the same call', async () => {
      const before = frostcaps();
      const result = await attempt(gatherer(station));
      assert.equal(result?.success, true, JSON.stringify(result));
      assert.equal(frostcaps(), before + 2);
      assert.equal(activeRun(result.runId), null, 'the run finished');
    });

    await t.test('a timed run begun at a station resolves only while one is active', async () => {
      for (const task of icecapRecords) task.timeRequirement = { hours: 1 };
      try {
        const services = gatherer(station);
        const started = await attempt(services);
        assert.equal(started?.accepted, true, JSON.stringify(started));
        assert.ok(activeRun(started.runId), 'the timed start leaves a waiting run');
        game.time.worldTime += 7200;

        const before = frostcaps();
        app._activeCanvasTool = null;
        const refused = await resolve(services, activeRun(started.runId));
        assert.equal(refused?.success, false, JSON.stringify(refused));
        assert.equal(frostcaps(), before, 'a refused execute gathers nothing');
        assert.ok(activeRun(started.runId), 'and leaves the run to resolve later');

        app._activeCanvasTool = station;
        const resolved = await resolve(services, activeRun(started.runId));
        assert.equal(resolved?.success, true, JSON.stringify(resolved));
        assert.equal(frostcaps(), before + 2);
        assert.equal(activeRun(started.runId), null, 'the station resolved the run');
      } finally {
        for (const task of icecapRecords) delete task.timeRequirement;
      }
    });

    await t.test('each gathering execute carries its own station in its payload only', () => {
      const executes = sentCommands.filter(({ command }) => command.action === 'execute');
      assert.deepEqual(
        executes.map(({ atStation }) => atStation),
        [true, false, true],
        'the same-call execute and both Journal resolves were observed'
      );
      for (const { command, atStation } of executes) {
        assert.equal(Object.hasOwn(command.payload, 'presentTools'), atStation);
        assert.equal(Boolean(command.payload.presentTools), atStation);
      }
    });

    await t.test('the Journal row and the execute command agree on Tool readiness', async () => {
      for (const task of icecapRecords) task.timeRequirement = { hours: 1 };
      const alembic = game.actors
        .get('lab-actor-idrin')
        .items.find((item) => item.name === 'Glass Alembic');
      assert.ok(alembic, 'the lab holds a real alembic copy');
      try {
        const services = gatherer(station);
        const startMatured = async () => {
          app._activeCanvasTool = station;
          const started = await attempt(services);
          assert.equal(started?.accepted, true, JSON.stringify(started));
          game.time.worldTime += 7200;
          return started.runId;
        };
        const row = (runId) =>
          services.listJournalForActor({}).activeRuns.find((entry) => entry.id === runId);
        // The row's verdict, then the command's: the two must be the same answer.
        const agree = async (runId, available, label) => {
          const projected = row(runId).actions;
          assert.equal(projected.execute, available, `${label}: projected`);
          assert.equal(projected.disabledReason, available ? null : 'toolRequired', label);
          if (available) return resolve(services, activeRun(runId));
          const refused = await resolve(services, activeRun(runId));
          assert.equal(refused?.success, false, `${label}: ${JSON.stringify(refused)}`);
          assert.match(refused.message, /gathering tools are no longer available/u, label);
          assert.ok(activeRun(runId), `${label}: a refusal leaves the run`);
          return refused;
        };

        const first = await startMatured();
        app._activeCanvasTool = null;
        await agree(first, false, 'no copy and no station');
        actor.items.push(alembic);
        try {
          const held = await agree(first, true, 'a held copy');
          assert.equal(held?.success, true, JSON.stringify(held));
        } finally {
          actor.items.splice(actor.items.indexOf(alembic), 1);
        }

        const second = await startMatured();
        const supplied = row(second).actions;
        assert.equal(supplied.execute, true, "the viewer's station");
        app._activeCanvasTool = null;
        await agree(second, false, 'the station cleared');
        app._activeCanvasTool = station;
        const resolved = await agree(second, true, 'the station again');
        assert.equal(resolved?.success, true, JSON.stringify(resolved));
        assert.equal(activeRun(second), null, 'the station resolved the run');
      } finally {
        for (const task of icecapRecords) delete task.timeRequirement;
      }
    });

    // The run's execution journal holds the Tool evidence its plan and apply agreed on.
    function toolEvidence(runId) {
      const run = f.gatheringRunManager.getRunHistory(actor).find((entry) => entry.id === runId);
      const tools = run.executionJournal.effects.find((effect) => effect.effectId === 'tools');
      assert.deepEqual(tools.receipt, tools.planned, 'the apply records what the plan planned');
      return tools.receipt.map((entry) => [entry.toolId, entry.virtual === true, entry.broken]);
    }

    await t.test(
      'check-driven breakage records a station Tool as virtual, an owned one first',
      async () => {
        const system = f.craftingSystemManager.getSystem('lab-herbalism');
        const authority = system.toolBreakage;
        const alembic = game.actors
          .get('lab-actor-idrin')
          .items.find((item) => item.name === 'Glass Alembic');
        assert.ok(alembic, 'the lab holds a real alembic copy');
        system.toolBreakage = { authority: 'checkDriven' };
        try {
          const atStation = await attempt(gatherer(station));
          assert.equal(atStation?.success, true, JSON.stringify(atStation));
          assert.deepEqual(toolEvidence(atStation.runId), [['hb-tool-alembic', true, false]]);

          actor.items.push(alembic);
          const owned = await attempt(gatherer(station));
          assert.equal(owned?.success, true, JSON.stringify(owned));
          assert.deepEqual(toolEvidence(owned.runId), [['hb-tool-alembic', false, false]]);
        } finally {
          system.toolBreakage = authority;
          const index = actor.items.indexOf(alembic);
          if (index !== -1) actor.items.splice(index, 1);
        }
      }
    );

    await t.test('the station is never written to a run record or the authority ledger', () => {
      assert.ok(f.gatheringRunManager.getRunHistory(actor).length > 0, 'the scan reads the runs');
      assert.equal(JSON.stringify(actor.flags).includes('presentTools'), false);
      const ledgers = game.journal.contents.filter(
        (entry) => entry.flags?.fabricate?.journalRunAuthorityLedger
      );
      assert.equal(ledgers.length, 1);
      assert.equal(JSON.stringify(ledgers[0]).includes('presentTools'), false);
    });
  });
});
