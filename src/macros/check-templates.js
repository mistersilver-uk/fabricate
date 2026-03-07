/**
 * Check macro templates for starter content packs.
 * Each template is a string of JS code intended to be pasted into a Foundry macro.
 */

export const dnd5eCheckTemplate = `
// D&D 5e Alchemist's Supplies Crafting Check
// Paste this into a Foundry script macro.
// Rolls an Intelligence check with Alchemist's Supplies proficiency.
// Returns { pass: boolean, total: number, dc: number } for Fabricate.
const actor = token?.actor ?? game.user.character;
if (!actor) { ui.notifications.warn("Select a token or assign a character."); return { pass: false }; }
const dc = args?.dc ?? 12;
const roll = await actor.rollAbilityTest("int", { chatMessage: true });
return { pass: roll.total >= dc, total: roll.total, dc };
`;

export const genericCheckTemplate = `
// System-Agnostic Crafting Check (Fallback)
// Paste this into a Foundry script macro.
// Rolls 1d20 + a configurable modifier against a DC.
// Returns { pass: boolean, total: number, dc: number } for Fabricate.
const actor = token?.actor ?? game.user.character;
if (!actor) { ui.notifications.warn("Select a token or assign a character."); return { pass: false }; }
const dc = args?.dc ?? 12;
const mod = args?.mod ?? 0;
const roll = await new Roll("1d20 + @mod", { mod }).evaluate({ async: true });
roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Crafting Check" });
return { pass: roll.total >= dc, total: roll.total, dc };
`;
