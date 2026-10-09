// v1.13.2: iPhone home-screen app (status bar over the page): nothing important may sit under the status bar
// The status-bar inset is simulated with --sat (the CSS reads env(safe-area-inset-top) through --sat).
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
const SAT = 47;
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); p.on('pageerror', e => errors.push(e.message));
  await p.route(/fonts\./, r => r.abort());
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.addStyleTag({ content: `:root{--sat:${SAT}px !important}` });
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  await p.addStyleTag({ content: `:root{--sat:${SAT}px !important}` }); await p.waitForTimeout(200);
  const top = async sel => p.$eval(sel, e => e.getBoundingClientRect().top);
  ok('title bar content starts below the status bar', await top('.bar .brand') >= SAT);
  ok('first card starts below the title bar', await top('main > *:first-child') >= (await p.$eval('.bar', e => e.getBoundingClientRect().bottom)) - 1);
  await p.mouse.wheel(0, 600); await p.waitForTimeout(200);
  ok('scrolled: title bar still covers the status bar (no content shows through)', await top('.bar') <= 0 && await top('.bar .brand') >= SAT);
  await p.screenshot({ path: 'test/shots/safearea-home.png' });
  await p.mouse.wheel(0, -2000); await p.waitForTimeout(200);
  await p.tap('.bn:has-text("Divisions")');
  await p.waitForTimeout(200);
  await p.tap('button[data-act="div-panel"] >> nth=0'); await p.waitForSelector('#divp-root .sheet-h, .sheet-h');
  ok('pop-up title starts below the status bar', await top('.sheet-h h2, .sheet-h h3, .sheet-h') >= SAT);
  await p.screenshot({ path: 'test/shots/safearea-sheet.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
