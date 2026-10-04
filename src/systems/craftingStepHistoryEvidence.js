import { checkResolutionEvidence } from './runHistoryEvidence.js';

/**
 * Allowlist optional historical stage evidence before it enters an actor flag or an execution
 * receipt. Callers own initiating-viewer disclosure; absent evidence stays absent, and a captured
 * empty array stays an explicit zero.
 */
export function craftingStepHistoryEvidence(input = {}, options = {}) {
  const source = input ?? {};
  const evidence = {};
  const resolution = source.resolutionSnapshot;
  if (
    ['check', 'ingredients', 'none'].includes(resolution?.kind) &&
    typeof resolution.mode === 'string'
  ) {
    evidence.resolutionSnapshot = {
      kind: resolution.kind,
      mode: resolution.mode,
      ...checkResolutionEvidence(source, options),
    };
  }
  const presentation = source.presentationSnapshot;
  if (typeof presentation?.name === 'string' && typeof presentation.description === 'string') {
    evidence.presentationSnapshot = {
      name: presentation.name,
      description: presentation.description,
    };
  }
  if (Array.isArray(source.currencySpends) && source.currencySpends.every(validHistoricalSpend)) {
    evidence.currencySpends = source.currencySpends.map(({ unit, amount }) => ({ unit, amount }));
  }
  if (
    Array.isArray(source.essenceSpend?.carriers) &&
    source.essenceSpend.carriers.every(validHistoricalCarrier)
  ) {
    evidence.essenceSpend = {
      labels: Object.fromEntries(
        Object.entries(source.essenceSpend.labels ?? {}).filter(
          ([, label]) => typeof label === 'string'
        )
      ),
      carriers: source.essenceSpend.carriers.map(historicalCarrier),
    };
  }
  return evidence;
}

function validHistoricalCarrier(carrier) {
  return (
    typeof carrier?.itemUuid === 'string' &&
    carrier.itemUuid.length > 0 &&
    Number.isFinite(carrier.quantity) &&
    carrier.quantity > 0 &&
    Array.isArray(carrier.contributions) &&
    carrier.contributions.every(validHistoricalContribution)
  );
}

function validHistoricalSpend(entry) {
  return typeof entry?.unit === 'string' && Number.isFinite(entry.amount) && entry.amount >= 0;
}

function validHistoricalContribution(entry) {
  return typeof entry?.essenceId === 'string' && Number.isFinite(entry.amount) && entry.amount > 0;
}

function historicalCarrier(carrier) {
  return {
    actorUuid: historyText(carrier.actorUuid),
    itemUuid: carrier.itemUuid,
    quantity: carrier.quantity,
    name: historyText(carrier.name),
    img: historyText(carrier.img),
    contributions: carrier.contributions.map(({ essenceId, amount }) => ({ essenceId, amount })),
  };
}

function historyText(value) {
  return typeof value === 'string' ? value.trim() || null : null;
}
