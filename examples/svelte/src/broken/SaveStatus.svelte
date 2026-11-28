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
  .editor { display: grid; grid-template-columns: minmax(0, 1fr); }
  .toast { padding: 8px; background: #e6f4ea; }
  .canvas { height: 320px; background: #fafafa; }
</style>
