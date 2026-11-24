// :active rules that change layout: the static check lays the page out again with the button pressed. Here the button is
// pressed in the browser, with the mouse and with the Space key, and its content overflows exactly where the pressed
// layout reports it.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';

const html = '<html lang="en"><body><button class="b" type="button"><div class="i"></div></button></body></html>';
const base = '*{margin:0;box-sizing:border-box}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.b{display:grid;grid-template-columns:minmax(0,1fr);height:34px;border:1px solid #333;background:#fff}.i{height:20px;background:#246}';

test('a pressed button overflows its content exactly where the pressed layout reports it, with the mouse and the Space key', async ({page}) => {
  let flaggedSome = false, cleanSome = false;
  for (const extra of ['.b:active:not([disabled]){padding-top:2px}', '.b:active{padding-top:16px}', '.b:active{padding-top:12px}', '.b:active{padding-top:13px}', '.b:active{border-top-width:14px}']) {
    const css = base + extra;
    const report = analyzeHTML(html, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, block: true});
    expect(report.status, `${extra}: ${JSON.stringify(report.diagnostics)}`).not.toBe('unknown');
    const flagged = report.diagnostics.some(d => d.pressed === '.b');
    flaggedSome ||= flagged; cleanSome ||= !flagged;
    await page.setViewportSize({width: 400, height: 700});
    await page.setContent(`<!doctype html>${html.replace('<body>', `<head><style>${css}</style></head><body>`)}`);
    // The content's bottom past the button's content box (its border box less the bottom border and padding).
    const overflows = () => page.evaluate(() => { const e = document.querySelector('.b'), b = e.getBoundingClientRect(), s = getComputedStyle(e), i = document.querySelector('.i').getBoundingClientRect(); return i.bottom > b.bottom - parseFloat(s.borderBottomWidth) - parseFloat(s.paddingBottom) + 0.01; });
    expect(await overflows(), `${extra}: not pressed`).toBe(false);
    const box = await page.locator('.b').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const pointer = await overflows();
    await page.mouse.up();
    await page.mouse.move(0, 600);
    await page.focus('.b');
    await page.keyboard.down(' ');
    const key = await overflows();
    await page.keyboard.up(' ');
    // Reported exactly when some press overflows; the mouse press does wherever it is reported (Firefox sets no :active on
    // a button for the Space key, so there the key press never overflows).
    expect({some: pointer || key, pointer}, `${extra}: ${JSON.stringify(report.diagnostics.map(d => d.message))}`).toEqual({some: flagged, pointer: flagged});
  }
  // Not vacuous: both outcomes occur.
  expect(flaggedSome && cleanSome).toBe(true);
});
