// border-image: none (and its source none, or a CSS-wide keyword) is the initial value: it draws no image and changes
// nothing (a reset on hr). Any other border-image stays Unknown.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const run = css => analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;border:2px solid red}${css}`, viewport: {min: 320, max: 800, height: {min: 300, max: 900}}});

test('border-image: none changes nothing; an image stays Unknown', () => {
  for (const css of ['.a{border-image:none}', '.a{border-image-source:none}', '.a{border-image:initial}', '.a{border-image:unset}'])
    assert.equal(run(css).status, 'verified', css);
  for (const css of ['.a{border-image:url(a.png) 30}', '.a{border-image-source:linear-gradient(red, blue)}', '.a{border-image-width:4px}'])
    assert.equal(run(css).status, 'unknown', css);
  // none is dropped as a no-op, so it does not override an earlier image: that one stays the cascaded declaration
  // (Unknown, conservative); an image over none wins and stays Unknown.
  assert.equal(run('.a{border-image:url(a.png) 30}.a{border-image:none}').status, 'unknown');
  assert.equal(run('.a{border-image:none}.a{border-image:url(a.png) 30}').status, 'unknown');
});
