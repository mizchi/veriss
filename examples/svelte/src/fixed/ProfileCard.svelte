<script>
  let { name = 'Ada Lovelace' } = $props();
</script>

<!-- max-width lets the card shrink on a phone; width/height give the avatar its box before the file loads. -->
<article class="card">
  <img class="avatar" src="/avatar.png" alt="" width="128" height="128">
  <h2 class="name">{name}</h2>
</article>

<style>
  .card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; max-width: 480px; padding: 16px; }
  .avatar { width: 64px; height: auto; }
  .name { margin: 0; font-size: 20px; }
</style>
