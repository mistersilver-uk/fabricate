// Fabricate Macro: Get Item UUIDs
// Lists all items in your inventory with their UUIDs

const actor = game.user.character;

if (!actor) {
  ui.notifications.warn('Please select a character first');
} else {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║         Fabricate - INVENTORY ITEM UUIDs           ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`\nCharacter: ${actor.name}\n`);

  if (actor.items.size === 0) {
    console.log('No items in inventory');
  } else {
    actor.items.forEach((item, index) => {
      const qty = item.system.quantity || 1;
      const tags = item.getFlag('fabricate', 'tags') || [];
      const tier = item.getFlag('fabricate', 'tier') || 'none';

      console.log(`${item.name} (x${qty})`);
      console.log(`  UUID: ${item.uuid}`);
      console.log(`  Type: ${item.type}`);
      if (tags.length > 0) {
        console.log(`  Tags: ${tags.join(', ')}`);
      }
      if (tier !== 'none') {
        console.log(`  Tier: ${tier}`);
      }
      console.log('');
    });
  }

  ui.notifications.info(`Listed ${actor.items.size} items (check console F12)`);
}

