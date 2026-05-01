const VALID_PROVIDERS = new Set(['dnd5e', 'pf2e', 'macro']);
const FAILURE_STATUSES = new Set(['failure', 'failed', 'fail']);
const SUCCESS_STATUSES = new Set(['success', 'succeeded', 'pass', 'passed']);

/**
 * Evaluates gathering visibility gates and gathering task checks.
 *
 * Runtime-specific macro lookup and system-native expression parsing are injected
 * so this seam can stay independent from Foundry globals.
 */
export class GatheringGateAndCheckEvaluator {
  constructor({
    runMacro = null,
    evaluateExpression = null
  } = {}) {
    this.runMacro = runMacro;
    this.evaluateExpression = evaluateExpression;
  }

  async evaluateVisibility({ gate = null, actor = null, viewer = null, environment = null, task = null } = {}) {
    if (!gate) {
      return visibilityResult({
        visible: true,
        reasonCode: 'NO_VISIBILITY_GATE'
      });
    }

    const provider = normalizeProvider(gate.provider);
    const providerError = this._validateProvider(provider);
    if (providerError) {
      return visibilityDiagnostic(providerError, provider, 'UNSUPPORTED_PROVIDER');
    }

    if (provider === 'macro') {
      return this._evaluateMacroVisibility({ gate, actor, viewer, environment, task });
    }

    return this._evaluateSystemVisibility({ gate, actor, viewer, environment, task, provider });
  }

  async evaluateCheck({ check = null, actor = null, environment = null, task = null } = {}) {
    if (!check) {
      return checkDiagnostic('Gathering check is not configured', 'MISCONFIGURED_PROVIDER', null);
    }

    const provider = normalizeProvider(check.provider);
    const providerError = this._validateProvider(provider);
    if (providerError) {
      return checkDiagnostic(providerError, 'UNSUPPORTED_PROVIDER', provider);
    }

    if (provider === 'macro') {
      return this._evaluateMacroCheck({ check, actor, environment, task });
    }

    return this._evaluateSystemCheck({ check, actor, environment, task, provider });
  }

  async _evaluateMacroVisibility({ gate, actor, viewer, environment, task }) {
    if (!gate?.macroUuid) {
      return visibilityDiagnostic('Macro visibility gate requires macroUuid', 'macro', 'MISCONFIGURED_PROVIDER');
    }
    if (typeof this.runMacro !== 'function') {
      return visibilityDiagnostic('Macro execution dependency is not configured', 'macro', 'MISCONFIGURED_PROVIDER');
    }

    try {
      const raw = await this.runMacro(gate.macroUuid, {
        kind: 'visibility',
        gate,
        actor,
        viewer,
        environment,
        task
      });
      return normalizeMacroVisibility(raw, 'macro');
    } catch (err) {
      return visibilityDiagnostic(errorMessage(err, 'Macro visibility gate failed'), 'macro', 'PROVIDER_ERROR');
    }
  }

  async _evaluateSystemVisibility({ gate, actor, viewer, environment, task, provider }) {
    if (!gate?.formula || !gate?.threshold) {
      return visibilityDiagnostic(`${provider} visibility gate requires formula and threshold`, provider, 'MISCONFIGURED_PROVIDER');
    }
    if (typeof this.evaluateExpression !== 'function') {
      return visibilityDiagnostic('Expression evaluation dependency is not configured', provider, 'MISCONFIGURED_PROVIDER');
    }

    try {
      const context = { provider, actor, viewer, environment, task };
      const value = await this._resolveExpression(gate.formula, {
        ...context,
        kind: 'visibilityFormula'
      });
      const threshold = await this._resolveExpression(gate.threshold, {
        ...context,
        kind: 'visibilityThreshold',
        formulaValue: value
      });
      const comparison = compareVisibility(value, threshold);
      if (!comparison.valid) {
        return visibilityDiagnostic(comparison.message, provider, 'MALFORMED_RESULT');
      }

      return visibilityResult({
        visible: comparison.visible,
        reasonCode: comparison.visible ? 'VISIBLE' : 'HIDDEN'
      });
    } catch (err) {
      return visibilityDiagnostic(errorMessage(err, `${provider} visibility gate failed`), provider, 'PROVIDER_ERROR');
    }
  }

