/**
 * The canvas station the player window mounts with (issue 2277): the Tool a Tool-station region
 * granted, as `SvelteFabricateApp` holds it in `_activeCanvasTool`. The station is the herbalist's
 * alembic, so it supplies the Tool `hb-r-antitoxin` and `hb-task-icecap` name and the lab actor
 * lacks. `named` carries the Tool's label for the chip; `unnamed` carries none, so the chip falls
 * back to its localized label.
 */
export const LAB_CANVAS_STATIONS = Object.freeze({
  named: Object.freeze({
    systemId: 'lab-herbalism',
    toolId: 'hb-tool-alembic',
    componentId: null,
    label: 'Glass Alembic',
  }),
  unnamed: Object.freeze({
    systemId: 'lab-herbalism',
    toolId: 'hb-tool-alembic',
    componentId: null,
    label: '',
  }),
});

/** The station a `canvasStation` query names, as a fresh object, or `null` for none or an unknown name. */
export const labCanvasStation = (name) =>
  Object.hasOwn(LAB_CANVAS_STATIONS, name) ? { ...LAB_CANVAS_STATIONS[name] } : null;
