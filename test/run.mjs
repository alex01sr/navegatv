import { createRequire } from 'module';
const require = createRequire('/Users/alexanderreyes/.npm/_npx/9833c18b2d85bc59/node_modules/');
const { chromium } = require('playwright');
import fs from 'fs';
const code = fs.readFileSync('../dist/navegatv.js','utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args:['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(code);
const pages = [];
ctx.on('page', p => pages.push(p.url()));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type()==='error') errs.push('console: '+m.text()); });
const navs = [];
page.on('framenavigated', f => { if (f === page.mainFrame()) navs.push(f.url()); });
await page.goto('http://localhost:8001/top.html');
await page.waitForTimeout(1500);
const key = async (k, n=1) => { for (let i=0;i<n;i++) { await page.keyboard.press(k); await page.waitForTimeout(60);} };
const r = {};
r.hostExists = await page.evaluate(() => !!document.getElementById('ntv-host'));
r.trapsRemoved = await page.evaluate(() => [!!document.getElementById('trap'), !!document.getElementById('trap2')]);
r.log1 = await page.evaluate(() => window.LOG.slice());
// mover el cursor sobre el reproductor (iframe en 0..800 x ~ 80..530) y hacer clic
await page.evaluate(() => 0);
await key('ArrowLeft', 30); await key('ArrowUp', 30);
await key('ArrowRight', 8); await key('ArrowDown', 8);
await page.screenshot({ path: 'shot1.png' });
await key('Enter');
await page.waitForTimeout(2500);
r.afterClick = { url: page.url(), pages, log: await page.evaluate(() => window.LOG.slice()) };
r.vmode = await page.evaluate(() => document.documentElement.classList.contains('ntv-vmode'));
const fr = page.frames().find(f => f.url().includes('player'));
r.playerState = await fr.evaluate(() => { const v=document.getElementById('v'); return { paused: v.paused, t: v.currentTime, maxed: v.classList.contains('ntv-max') }; });
await page.screenshot({ path: 'shot2.png' });
// adelantar y pausar
await key('ArrowRight', 2); await page.waitForTimeout(300);
r.afterSeek = await fr.evaluate(() => document.getElementById('v').currentTime);
await key('Enter'); await page.waitForTimeout(400);
r.pausedAfterOk = await fr.evaluate(() => document.getElementById('v').paused);
await page.screenshot({ path: 'shot3.png' });
// salir modo video
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
r.vmodeAfterBack = await page.evaluate(() => document.documentElement.classList.contains('ntv-vmode'));
// menu
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.screenshot({ path: 'shot4.png' });
r.menuOpen = await page.evaluate(() => document.getElementById('ntv-host').shadowRoot.getElementById('menu').classList.contains('on'));
await page.keyboard.press('Escape');
// redirección por script sin acción del usuario
await page.waitForTimeout(4500);
await page.evaluate(() => { location.href = 'http://127.0.0.1:8002/other.html'; });
await page.waitForTimeout(1000);
r.afterScriptRedirect = page.url();
r.navs = navs; r.errs = errs;
console.log(JSON.stringify(r, null, 2));
await browser.close();
