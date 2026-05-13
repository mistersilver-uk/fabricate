# UI Integration Spec Delta

## Modified Requirements

### Manager V2 Shell

- The selected-system Gathering rail item shows an expand/collapse control instead of an environment count. Activating the parent item opens the Environments browser by default only when the active route is outside Gathering. When a Gathering child page or Gathering edit subroute is already active, activating the parent item must not navigate away from the current Gathering page. The expand/collapse control toggles the submenu only while no Gathering child page is active; while a Gathering child page or Gathering edit subroute is active, the submenu remains expanded and cannot be collapsed. The expanded submenu contains Environments, Tasks, Hazards, and Settings inside a soft grouped container that does not shift the parent Gathering row, icon, label, or expand/collapse control. The Gathering parent row remains visually neutral, and only the selected subsection uses the selected menu-item treatment. Gathering section navigation must not be duplicated as an in-page horizontal tab strip.
