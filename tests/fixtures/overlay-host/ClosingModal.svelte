<!--
  The shared `Modal` closed by its own `onClose`, as a companion closes it (issue 2859): the call is
  passed on, then `open` turns false. `mount.js` draws it for `?component=modal&closes=1` only.
-->
<script>
  import Modal from '../../../src/ui/svelte/components/Modal.svelte';

  let { onClose, ...rest } = $props();
  let open = $state(true);

  function close() {
    onClose();
    open = false;
  }
</script>

<Modal {...rest} {open} onClose={close} />
