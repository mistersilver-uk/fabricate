/** The salvage DC shown to players; fixed routing and stages have no single DC. */
export function salvageDisplayDc({ mode, routedType, config, component }) {
  if (mode === 'progressive' || (mode === 'routed' && routedType === 'fixed')) return null;
  const override = component?.salvage?.dcOverride;
  if (Number.isFinite(override)) return Math.trunc(override);
  const dc = Number(config?.dc);
  return Number.isFinite(dc) ? Math.trunc(dc) : 15;
}

/** Display-only need; evaluation continues to use the system's authored check. */
export function salvageCheckNeed({ mode, config, checkUsable, component }) {
  if (!checkUsable) return { kind: 'noCheck' };
  const routedType = mode === 'routed' && config?.type === 'fixed' ? 'fixed' : 'relative';
  const dc = salvageDisplayDc({ mode, routedType, config, component });
  return Number.isFinite(dc) ? { kind: 'dc', dc } : { kind: 'noSingleTarget' };
}
