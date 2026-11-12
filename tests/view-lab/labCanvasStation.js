/**
 * The canvas station the player window mounts with (issue 2277): the Tool a Tool-station region
 * granted, as `SvelteFabricateApp` holds it in `_activeCanvasTool`. `named` and `unnamed` are the
 * herbalist's mortar, which supplies the Tool Brenna's known recipe `hb-r-stillroom` needs and she
 * lacks; `named` carries the label for the chip and `unnamed` none, so the chip falls back to its
 * localized label. `alembic` supplies the Tool `hb-task-icecap` names and she lacks.
 */
const MORTAR = Object.freeze({
  systemId: 'lab-herbalism',
  toolId: 'hb-tool-mortar',
  componentId: null,
});
export const LAB_CANVAS_STATIONS = Object.freeze({
  named: Object.freeze({ ...MORTAR, label: 'Mortar & Pestle' }),
  unnamed: Object.freeze({ ...MORTAR, label: '' }),
  alembic: Object.freeze({
    systemId: 'lab-herbalism',
    toolId: 'hb-tool-alembic',
    componentId: null,
    label: 'Glass Alembic',
  }),
});

/** The station a `canvasStation` query names, as a fresh object, or `null` for none or an unknown name. */
export const labCanvasStation = (name) =>
  Object.hasOwn(LAB_CANVAS_STATIONS, name) ? { ...LAB_CANVAS_STATIONS[name] } : null;
