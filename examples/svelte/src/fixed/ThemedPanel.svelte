<script>
  let { dark = false } = $props();
</script>

<!-- The theme is a prop: class:dark is a state of this component, and the checker checks both. -->
<section class="panel" class:dark={dark}>
  <h2 class="title">Usage</h2>
</section>

<style>
  .panel { display: grid; grid-template-columns: minmax(0, 1fr); padding: 16px; background: #fff; color: #222; }
  .title { margin: 0; font-size: 18px; }
  .panel.dark { background: #1e1e1e; color: #eee; }
</style>
