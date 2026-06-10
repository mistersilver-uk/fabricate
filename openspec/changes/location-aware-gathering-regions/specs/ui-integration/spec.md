# UI Integration Spec Delta

## Added Requirements

### GM Region Management

When a selected crafting system has `features.gathering === true`, the Manager must expose a Region management surface.

Capabilities:

1. List, create, edit, duplicate where supported, delete, enable, and disable Gathering Regions for the selected crafting system.
2. Edit region name, description, image, secret state, biome list, sort/order evidence, and future Scene Region mapping evidence.
3. Show whether a region is used by any environments, party overrides, actor discovery flags, or Scene Region mappings where practical.
4. Confirm deletion when a region is referenced by environments, party overrides, discovery flags, or mappings.
5. Warn about stale Scene or Scene Region mappings without blocking manual region use.
6. Keep region authoring visually and conceptually distinct from environment authoring; regions must not present task, hazard, drop, or composition controls.

### Environment Location Availability Controls

The Environment editor must allow GMs to configure location availability without moving environment-owned task/hazard composition into the Region editor.

Capabilities:

1. Include explicit regions where the environment is available.
2. Include biomes where the environment is available.
3. Exclude explicit regions.
4. Exclude biomes.
5. Explain that explicit exclusions win over inclusions.
6. Preserve existing region/biome metadata as display/matching evidence during compatibility.
7. Show a preview of known destination regions and undiscovered/secret destination counts where safe.

### GM Travel Management

The selected-system Gathering submenu must expose a `Travel` route. `Travel` manages world-level Fabricate parties and selected-system current-region evidence/overrides. It must not be duplicated in a separate detached settings UI.

Capabilities:

1. Create, rename, enable/disable, and delete Fabricate parties.
2. Assign actor members to a party.
3. Assign exactly one travel actor to a party — the actor that represents the party on a campaign map.
4. Prevent assigning a travel actor already used by another enabled Fabricate party.
5. Prevent assigning an actor already used by another enabled Fabricate party.
6. Surface stale member or travel actor references and provide remove/clear actions; repair means removing the stale reference and re-assigning through the normal pickers.
6a. When the world contains no actors, member and travel-actor pickers must show an explicit empty state directing the GM to create an Actor first.
6b. The enable toggle must be disabled (with an "assign a travel actor to enable" hint) while a party has no travel actor, and newly created parties must visibly show their disabled state.
7. Show each party's current-region evidence per selected gathering system.
8. Provide GM controls to set or clear a manual current-region override for the selected party and crafting system.
9. Present a minimum setup checklist: create region, optionally gate environments, create party, assign a travel actor, set current region.
10. Make Scene Region mapping visibly advanced/future automation, not required setup.

### Region Discovery Controls

GM UI must expose region discovery controls.

Capabilities:

1. Show which regions a selected actor has discovered for the selected crafting system.
2. Manually reveal or hide regions for one actor.
3. Reveal a region to all actors in a party.
4. Configure reveal mode: manual only, reveal on party token entry, or always visible.
5. Secret regions must be clearly marked for GMs and represented as undiscovered to players until revealed.
6. Reveal/hide actions must preserve focus or move focus to an adjacent actionable control after mutation.

### Foundry Scene Region Mapping Controls

When Scene Region automation is implemented, GM UI must expose mapping controls that do not require user-authored macros.

Capabilities:

1. Associate a Fabricate `GatheringRegion` with one or more Foundry V13 Scene Region document UUIDs.
2. Show mapped scene and Scene Region identity where resolvable.
3. Warn on stale mappings.
4. Preserve manual current-region override controls even when automation exists.
5. Explain overlapping Scene Regions as merged current regions.

### Player Gathering App Current Region

The player Gathering app must show current location context for the selected actor.

Requirements:

