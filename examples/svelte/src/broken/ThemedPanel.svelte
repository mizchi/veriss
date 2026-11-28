<!-- A :global() selector styles this panel from a class somewhere on the page: its look depends on where it is placed. -->
<section class="panel">
  <h2 class="title">Usage</h2>
</section>

<style>
  .panel { display: grid; grid-template-columns: minmax(0, 1fr); padding: 16px; background: #fff; color: #222; }
  .title { margin: 0; font-size: 18px; }
  :global(.theme-dark) .panel { background: #1e1e1e; color: #eee; }
</style>
