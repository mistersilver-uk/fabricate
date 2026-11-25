<!-- Svelte 5 runes mode -->
<!--
  The blocking Notice every iterative screen shows when the library was made by a newer build of
  Fabricate: the screens read nothing from it and write nothing to it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `text` | the shell's localizer | — | `(key, fallback)` |
-->
<script>
  import Notice from '../../../components/Notice.svelte';

  let { text = (_key, fallback) => fallback } = $props();
</script>

<Notice
  blocking
  tone="danger"
  title={text(
    'FABRICATE.Admin.Manager.Iterative.UnsupportedTitle',
    'These counters and actions were made by a newer version of Fabricate.'
  )}
  detail={text(
    'FABRICATE.Admin.Manager.Iterative.UnsupportedDetail',
    'Update Fabricate to edit them. Nothing here can be changed until then.'
  )}
  data-iterative-unsupported-notice
/>
