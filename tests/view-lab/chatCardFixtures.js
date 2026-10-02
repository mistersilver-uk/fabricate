/**
 * Issue 2153's two chat-card states, each forced by authoring rather than by seed: a gathering
 * event every attempt draws, and a complication whose macro Fabricate refuses to run.
 */
import { LAB_MACRO_UUIDS } from './world/labMacros.js';

/** The `rollPromptState` values this module seeds. */
export const CHAT_CARD_STATES = Object.freeze({
  // Old Karrun Mine's collapse drops on any d100, and Smithing narrates the attempt.
  'gathering-event': { systemId: 'lab-smithing', eventId: 'sm-event-collapse' },
  // Ground Reagent's GM-only complication links the lab's chat macro, which the GM card reports.
  'complication-fault': {
    systemId: 'lab-herbalism',
    componentId: 'hb-mortar-dust',
    complicationId: 'hb-comp-dust-spoiled',
    macroUuid: LAB_MACRO_UUIDS.chatMomentum,
  },
});

export async function seedChatCardState(world, state) {
  const spec = CHAT_CARD_STATES[state];
  if (spec?.eventId) await seedFiringEvent(world, spec);
  if (spec?.complicationId) await seedFaultingComplication(world, spec);
}

async function seedFiringEvent(world, { systemId, eventId }) {
  const manager = world.fabricate.craftingSystemManager;
  const system = manager.getSystem(systemId);
  await manager.updateSystem(systemId, { features: { ...system.features, chatOutput: true } });
  const settings = globalThis.game.settings;
  const config = settings.get('fabricate', 'gatheringConfig');
  const fire = (events) =>
    events.map((event) => (event.id === eventId ? { ...event, dropRate: 100 } : event));
  const slice = config.systems[systemId];
  await settings.set('fabricate', 'gatheringConfig', {
    ...config,
    events: fire(config.events),
    systems: { ...config.systems, [systemId]: { ...slice, events: fire(slice.events) } },
  });
}

async function seedFaultingComplication(
  world,
  { systemId, componentId, complicationId, macroUuid }
) {
  const manager = world.fabricate.craftingSystemManager;
  const system = manager.getSystem(systemId);
  const link = (complication) =>
    complication.id === complicationId ? { ...complication, macroUuid } : complication;
  const components = system.components.map((component) =>
    component.id === componentId
      ? { ...component, complications: component.complications.map(link) }
      : component
  );
  await manager.updateSystem(systemId, { components });
}
