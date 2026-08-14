import { chromium } from 'playwright';

const base = 'http://localhost:5000';
const outDir = 'C:\\Users\\ASUSSC~1\\AppData\\Local\\Temp\\claude\\c--Users-ASUSscambi-confrontav2\\6dac621c-b404-4362-8e3e-4678ae27ed57\\scratchpad';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
try {
  await page.waitForSelector('text=Confronta Oroscopo', { timeout: 20000 });
} catch (e) {
  console.log('Selector wait failed:', e.message);
}
await page.screenshot({ path: `${outDir}\\home-fixed-env.png`, fullPage: true });
console.log('Saved home-fixed-env.png');

console.log('--- pageerrors ---');
console.log(errors.length === 0 ? '(none)' : errors.join('\n'));

await browser.close();
