<script>
  let { items = [], owner = '', code = '' } = $props();
</script>

<!-- Dynamic text bounded by data-text-max-length, inside {#each}: each bound is a search over every string of that
     length from its characters (printable ASCII by default). test/text-max-length.test.mjs pins this output. -->
<ul class="tags">
  {#each items as item}
    <li><span class="tag" data-text-max-length="12">{item}</span></li>
  {/each}
</ul>
<p class="owner" data-text-one-line data-text-max-length="20" data-text-chars="abcdefghijklmnopqrstuvwxyz ">{owner}</p>
<p class="code" data-text-one-line data-text-max-length="4" data-text-chars="あいう">{code}</p>

<style>
  .tags { display: flex; gap: 4px; list-style: none; padding: 0; margin: 0; }
  .tag { display: block; width: 120px; white-space: nowrap; font-family: Roboto; font-size: 14px; line-height: 20px; }
  .owner { width: 240px; font-family: Roboto; font-size: 1rem; line-height: 1.5; }
  .code { width: 80px; font-family: Roboto; font-size: 14px; line-height: 20px; }
</style>
