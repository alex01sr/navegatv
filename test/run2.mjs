import { createRequire } from 'module';
const require = createRequire('/Users/alexanderreyes/.npm/_npx/9833c18b2d85bc59/node_modules/');
const { chromium } = require('playwright');
import fs from 'fs';
const code = fs.readFileSync('../dist/navegatv.js','utf8').replace("https://duckduckgo.com/?navegatv=home","http://localhost:8001/other.html?navegatv=home");
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(code);
const page = await ctx.newPage();
const errs=[]; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:8001/top.html');
await page.waitForTimeout(800);
// Menú -> Guardar en favoritos (5º item)
await page.keyboard.press('Escape'); for (let i=0;i<4;i++) await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
await page.waitForURL(/navegatv=home/); await page.waitForTimeout(800);
const favs = await page.evaluate(() => localStorage.getItem('ntv_favs'));
await page.screenshot({ path: 'home.png' });
// abrir barra de búsqueda y escribir dirección
await page.keyboard.press('Enter'); await page.waitForTimeout(200);
await page.keyboard.type('localhost:8001/top.html?y=2');
// 'localhost:8001' no tiene punto -> se volvería búsqueda; probar con 127.0.0.1
await page.keyboard.press('Control+a'); await page.keyboard.type('http://127.0.0.1:8001/top.html?y=2');
await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
console.log(JSON.stringify({ favs, url: page.url(), errs }, null, 1));
await browser.close();