  async _evaluateMacroCheck({ check, actor, environment, task }) {
    if (!check?.macroUuid) {
      return checkDiagnostic('Macro gathering check requires macroUuid', 'MISCONFIGURED_PROVIDER', 'macro');
    }
    if (typeof this.runMacro !== 'function') {
      return checkDiagnostic('Macro execution dependency is not configured', 'MISCONFIGURED_PROVIDER', 'macro');
    }

    try {
      const raw = await this.runMacro(check.macroUuid, {
        kind: 'check',
        check,
        actor,
        environment,
        task
      });
      return normalizeMacroCheck(raw, 'macro');
    } catch (err) {
      return checkDiagnostic(errorMessage(err, 'Macro gathering check failed'), 'PROVIDER_ERROR', 'macro');
    }
  }

  async _evaluateSystemCheck({ check, actor, environment, task, provider }) {
    if (!check?.formula) {
      return checkDiagnostic(`${provider} gathering check requires formula`, 'MISCONFIGURED_PROVIDER', provider);
    }
    if (typeof this.evaluateExpression !== 'function') {
      return checkDiagnostic('Expression evaluation dependency is not configured', 'MISCONFIGURED_PROVIDER', provider);
    }

    try {
      const context = { provider, actor, environment, task };
      const value = await this._resolveExpression(check.formula, {
        ...context,
        kind: 'checkFormula'
      });
      const numericValue = numericValueOf(value);
      if (numericValue === null) {
        return checkDiagnostic(`${provider} gathering check formula must resolve to a number`, 'MALFORMED_RESULT', provider);
      }

      if (!check.threshold) {
        return checkResult({
          success: null,
          status: null,
          value: numericValue,
          reasonCode: 'CHECK_VALUE'
        });
      }

      const threshold = await this._resolveExpression(check.threshold, {
        ...context,
        kind: 'checkThreshold',
        formulaValue: numericValue
      });
      const comparison = compareCheck(numericValue, threshold);
      if (!comparison.valid) {
        return checkDiagnostic(comparison.message, 'MALFORMED_RESULT', provider, { value: numericValue });
      }

      return checkResult({
        success: comparison.success,
        status: comparison.success ? 'success' : 'failure',
        value: numericValue,
        reasonCode: comparison.success ? 'CHECK_SUCCESS' : 'CHECK_FAILURE'
      });
    } catch (err) {
      return checkDiagnostic(errorMessage(err, `${provider} gathering check failed`), 'PROVIDER_ERROR', provider);
    }
  }

  async _resolveExpression(expression, context) {
    return this.evaluateExpression({
      expression,
      ...context
    });
  }

  _validateProvider(provider) {
    if (!provider || !VALID_PROVIDERS.has(provider)) {
      return `Unsupported gathering provider "${provider || 'unknown'}"`;
    }
    return null;
  }
}

function normalizeMacroVisibility(raw, provider) {
  if (typeof raw === 'boolean') {
    return visibilityResult({
      visible: raw,
      reasonCode: raw ? 'VISIBLE' : 'HIDDEN'
    });
  }

  if (raw && typeof raw === 'object' && typeof raw.visible === 'boolean') {
    return visibilityResult({
      visible: raw.visible,
      description: stringOrEmpty(raw.description),
      reasonCode: raw.visible ? 'VISIBLE' : 'HIDDEN'
    });
  }

  return visibilityDiagnostic('Macro visibility gate must return a boolean or { visible, description }', provider, 'MALFORMED_RESULT');
}