1. Show the selected actor's party when the actor belongs to a Fabricate party.
2. Show current region names when the selected actor is allowed to know them.
3. Show "Undiscovered region" style placeholders for secret current regions that are not discovered by the selected actor.
4. Show the current-region evidence source using the canonical labels `GM override`, `Travel actor`, and `No current region`. While Scene Region automation is unimplemented, the `Travel actor` source is presented as "automation not yet available" rather than hidden.
5. If the actor is not in a party, show a concise no-party location state without blocking non-location-gated environments.
6. Current-region display must fit narrow Foundry ApplicationV2 layouts without overlapping actor/stamina controls.
7. Current-region chips must wrap within the app container and must not force horizontal scrolling.

### Player Environment Availability And Travel Guidance

The player Gathering app must make location-gated availability understandable.

Requirements:

1. Available environments should sort before unavailable location-gated environments.
2. Unavailable environments may remain visible when safe, with clear blocked reasons.
3. Known destination guidance may list region names.
4. Secret or undiscovered destination guidance must use undiscovered placeholders and counts.
5. Guidance must distinguish location blockers from weather, time, tool, stamina, node, scene, permission, duplicate-run, and visibility blockers where practical.
6. Environment cards/details must not leak hidden blind task names, hidden results, hidden hazards, provider diagnostics, GM-only notes, or secret undiscovered region names.
7. Non-GM destination filters may expose known destination names and aggregate buckets such as `Undiscovered regions`; they must not expose secret undiscovered region names or ids.
8. Secret undiscovered region names and ids must not appear in visible text, `title`, `aria-label`, filter labels, or DOM `data-*` attributes.

### Region Modifier Visibility

Player UI must respect the region modifier visibility setting.

Requirements:

1. Modifier visibility defaults to visible.
2. Visible modifiers should show concise source evidence, such as the region name and affected value.
3. GM-only modifiers must not reveal secret region identity or hidden modifier values to non-GM users.
4. Hidden modifier effects should avoid misleading player copy; generic "local conditions may affect this attempt" copy is acceptable when needed.

## Modified Requirements

### Manager Selected-System Gathering Navigation

The selected-system Gathering area adds `Regions` and `Travel` routes when this feature ships. These routes are grouped with Environments, Tasks, Hazards, and Settings, and must follow the existing Manager V2 left-rail pattern instead of adding in-page duplicate navigation.

### Accessibility And Responsive Layout

- Actor, travel actor, region, and Scene Region assignment controls must provide searchable picker flows in addition to any drag/drop affordance.
- Remove, repair, reveal, hide, and override actions must be keyboard reachable.
- Duplicate-travel-actor and duplicate-actor membership errors must be inline, associated with the relevant control, and announced through the same accessible validation pattern used by other Manager forms.
- Region and Travel tables/cards must stack under existing Manager container-width rules.
- Environment availability pickers, current-region chips, and multi-destination guidance must wrap at narrow app widths without clipping text or causing horizontal overflow.
- Player travel guidance should collapse from multi-destination prose into short known/undiscovered chips when space is constrained.

### Gathering App Environment List

The existing region filter applies to environment metadata. When location-aware gathering is enabled, the app should also support filtering by current availability and destination region where disclosure allows. Weather and time of day remain runtime gates and must not become environment browse filters.

## Testing Requirements

- Component tests for Region management list/editor states, secret markers, and stale mapping warnings.
- Component tests for environment location availability controls and exclusion precedence hints.
- Component tests for Travel management, actor picker keyboard flows, travel-actor uniqueness errors, actor membership uniqueness errors, stale reference repair evidence, and current-region override controls.
- Component tests for player current-region display with known, secret undiscovered, no-party, override, and unresolved states.
- Component tests for unavailable travel guidance with known destinations, undiscovered destinations, and mixed blocker reasons.
- Component tests asserting secret undiscovered region names/ids are absent from rendered text, `title`, `aria-label`, filter labels, and DOM `data-*` attributes for non-GM users.
- Keyboard-only component coverage for Region/Travel setup, reveal/hide, repair/remove, and override controls.
- Smoke screenshot evidence for any UI-changing PR that introduces or changes Region, Party, current-region, or travel-guidance surfaces.
- Narrow-window smoke screenshot evidence for Manager Region/Travel surfaces and player current-region/travel-guidance surfaces.
