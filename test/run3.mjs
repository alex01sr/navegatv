import { createRequire } from 'module';
const require = createRequire('/Users/alexanderreyes/.npm/_npx/9833c18b2d85bc59/node_modules/');
const { chromium } = require('playwright');
import fs from 'fs';
const code = fs.readFileSync('../dist/navegatv.js','utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(code);
const page = await ctx.newPage();
const errs=[]; page.on('pageerror', e => errs.push(e.message));
const P = async (k,n=1)=>{ for(let i=0;i<n;i++){ await page.keyboard.press(k); await page.waitForTimeout(40);} };
await page.goto('http://localhost:8001/form.html'); await page.waitForTimeout(1200);
const r={};
r.autofocusDropped = await page.evaluate(()=>document.activeElement.tagName);
// llevar cursor a (300,120): empieza en 960,540
const moveTo = async (x,y) => { const cur = await page.evaluate(()=>0); };
await P('ArrowLeft',40); await P('ArrowUp',40);   // esquina 0,0
// cada pulsación aislada = 14px
for (let i=0;i<21;i++){ await page.keyboard.press('ArrowRight'); await page.waitForTimeout(260);} // ~294
for (let i=0;i<9;i++){ await page.keyboard.press('ArrowDown'); await page.waitForTimeout(260);} // ~126
await P('Enter'); await page.waitForTimeout(300);
r.kbOpen = await page.evaluate(()=>document.getElementById('ntv-host').shadowRoot.getElementById('kb').classList.contains('on'));
await page.screenshot({path:'kb.png'});
// escribir "hola": fila1 q w e r t y u i o p -> h está fila2 col5
const typeChar = async (r_,c_) => { /* ir a fila r_, col c_ desde estado actual */ };
// Usar teclado físico (ev.key) para simplificar
await page.keyboard.type('hola');
// ir a "Ir": abajo 5 veces luego derecha hasta go
await P('ArrowDown',5); await P('ArrowRight',5); await P('Enter');
await page.waitForTimeout(1200);
r.afterSubmitUrl = page.url();
// iframe input
await page.goto('http://localhost:8001/form.html'); await page.waitForTimeout(1200);
await P('ArrowLeft',40); await P('ArrowUp',40);
for (let i=0;i<16;i++){ await page.keyboard.press('ArrowRight'); await page.waitForTimeout(260);} // ~224 -> iframe x 124
for (let i=0;i<24;i++){ await page.keyboard.press('ArrowDown'); await page.waitForTimeout(260);} // ~336 -> iframe y 36
await P('Enter'); await page.waitForTimeout(400);
r.kbOpen2 = await page.evaluate(()=>document.getElementById('ntv-host').shadowRoot.getElementById('kb').classList.contains('on'));
await page.keyboard.type('juan'); await P('ArrowDown',5); await P('ArrowRight',5); await P('Enter'); await page.waitForTimeout(600);
const fr = page.frames().find(f=>f.url().includes('finput'));
r.frame = await fr.evaluate(()=>({v:document.getElementById('fi').value, title:document.title}));
r.errs=errs;
console.log(JSON.stringify(r,null,1));
await browser.close();
