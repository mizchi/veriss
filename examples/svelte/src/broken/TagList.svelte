<script>
  let { tags = [] } = $props();
</script>

<!-- <li> outside a list, and a remove button whose only content is an icon: it has no name. -->
<div class="tags">
  {#each tags as tag}
    <li class="tag">
      <span class="text">{tag}</span>
      <button class="remove" type="button"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor"/></svg></button>
    </li>
  {/each}
</div>

<style>
  .tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag { display: flex; align-items: center; gap: 4px; padding: 4px 8px; }
  .text { width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .remove { display: block; width: 24px; height: 24px; padding: 6px; border: 0; background: transparent; }
</style>
