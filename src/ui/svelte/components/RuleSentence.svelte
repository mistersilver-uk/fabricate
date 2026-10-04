<!--
  A rule restated as one sentence, assembled from localized keys: a translator-owned frame whose
  `{clauses}` are the rule's clauses joined by a translator-owned join. It is never handed a
  string and never re-cases one, because casing is the key a fragment names.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `sentence` | `{ frameKey, clauseKeys, joinKey, params }` | `null` | `params` is keyed by the frame or a clause key, and each param is a literal or a nested `{ key, params }` fragment resolved the same way. |
  | `missingClauseKey` | localization key | `'FABRICATE.Common.RuleSentence.Missing'` | Drawn instead of the sentence when it has no clause, names an unknown key or leaves a placeholder unfilled. |

  Rest spread:
  - `{...rest}` lands on the `<span>` root, written after `class={…}`.

  Invariants:
  - A missing clause renders the whole missing sentence, never half a rule — pinned by
    `tests/components/rule-row-mounted.test.js`.
-->
<script>
  import { fill } from '../../../utils/fillPlaceholders.js';
  import { localizeOr } from '../util/localizeOr.js';

  let {
    sentence = null,
    missingClauseKey = 'FABRICATE.Common.RuleSentence.Missing',
    class: extraClass = '',
    ...rest
  } = $props();

  const isFragment = (param) => Boolean(param) && typeof param === 'object' && 'key' in param;

  /** One key filled from its params, or null when the key or any placeholder is unresolved. */
  function resolve(key, params = {}) {
    const template = typeof key === 'string' && key ? localizeOr(key) : '';
    if (!template || template === key) return null;
    const values = {};
    for (const [name, param] of Object.entries(params ?? {})) {
      const value = isFragment(param) ? resolve(param.key, param.params) : param;
      if (value === null || value === undefined) return null;
      values[name] = value;
    }
    const names = [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    return names.every((name) => Object.hasOwn(values, name)) ? fill(template, values) : null;
  }

  function compose(rule) {
    const clauseKeys = Array.isArray(rule?.clauseKeys) ? rule.clauseKeys : [];
    if (clauseKeys.length === 0) return null;
    const params = rule.params ?? {};
    const clauses = clauseKeys.map((key) => resolve(key, params[key]));
    if (clauses.includes(null)) return null;
    const join = clauses.length > 1 ? resolve(rule.joinKey) : '';
    if (join === null) return null;
    return resolve(rule.frameKey, { ...params[rule.frameKey], clauses: clauses.join(join) });
  }

  const stated = $derived(compose(sentence));
</script>

<span class={['fabricate-rule-sentence', stated === null && 'is-missing', extraClass]} {...rest}
  >{stated ?? localizeOr(missingClauseKey)}</span
>
