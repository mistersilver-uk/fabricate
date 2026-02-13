// Fabricate v2 Macro: Tag Items
// Bulk tag items in your inventory for tag-based recipes

const actor = game.user.character;

if (!actor) {
  ui.notifications.warn('Please select a character first');
} else {
  // Define your tagging rules
  const taggingRules = [
    // Format: { itemName: 'exact name or regex', tags: [...], tier: 'common/uncommon/rare/legendary' }
    { match: 'Iron Ingot', tags: ['metal', 'metal:iron', 'material'], tier: 'common' },
    { match: 'Steel Ingot', tags: ['metal', 'metal:steel', 'material'], tier: 'uncommon' },
    { match: 'Mithril Ingot', tags: ['metal', 'metal:mithril', 'material'], tier: 'rare' },
    { match: /Wood|Lumber/, tags: ['wood', 'material'], tier: 'common' },
    { match: /Healing Herb|Herb/, tags: ['herb', 'herb:healing', 'ingredient'], tier: 'common' },
    { match: /Poison/, tags: ['herb', 'herb:poison', 'ingredient'], tier: 'uncommon' },
    { match: /Forge/, tags: ['tool:forge', 'catalyst'], tier: null },
  ];

  let tagged = 0;

  for (const item of actor.items) {
    for (const rule of taggingRules) {
      let matches = false;

      if (typeof rule.match === 'string') {
        matches = item.name === rule.match;
      } else if (rule.match instanceof RegExp) {
        matches = rule.match.test(item.name);
      }

      if (matches) {
        await item.setFlag('fabricate-v2', 'tags', rule.tags);
        if (rule.tier) {
          await item.setFlag('fabricate-v2', 'tier', rule.tier);
        }
        console.log(`✅ Tagged: ${item.name} → [${rule.tags.join(', ')}] ${rule.tier || ''}`);
        tagged++;
        break; // Only apply first matching rule
      }
    }
  }

  if (tagged > 0) {
    ui.notifications.info(`Tagged ${tagged} items. Check console for details.`);
  } else {
    ui.notifications.warn('No items matched the tagging rules. Update the rules in the macro.');
  }
}
