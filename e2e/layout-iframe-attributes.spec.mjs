// An iframe's UA border and its legacy frame attributes: the verifier's iframe box and the position of what follows it
// agree with the browser (packages/veriss/test/iframe-legacy-attributes.test.mjs). frameborder values the engines read
// differently ("yes", "", "0px") are checked with the ua profile of the engine under test.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';

const attrs = ['', 'frameborder="0"', 'frameborder="no"', 'frameborder="1"', 'frameborder="-1"', 'frameborder="yes"', 'frameborder=""', 'frameborder="0px"',
  'frameborder="0" scrolling="no" marginwidth="0" marginheight="0" allowtransparency="true"', 'scrolling="yes" marginwidth="20" marginheight="20"'];
const styles = ['', 'iframe{border:3px solid red}', 'iframe{border-width:1px}', 'iframe{border-style:none}', 'iframe{box-sizing:border-box}'];
const body = a => `<main><div class="slot"><iframe title="ad" src="about:blank" width="300" height="250" ${a}></iframe></div><p class="after">x</p></main>`;

test('iframe UA border and frame attributes agree with the browser', async ({page, browserName}) => {
  for (const a of attrs) for (const extra of styles) {
    const css = `body,p{margin:0}iframe{display:block}${extra}`;
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${body(a)}</body></html>`);
    const b = await page.evaluate(() => { const r = document.querySelector('iframe').getBoundingClientRect(); return [r.width, r.height, document.querySelector('.after').getBoundingClientRect().top]; });
    const report = analyzeHTML(`<html lang="en"><body>${body(a)}</body></html>`, {name: 'P', css, ua: browserName, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}],
      boxes: {'.after': {minInlineSize: 10, maxInlineSize: 10, intrinsicBlockSize: 20}}});
    const f = report.sizes.find(s => s.box.startsWith('iframe'));
    expect(f, `${a} ${extra}: ${JSON.stringify(report.diagnostics.map(d => d.message))}`).toBeTruthy();
    const after = Number(report.sizes.find(s => s.box === '.after').rect.blockStart.constant);
    expect([Number(f.inlineSize.constant), Number(f.blockSize.constant), after], `${a} ${extra}`).toEqual(b);
  }
});
