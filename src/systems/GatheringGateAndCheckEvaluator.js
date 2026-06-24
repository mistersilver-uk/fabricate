/**
 * Evaluates gathering visibility gates and tool requirements.
 *
 * System-native expression parsing is injected so this seam can stay
 * independent from Foundry globals. Gates and tool requirements are
 * formula-only: each carries a dice/roll `formula` (gates also carry a
 * `threshold`) and there is no provider discriminator. The gathering check
 * itself is now resolved at the system level by the engine, not here.
 */
export class GatheringGateAndCheckEvaluator {
  constructor({ evaluateExpression = null } = {}) {
    this.evaluateExpression = evaluateExpression;
  }

  async evaluateVisibility({
    gate = null,
    actor = null,
    viewer = null,
    environment = null,
    task = null,
  } = {}) {
    if (!gate) {
      return visibilityResult({
        visible: true,
        reasonCode: 'NO_VISIBILITY_GATE',
      });
    }

    if (!gate?.formula || !gate?.threshold) {
      return visibilityDiagnostic(
        'Visibility gate requires formula and threshold',
        'MISCONFIGURED_PROVIDER'
      );
    }
    if (typeof this.evaluateExpression !== 'function') {
      return visibilityDiagnostic(
        'Expression evaluation dependency is not configured',
        'MISCONFIGURED_PROVIDER'
      );
    }

    try {
      const context = { actor, viewer, environment, task };
      const value = await this._resolveExpression(gate.formula, {
        ...context,
        kind: 'visibilityFormula',
      });
      const threshold = await this._resolveExpression(gate.threshold, {
        ...context,
        kind: 'visibilityThreshold',
        formulaValue: value,
      });
      const comparison = compareVisibility(value, threshold);
      if (!comparison.valid) {
        return visibilityDiagnostic(comparison.message, 'MALFORMED_RESULT');
      }

      return visibilityResult({
        visible: comparison.visible,
        reasonCode: comparison.visible ? 'VISIBLE' : 'HIDDEN',
      });
    } catch (error) {
      return visibilityDiagnostic(errorMessage(error, 'Visibility gate failed'), 'PROVIDER_ERROR');
    }
  }

  async evaluateRequirement({
    requirement = null,
    actor = null,
    environment = null,
    task = null,
  } = {}) {
    if (!requirement) {
      return requirementResult({ allowed: true, reasonCode: 'NO_REQUIREMENT' });
    }

    if (!requirement?.formula) {
      return requirementDiagnostic('Tool requirement requires formula', 'MISCONFIGURED_PROVIDER');
    }
    if (typeof this.evaluateExpression !== 'function') {
      return requirementDiagnostic(
        'Expression evaluation dependency is not configured',
        'MISCONFIGURED_PROVIDER'
      );
    }

    try {
      const value = await this._resolveExpression(requirement.formula, {
        actor,
        environment,
        task,
        kind: 'toolRequirement',
      });
      const allowed = coerceTruthy(value);
      return requirementResult({
        allowed,
        reasonCode: allowed ? 'REQUIREMENT_MET' : 'REQUIREMENT_FAILED',
      });
    } catch (error) {
      return requirementDiagnostic(
        errorMessage(error, 'Tool requirement failed'),
        'PROVIDER_ERROR'
      );
    }
  }

  async _resolveExpression(expression, context) {
    return this.evaluateExpression({
      expression,
      ...context,
    });
  }
}

function coerceTruthy(value) {
  if (typeof value === 'boolean') return value;
  if (value == null || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return false;
    const lowered = trimmed.toLowerCase();
    if (lowered === 'false' || lowered === '0') return false;
    return true;
  }
  return Boolean(value);
}

function compareVisibility(value, threshold) {
  if (typeof threshold === 'boolean') {
    return { valid: true, visible: threshold };
  }

  const numericValue = numericValueOf(value);
  const numericThreshold = numericValueOf(threshold);
  if (numericValue === null || numericThreshold === null) {
    return {
      valid: false,
      message:
        'Visibility formula and numeric threshold must resolve to numbers, or threshold must resolve to boolean',
    };
  }

  return {
    valid: true,
    visible: numericValue >= numericThreshold,
  };
}

function visibilityResult({ visible, description = '', reasonCode, diagnostic = null }) {
  return {
    visible: visible === true,
    description: stringOrEmpty(description),
    reasonCode,
    diagnostic,
  };
}

function requirementResult({ allowed, description = '', reasonCode, diagnostic = null }) {
  return {
    allowed: allowed === true,
    description: stringOrEmpty(description),
    reasonCode,
    diagnostic,
  };
}

function requirementDiagnostic(message, reasonCode = 'MISCONFIGURED_PROVIDER') {
  return requirementResult({
    allowed: false,
    reasonCode,
    diagnostic: diagnostic(message),
  });
}

function visibilityDiagnostic(message, reasonCode = 'MISCONFIGURED_PROVIDER') {
  return visibilityResult({
    visible: false,
    reasonCode,
    diagnostic: diagnostic(message),
  });
}

function diagnostic(message) {
  return {
    provider: null,
    message,
  };
}

function numericValueOf(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stringOrEmpty(value) {
  return value === undefined || value === null ? '' : String(value);
}

function errorMessage(error, fallback) {
  return error?.message ? String(error.message) : fallback;
}
