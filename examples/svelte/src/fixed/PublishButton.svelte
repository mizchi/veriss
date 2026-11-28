<!-- min-width instead of width: the button grows to its label (justify-self: start keeps it from stretching across the bar). -->
<div class="bar">
  <button class="save" type="button" data-text-one-line>Publish now</button>
</div>

<style>
  .bar { display: grid; grid-template-columns: minmax(0, 1fr); font-family: Roboto; font-size: 16px; line-height: 24px; }
  .save { display: block; justify-self: start; min-width: 80px; min-height: 44px; padding: 8px; border: 1px solid #767676; font: inherit; }
</style>