function normalizeMacroCheck(raw, provider) {
  if (typeof raw === 'number') {
    return checkDiagnostic('Macro gathering check must return an object with numeric value', 'MALFORMED_RESULT', provider, {
      value: Number.isFinite(raw) ? raw : null
    });
  }

  if (!raw || typeof raw !== 'object') {
    return checkDiagnostic('Macro gathering check must return an object with numeric value', 'MALFORMED_RESULT', provider);
  }

  const value = numericValueOf(raw.value);
  if (value === null) {
    return checkDiagnostic('Macro gathering check object requires numeric value', 'MALFORMED_RESULT', provider);
  }

  const status = normalizeCheckStatus(raw.status);
  const successHint = normalizeSuccessHint(raw.success);
  if (status === undefined || successHint === undefined) {
    return checkDiagnostic('Macro gathering check status must be success or failure when provided', 'MALFORMED_RESULT', provider, { value });
  }
  if (status !== null && successHint !== null && (status === 'success') !== successHint) {
    return checkDiagnostic('Macro gathering check status conflicts with success hint', 'MALFORMED_RESULT', provider, { value });
  }

  const resolvedStatus = status ?? (successHint === null ? null : (successHint ? 'success' : 'failure'));
  if (!resolvedStatus) {
    return checkResult({
      success: null,
      status: null,
      value,
      description: stringOrEmpty(raw.description),
      data: plainObject(raw.data),
      reasonCode: 'CHECK_VALUE'
    });
  }

  return checkResult({
    success: resolvedStatus !== 'failure',
    status: resolvedStatus,
    value,
    description: stringOrEmpty(raw.description),
    data: plainObject(raw.data),
    reasonCode: resolvedStatus === 'failure' ? 'CHECK_FAILURE' : 'CHECK_SUCCESS'
  });
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
      message: 'Visibility formula and numeric threshold must resolve to numbers, or threshold must resolve to boolean'
    };
  }

  return {
    valid: true,
    visible: numericValue >= numericThreshold
  };
}

function compareCheck(value, threshold) {
  if (typeof threshold === 'boolean') {
    return { valid: true, success: threshold };
  }

  const numericThreshold = numericValueOf(threshold);
  if (numericThreshold === null) {
    return {
      valid: false,
      message: 'Gathering check threshold must resolve to a number or boolean'
    };
  }

  return {
    valid: true,
    success: value >= numericThreshold
  };
}

function normalizeCheckStatus(status) {
  if (status === undefined || status === null || status === '') {
    return null;
  }

  const normalized = String(status).trim().toLowerCase();
  if (SUCCESS_STATUSES.has(normalized)) return 'success';
  if (FAILURE_STATUSES.has(normalized)) return 'failure';
  return undefined;
}

function normalizeSuccessHint(success) {
  if (success === undefined || success === null || success === '') return null;
  if (typeof success === 'boolean') return success;
  return undefined;
}

function visibilityResult({
  visible,
  description = '',
  reasonCode,
  diagnostic = null
}) {
  return {
    visible: visible === true,
    description: stringOrEmpty(description),
    reasonCode,
    diagnostic
  };
}

function checkResult({
  success = null,
  status = null,
  value = null,
  description = '',
  data = {},
  reasonCode,
  diagnostic = null
}) {
  return {
    success: success === null ? null : success === true,
    status,
    value,
    description: stringOrEmpty(description),
    data: plainObject(data),
    reasonCode,
    diagnostic
  };
}

function visibilityDiagnostic(message, provider, reasonCode = 'MISCONFIGURED_PROVIDER') {
  return visibilityResult({
    visible: false,
    reasonCode,
    diagnostic: diagnostic(provider, message)
  });
}

function checkDiagnostic(message, reasonCode, provider, extra = {}) {
  return checkResult({
    success: null,
    status: null,
    value: Object.hasOwn(extra, 'value') ? extra.value : null,
    reasonCode,
    diagnostic: diagnostic(provider, message)
  });
}

function diagnostic(provider, message) {
  return {
    provider: provider || null,
    message
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

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
}

function normalizeProvider(provider) {
  return provider === undefined || provider === null ? '' : String(provider).trim().toLowerCase();
}

function stringOrEmpty(value) {
  return value === undefined || value === null ? '' : String(value);
}

function errorMessage(error, fallback) {
  return error?.message ? String(error.message) : fallback;
}
