<script>
  let { tags = [] } = $props();
</script>

<!-- A <ul> holds the <li>s (role="list" keeps its semantics in Safari with list-style: none), and aria-label names the icon button. -->
<ul class="tags" role="list">
  {#each tags as tag}
    <li class="tag">
      <span class="text">{tag}</span>
      <button class="remove" type="button" aria-label="Remove tag"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor"/></svg></button>
    </li>
  {/each}
</ul>

<style>
  .tags { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .tag { display: flex; align-items: center; gap: 4px; padding: 4px 8px; }
  .text { width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .remove { display: block; width: 24px; height: 24px; padding: 6px; border: 0; background: transparent; }
</style>
