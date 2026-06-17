---
layout: default
title: ItemPilesIntegration
parent: API Reference
nav_order: 6
---

# ItemPilesIntegration

Wraps the Item Piles public API (`game.itempiles.API`) to provide currency affordability checks, currency deduction, merchant stock reading, and container contents reading.
Fabricate uses this service internally during crafting.
You can also call it directly for custom workflows.

**Minimum Item Piles version:** `ITEM_PILES_MINIMUM_VERSION` = `'3.1.0'`

---

## Quick Start

```javascript
Hooks.once('fabricate.ready', () => {
  const integration = game.fabricate.getItemPilesIntegration();

  // Is Item Piles available and above the minimum version?
  console.log(integration.available);         // true or false
  console.log(integration.detectedVersion);   // e.g. '3.2.1' or null
});
```

---

## Retrieving the Service

```javascript
const integration = game.fabricate.getItemPilesIntegration();
```

Returns the singleton `ItemPilesIntegration` instance.
This is always safe to call after the `fabricate.ready` hook fires.
If Item Piles is not installed, `integration.available` will be `false` and all API calls will throw.

---

## Properties

| Property | Type | Description |
|:---------|:-----|:------------|
| `available` | `boolean` | `true` if Item Piles is installed, active, and meets the minimum version. Set by `detect()`. |
| `detectedVersion` | `string \| null` | The detected Item Piles module version, or `null` if not detected. |

---

## Reference

### detect()

Called automatically during Fabricate initialisation.
Reads the Item Piles module version and sets `available` and `detectedVersion`.
You do not need to call this manually.

```javascript
integration.detect();
console.log(integration.available);       // true
console.log(integration.detectedVersion); // '3.2.1'
```

If Item Piles is absent or below the minimum version, `available` is set to `false` and a warning is logged to the console.

---

### isEnabled(system)

Returns `true` when Item Piles is available **and** the crafting system has `features.itemPiles === true`.
Use this to guard any custom integration logic.

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `system` | `object` | Yes | A normalised crafting system object, as returned by `CraftingSystemManager.getSystem()`. |

**Returns:** `boolean`

**Example:**

```javascript
Hooks.once('fabricate.ready', () => {
  const integration = game.fabricate.getItemPilesIntegration();
  const mgr = game.fabricate.getCraftingSystemManager();
  const system = mgr.getSystem('alchemy-system-id');

  if (integration.isEnabled(system)) {
    console.log('Item Piles is active for this system.');
  }
});
```

---

### canAfford(actor, currencies)

Checks whether an actor holds at least the required amounts of each currency, using `game.itempiles.API.getActorCurrencies`.

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `actor` | `Actor` | Yes | The Foundry actor to check. |
| `currencies` | `Array<{abbreviation: string, amount: number}>` | Yes | Array of currency requirements. `abbreviation` must match the Item Piles denomination key (e.g. `'gp'`). |

**Returns:** `Promise<boolean>`.
`true` if all requirements are met, `false` otherwise or on error.

**Throws:** `Error` if Item Piles is not available (`available === false`).

**Example:**

```javascript
Hooks.once('fabricate.ready', async () => {
  const integration = game.fabricate.getItemPilesIntegration();
  const actor = game.actors.getName('Seraphine the Herbalist');

  const affordable = await integration.canAfford(actor, [
    { abbreviation: 'gp', amount: 50 }
  ]);

  console.log(affordable ? 'Can afford it.' : 'Not enough gold.');
});
```

---

### deductCurrency(actor, currencies)

Removes currency from an actor using `game.itempiles.API.removeCurrencies`.
Fabricate calls this automatically after a successful craft when the recipe has a `currencyCost`.
You can also call it directly in custom workflows.

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `actor` | `Actor` | Yes | The Foundry actor to deduct from. |
| `currencies` | `Array<{abbreviation: string, amount: number}>` | Yes | Currency amounts to remove. Only entries with a non-empty abbreviation and a positive amount are sent to Item Piles. |

**Returns:** `Promise<void>`

**Throws:** `Error` if Item Piles is not available (`available === false`).

**Example:**

```javascript
Hooks.once('fabricate.ready', async () => {
  const integration = game.fabricate.getItemPilesIntegration();
  const actor = game.actors.getName('Seraphine the Herbalist');

  await integration.deductCurrency(actor, [
    { abbreviation: 'gp', amount: 50 }
  ]);
});
```

---

### getMerchantItems(merchantActor)

Reads the current stock of a merchant actor via `game.itempiles.API.getMerchantItems`.
Returns an empty array if the call fails or the merchant has no stock.

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `merchantActor` | `Actor` | Yes | An actor configured as a merchant in Item Piles. |

**Returns:** `Promise<Item[]>`.
Array of Foundry `Item` objects from the merchant's stock.

**Throws:** `Error` if Item Piles is not available (`available === false`).

**Example:**

```javascript
Hooks.once('fabricate.ready', async () => {
  const integration = game.fabricate.getItemPilesIntegration();
  const supplier = game.actors.getName('Grimble the Alchemist Supplier');

  const stock = await integration.getMerchantItems(supplier);
  stock.forEach(item => console.log(item.name, item.system.quantity));
});
```

---

### getContainerContents(containerActor)

Reads the contents of a container actor via `game.itempiles.API.getItemPileItems`.
Useful for treating shared storage or crafting-station inventories as ingredient sources.
Returns an empty array if the call fails or the container is empty.

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `containerActor` | `Actor` | Yes | An actor configured as an Item Pile container. |

**Returns:** `Promise<Item[]>`.
Array of Foundry `Item` objects from the container.

**Throws:** `Error` if Item Piles is not available (`available === false`).

**Example:**

```javascript
Hooks.once('fabricate.ready', async () => {
  const integration = game.fabricate.getItemPilesIntegration();
  const chest = game.actors.getName('Party Chest');

  const contents = await integration.getContainerContents(chest);
  console.log(`Party chest holds ${contents.length} item type(s).`);
});
```

---

## Exported Constant

| Constant | Value | Description |
|:---------|:------|:------------|
| `ITEM_PILES_MINIMUM_VERSION` | `'3.1.0'` | Minimum Item Piles version required for the integration. Versions below this are logged as a warning and the integration is disabled. |

---

## See Also

- [CraftingEngine]({% link api/crafting-engine.md %}).
  Where currency checks and deductions are called during the craft flow.
- [CraftingSystemManager]({% link api/system-manager.md %}).
  The `features.itemPiles` feature toggle.
