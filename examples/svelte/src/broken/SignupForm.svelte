<!-- The label sits next to the field but is not tied to it: a screen reader announces the field with no name. -->
<form class="signup">
  <label class="label">Email</label>
  <input class="field" type="email" name="email">
  <button class="submit" type="submit">Subscribe</button>
</form>

<style>
  .signup { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .field { height: 44px; }
  .field, .submit { display: block; min-height: 44px; padding: 8px; box-sizing: border-box; border: 1px solid #767676; font: inherit; }
</style>
