<!-- data-text-one-line: the label must stay on one line. Measured with the Roboto file, "Publish now" does not fit the fixed 80px. -->
<div class="bar">
  <button class="save" type="button" data-text-one-line>Publish now</button>
</div>

<style>
  .bar { display: grid; grid-template-columns: minmax(0, 1fr); font-family: Roboto; font-size: 16px; line-height: 24px; }
  .save { display: block; width: 80px; min-height: 44px; padding: 8px; border: 1px solid #767676; font: inherit; }
</style>
