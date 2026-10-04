/**
 * The inspector-rail verb contract (issue 1521): each verb is a full-width `Button` carrying the
 * one role class its verb names, and a rail carries exactly one primary.
 */
import assert from 'node:assert/strict';

/** `Button.svelte`'s `ROLE_CLASSES` for the four roles an inspector verb takes. */
export const INSPECTOR_VERB_ROLE_CLASSES = Object.freeze({
  primary: 'is-primary',
  ghost: 'is-ghost',
  danger: 'is-danger',
  warning: 'is-warning-action',
});

const MANAGER = 'src/ui/svelte/apps/manager';
const ESSENCE_INSPECTOR = `${MANAGER}/essences/EssenceBrowserInspector.svelte`;
const ESSENCE_VERBS_CASE = 'manager-essences-inspector-verbs';

/**
 * The eight verbs the retired rail button drew: the file rendering each, its hook attribute and
 * value (`true` when bare), its role, the View Lab case measuring it and the selector naming it.
 */
export const INSPECTOR_VERB_SITES = Object.freeze(
  [
    [ESSENCE_INSPECTOR, 'data-essence-action', 'edit', 'primary', ESSENCE_VERBS_CASE],
    [ESSENCE_INSPECTOR, 'data-essence-action', 'delete', 'danger', ESSENCE_VERBS_CASE],
    [ESSENCE_INSPECTOR, 'data-essence-action', 'copy-source', 'ghost', ESSENCE_VERBS_CASE],
    [ESSENCE_INSPECTOR, 'data-essence-action', 'unlink-source', 'warning', ESSENCE_VERBS_CASE],
    [
      `${MANAGER}/components/ComponentBrowserInspector.svelte`,
      'data-component-edit-system-rules',
      '',
      'primary',
      'manager-components-normal',
    ],
    ...['component', 'essence', 'tool'].map((kind) => [
      `${MANAGER}/scoped/World${kind[0].toUpperCase()}${kind.slice(1)}CataloguePage.svelte`,
      `data-scoped-${kind}-open-entry`,
      true,
      'primary',
      `world-${kind}-catalogue`,
    ]),
  ].map(([file, hook, value, role, caseId]) =>
    Object.freeze({
      file,
      hook,
      value,
      role,
      caseId,
      selector: typeof value === 'string' && value ? `[${hook}="${value}"]` : `[${hook}]`,
    })
  )
);

/**
 * @param {Element} rail the inspector rail the verbs sit in.
 * @param {Array<[string, keyof typeof INSPECTOR_VERB_ROLE_CLASSES]>} verbs selector and role pairs.
 */
export function assertInspectorVerbs(rail, verbs) {
  assert.ok(Boolean(rail), 'the inspector rail renders');
  for (const [selector, role] of verbs) {
    const verb = rail.querySelector(selector);
    assert.ok(Boolean(verb), `${selector} renders in the rail`);
    for (const required of ['fabricate-button', 'fab-manager-button', 'is-full-width']) {
      assert.ok(verb.classList.contains(required), `${selector} carries ${required}`);
    }
    const roles = Object.values(INSPECTOR_VERB_ROLE_CLASSES).filter((name) =>
      verb.classList.contains(name)
    );
    assert.deepEqual(roles, [INSPECTOR_VERB_ROLE_CLASSES[role]], `${selector} is ${role} alone`);
  }
  assert.equal(
    rail.querySelectorAll('.fab-manager-button.is-primary').length,
    1,
    'the rail carries exactly one primary'
  );
}
