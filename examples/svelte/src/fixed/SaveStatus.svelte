<script>
  let { saved = false } = $props();
</script>

<div class="editor">
  {#if saved}
    <p class="toast" role="status">Saved</p>
  {/if}
  <div class="canvas" data-noshift="canvas" data-noshift-on="saved"></div>
</div>

<style>
  .editor { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); }
  .toast { position: absolute; top: 8px; right: 8px; width: 96px; padding: 8px; background: #e6f4ea; }
  .canvas { height: 320px; background: #fafafa; }
</style>
