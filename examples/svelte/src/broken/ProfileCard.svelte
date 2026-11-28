<script>
  let { name = 'Ada Lovelace' } = $props();
</script>

<!-- Two mistakes: a fixed width that is wider than a phone, and an avatar that reserves no height. -->
<article class="card">
  <img class="avatar" src="/avatar.png" alt="">
  <h2 class="name">{name}</h2>
</article>

<style>
  .card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; width: 480px; padding: 16px; }
  .avatar { width: 64px; }
  .name { margin: 0; font-size: 20px; }
</style>
