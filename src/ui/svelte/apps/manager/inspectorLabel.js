/** The accessible name of the manager's inspector aside, one per route that draws one. */
export function inspectorLabel({
  currentView,
  displayedGatheringTab,
  isWorldRoute,
  isWorldTravelRoute,
  text,
  worldTravelTab,
}) {
  if (currentView === 'recipe-edit')
    return text('FABRICATE.Admin.Manager.Recipe.RecipeItem', 'Recipe item');
  if (currentView === 'component-edit')
    return text('FABRICATE.Admin.Manager.Component.SourceCard.Title', 'Linked Source Item');
  if (currentView === 'access')
    return text('FABRICATE.Admin.Manager.Access.Inspector', 'Grant access inspector');
  if (currentView === 'books-scrolls')
    return text('FABRICATE.Admin.Manager.BooksScrolls.Inspector', 'Selected recipe item inspector');
  if (currentView === 'recipes')
    return text('FABRICATE.Admin.Manager.Recipe.Inspector', 'Selected recipe inspector');
  if (currentView === 'components')
    return text('FABRICATE.Admin.Manager.Component.Inspector', 'Selected component inspector');
  if (currentView === 'essences' || currentView === 'essence-edit')
    return text('FABRICATE.Admin.Manager.Essence.Inspector', 'Selected essence inspector');
  if (currentView === 'environments' && displayedGatheringTab === 'tasks')
    return text(
      'FABRICATE.Admin.Manager.Environment.Tasks.Inspector',
      'Selected gathering task inspector'
    );
  if (isWorldRoute)
    return text('FABRICATE.Admin.Manager.World.PartiesInspector', 'Selected world party');
  if (isWorldTravelRoute)
    return worldTravelTab === 'map'
      ? text('FABRICATE.Admin.Manager.Travel.MapLinksInspector', 'Selected map region link')
      : text('FABRICATE.Admin.Manager.Travel.RealmsInspector', 'Selected realm');
  if (currentView === 'tools')
    return text('FABRICATE.Admin.Manager.Tools.Inspector', 'Selected tool inspector');
  if (currentView === 'environments')
    return text('FABRICATE.Admin.Manager.Environment.Inspector', 'Selected environment inspector');
  return text('FABRICATE.Admin.Manager.SelectedSystemInspector', 'Selected system inspector');
}
