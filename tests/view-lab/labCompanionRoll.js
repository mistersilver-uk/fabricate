/**
 * A stand-in companion's interactive count roll (issue 2006): a lab-only button outside every
 * Fabricate window that calls the public `rollActorCheck` as a GM action, so the prompt opens on
 * the standalone overlay a companion reaches. The button keeps focus and turns invisible once
 * pressed, so the frame shows the prompt and not the trigger.
 */

/** Frame 35's pool on a companion's own request: four d10s, each 8 or better, two needed. */
const COUNT_REQUEST = Object.freeze({
  actorId: 'lab-actor-brenna',
  callSite: 'gmAction',
  formula: '1d20',
  label: 'Research',
  interactive: true,
  evaluation: {
    product: 'count',
    direction: 'over',
    pool: {
      die: 10,
      base: '4',
      threshold: '8',
      required: 2,
      explode: { enabled: true, faces: { kind: 'best' } },
      cancel: { enabled: true, faces: { kind: 'worst' } },
    },
  },
});

export function installLabCompanionRoll(doc) {
  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.textContent = 'Companion roll';
  trigger.style.cssText = 'position:fixed;left:0;bottom:0;z-index:1';
  // A literal hook, as the case registry's selector guard reads this source for it.
  trigger.setAttribute('data-lab-companion-roll', '');
  trigger.addEventListener('click', () => {
    trigger.style.opacity = '0';
    globalThis.game.fabricate.rollActorCheck(structuredClone(COUNT_REQUEST));
  });
  doc.body.append(trigger);
}
