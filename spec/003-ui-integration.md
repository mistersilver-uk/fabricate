# Specification 003: UI Integration

## Purpose

Define how Fabricate v2 integrates with Foundry VTT's user interface in a system-agnostic way.

## Integration Points

### Items Directory Button

**Location**: Items sidebar header (next to "Create Item")

**Implementation**: Direct DOM injection

**Why DOM Injection?**

- Sidebar directories are rendered before module initialization
- `getHeaderControls` hooks fire too early
- System-agnostic (works with any game system)
- Compatible with both Foundry v12 and v13

### Button Specification

**Visual**

- Class: `create-document` (Foundry's native button class)
- Icon: `fas fa-hammer`
- Label: "Craft Item"
- Style: Matches Foundry's native buttons exactly

**Behavior**

- Click: Opens CraftingApp with smart defaults
- Available to: All users (ANYONE ownership)
- Tooltip: "Craft Item"
- Accessible: `aria-label="Craft Item"`

### Implementation Approach

**Method**: Direct DOM injection into rendered sidebar

**Rationale**:

- Sidebar directories render before module initialization
- Hook-based approaches fire too early in the render cycle
- Works consistently across all game systems
- Compatible with both Foundry v12 and v13

### Injection Timing

**Primary Injection**

- Hook: `ready` (after fabricate.initialize())
- Delay: 100ms to ensure sidebar is rendered
- Reason: Sidebar is already rendered at this point

**Backup Injections**

- Hook: `activateItemDirectory` - When Items tab is activated
- Hook: `activateItemDirectory5e` - D&D 5e specific hook
- Reason: Handles tab switching and re-renders

### Requirements

1. **Button must be visible** on first load
2. **Button must not duplicate** when switching tabs
3. **Button must match Foundry's style** (no custom CSS)
4. **Button must work in all systems** (no system-specific code)
5. **Button must work in v12 and v13**

## Crafting App

### Window Configuration

```javascript
{
  id: 'fabricate-crafting',
  classes: ['fabricate', 'crafting-app'],
  window: {
    title: 'Crafting',
    icon: 'fa-solid fa-hammer',
    resizable: true
  },
  position: {
    width: 700,
    height: 800
  }
}
```

### Actor Selection (In-App)

**Purpose**: Users configure actor roles for crafting directly in the crafting interface - no separate dialog needed.

**Crafting Actor (Result Destination)**

- **Purpose**: Determines where crafted items are added
- **Selection Type**: Single-select dropdown
- **Visibility**: Shows actors the player can observe (OBSERVER permission or higher)
- **Default Behavior**:
  - Preselects user's assigned character if available
  - Falls back to first observable actor
  - Remembers last selection across sessions
- **Visual Indicators**: Star icon next to user's assigned character

**Component Source Actors (Ingredient Sources)**

- **Purpose**: Determines where ingredients are consumed from
- **Selection Type**: Multi-select with checkboxes
- **Visibility**: Shows only actors the player owns
- **Default Behavior**:
  - Preselects crafting actor if player owns it
  - Remembers last selections across sessions
- **Item Counts**: Shows number of items in each actor's inventory
- **Empty State**: Clear message when player has no owned actors

**User Experience Goals**

1. **Flexibility**: Players can craft into any observable actor while pulling components from multiple owned actors
2. **Clarity**: Separate controls make it obvious where results go vs. where ingredients come from
3. **Smart Defaults**: App opens ready to use with sensible preselections
4. **Persistence**: Selections are remembered to reduce repetitive configuration
5. **Feedback**: Visual indicators show which actors have required components

**Actor Filtering Rules**

- **Group actors excluded**: Neither selector shows group-type actors
- **Permission-based**: Crafting actor respects Foundry's observation permissions
- **Ownership-based**: Component sources require full ownership to prevent consuming items without permission

### Recipe Display Features

- **Search and Filtering**: Text search across recipe names and descriptions
- **Category Filtering**: Organize recipes by user-defined categories
- **Availability Indicators**: Visual cues show which recipes can be crafted with current selections
  - Green/checkmark: All requirements met
  - Red/cross: Missing components
  - Gray: Missing catalysts or insufficient essences
- **Real-time Updates**: Recipe availability updates when component source selections change
- **Show Only Available**: Toggle to hide recipes that can't currently be crafted

### Recipe Requirement Checking

**Behavior**: Recipes are validated against aggregated items from all selected component source actors

**Multi-Actor Support**:
- Items from all selected component sources are pooled together
- Ingredient sets are satisfied if any combination of items across all sources meets requirements
- Catalysts can be present in any selected source actor
- Essences accumulate across items from all sources

**Validation States**:
- **Can Craft**: At least one ingredient set is fully satisfied (items + essences + catalysts)
- **Cannot Craft**: No ingredient set can be satisfied with current selections
- **Partial Match**: Some requirements met but not all (shown in requirement details)

### Crafting Execution Flow

**Pre-Execution Validation**:
1. Confirm crafting actor is selected
2. Confirm at least one component source is selected
3. Verify selected recipe has at least one satisfiable ingredient set
4. Show crafting confirmation dialog with:
   - Items to be consumed (from which actors)
   - Items to be created (added to which actor)
   - Which ingredient set will be used (if multiple options)

**Execution Steps**:
1. Consume ingredients from source actors (distributed across whichever actors have them)
2. Apply catalyst degradation if specified
3. Determine results based on recipe configuration:
   - Variable recipes: Use ingredient set's result mapping
   - Non-variable recipes: Create all results
4. Create result items in crafting actor's inventory
5. Transfer effects if configured
6. Apply property formulas to results
7. Show success notification with summary

**Error Handling**:
- Items deleted/moved during crafting: Abort and notify user
- Crafting actor deleted: Abort and notify user
- Permission changes: Abort and notify user

## CSS Architecture

### Principle: Minimal Custom CSS

- Use Foundry's native classes wherever possible
- Only add custom CSS for module-specific components
- Leverage Foundry's CSS variables for theming

### Custom Classes

- `.fabricate.crafting-app` - Main crafting interface
- `.actor-selection-section` - Actor selector controls
- `.recipe-list` - Recipe display components
- `.availability-indicator` - Recipe craftability status

## Accessibility

### Requirements

1. **Keyboard Navigation**: All interactive elements accessible via keyboard
2. **Screen Reader Support**: Proper ARIA labels and roles
3. **Focus Management**: Logical focus order
4. **Tooltips**: Descriptive tooltips for all buttons

### Implementation

- `aria-label` on all buttons
- `data-tooltip` for Foundry's tooltip system
- Semantic HTML structure
- Keyboard event handlers

## Compatibility

### Foundry v12

- Uses legacy Application class hooks where needed
- Fallback for non-ApplicationV2 directories

### Foundry v13

- ApplicationV2 architecture
- HandlebarsApplicationMixin for templates
- Modern hook system

### Game Systems

**Tested**
- D&D 5e v5.2.5

**Expected to Work**
- Pathfinder 2e
- Savage Worlds
- Any system using standard Foundry sidebar

**Known Issues**
- None currently

## Error Handling

### Button Injection Failures

**Impact**: Non-critical - module functionality remains available via API

**Behavior**:
- Log warning to console
- Module initialization continues
- Alternative access via macros/API remains available

### No Available Actors

**Scenario**: Player has no owned actors for component sources

**Behavior**:
- Display clear message in component sources section
- Provide actionable guidance (ask GM for actor ownership)
- Allow viewing recipes but disable crafting action
- Don't block other functionality

### Crafting Validation Failures

**Scenario**: Requirements not met or resources unavailable at craft time

**Behavior**:
- Show specific error message explaining what's missing
- Suggest corrections (e.g., "Select a component source actor")
- Don't consume any resources
- Keep crafting interface open for retry

### Runtime Errors During Crafting

**Scenario**: Items deleted, actors removed, permissions changed during execution

**Behavior**:
- Abort crafting process immediately
- Don't consume ingredients or create partial results
- Show clear error notification
- Log detailed error for debugging
- Allow user to close and retry

## Future Enhancements

- Drag-and-drop ingredient assignment
- Recipe preview tooltips
- Crafting queue system
- Favorites/bookmarks for recipes
- Recipe sharing via compendiums
