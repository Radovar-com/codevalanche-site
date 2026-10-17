import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { MARKETING_PAGES } from '../src/locales/manifest.js';

const root = path.resolve('dist');
const artifacts = path.resolve('../_build/site-redesign');
await mkdir(artifacts, { recursive: true });
const server = createServer(async (req, res) => {
  let name = new URL(req.url, 'http://localhost').pathname;
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, `.${name}`);
  if (!file.startsWith(root + path.sep)) { res.writeHead(400); res.end(); return; }
  try {
    const data = await readFile(file);
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp':'image/webp', '.json':'application/json' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'text/html');
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
const results = [];

// Resolve actual CSS colors (including color-mix) and composite transparent ancestors.
function auditTextContrast() {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = color => {
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
    const data = [...ctx.getImageData(0, 0, 1, 1).data]; data[3] /= 255; return data;
  };
  const lum = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const readings = [...document.querySelectorAll('#details *, #workflow h2, #workflow h3, .nav-signin, .button-primary')]
    .filter(el => el.textContent.trim() && (!el.children.length || el.matches('.nav-signin, .button-primary')) && el.getClientRects().length)
    .map(el => {
      const chain = []; for (let p = el; p; p = p.parentElement) chain.push(p);
      let bg = [255, 255, 255];
      for (const p of chain.reverse()) { const c = rgba(getComputedStyle(p).backgroundColor); bg = c.slice(0, 3).map((v, i) => v * c[3] + bg[i] * (1 - c[3])); }
      const style = getComputedStyle(el), fg = rgba(style.color);
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      return { text: el.textContent.trim().slice(0, 50), ratio: +((hi + .05) / (lo + .05)).toFixed(2) };
    });
  return { minimum: Math.min(...readings.map(x => x.ratio)), failures: readings.filter(x => x.ratio < 4.5) };
}

try {
  for (const width of [1440, 1024, 768, 390, 320]) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: width > 900 ? 1000 : 844 }, reducedMotion: 'reduce' });
      await page.route('https://**/*', route => route.abort());
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(theme => localStorage.setItem('codevalanche_theme', theme), theme);
      await page.context().addCookies([{ name: 'codevalanche_consent', value: 'declined', url: origin }]);
      await page.goto(origin);
      await page.waitForFunction(() => window.CodevalancheAnalytics?.consentManager);
      const bannerDecline = page.getByRole('button', {name:'Decline',exact:true});
      if (await bannerDecline.isVisible()) await bannerDecline.click();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Home overflow ${width}/${theme}`);
      const contrast = await page.evaluate(auditTextContrast);
      assert.deepEqual(contrast.failures, [], `Contrast ${width}/${theme}`);
      const signIn = page.locator('.nav-signin');
      assert.equal(await signIn.isVisible(), true);
      assert.ok((await signIn.boundingBox()).x >= 0);
      const primary = page.locator('.hero .hero-actions .button-primary');
      assert.ok((await primary.boundingBox()).y < 844, 'Primary CTA in initial viewport');
      // Tabs support click and keyboard; FAQ expands in place.
      await page.locator('#tab-review').click();
      assert.equal(await page.locator('#panel-review').isVisible(), true);
      await page.locator('#tab-review').press('Home');
      assert.equal(await page.locator('#panel-brief').isVisible(), true);
      await page.locator('.faq-list summary').first().click();
      assert.equal(await page.locator('.faq-list details').first().getAttribute('open'), '');
      await page.locator('.faq-list summary').first().click();
      // Actual theme toggle updates and persists between public pages.
      await page.locator('[data-theme-toggle]').click();
      assert.equal(await page.evaluate(() => localStorage.getItem('codevalanche_theme')), theme === 'light' ? 'dark' : 'light');
      await page.locator('[data-theme-toggle]').click();
      await page.evaluate(() => scrollTo(0, 0));
      if ([1440, 390].includes(width)) {
        const label = width === 1440 ? 'desktop' : 'mobile';
        await page.screenshot({ path: path.join(artifacts, `${label}-${theme}.png`) });
        await page.locator('#details').screenshot({ path: path.join(artifacts, `details-${label}-${theme}.png`), style: '.site-header { visibility: hidden; }' });
        if (width === 1440) await page.screenshot({ path: path.join(artifacts, `full-${theme}.png`), fullPage: true, style: '.site-header { position:relative; }' });
      }
      if (width <= 900) {
        await page.locator('.mobile-nav summary').click();
        await page.locator('.mobile-nav-panel a[href="/changelog.html"]').click();
      } else await page.locator('footer a[href="/changelog.html"]').click();
      assert.equal(new URL(page.url()).pathname, '/changelog.html');
      for (const {path:route} of MARKETING_PAGES.filter(page => page.path !== '/')) {
        await page.goto(origin + route);
        await page.locator('[data-theme-toggle]').click();
        assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme === 'light' ? 'dark' : 'light', `Theme toggle ${route}`);
        await page.locator('[data-theme-toggle]').click();
        assert.equal(await page.locator('.nav-signin').isVisible(), true, `Sign in ${route}/${width}/${theme}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow ${route}/${width}/${theme}`);
      }
      await page.goto(origin + '/changelog.html');
      if ([1440, 390].includes(width)) await page.screenshot({ path: path.join(artifacts, `changelog-${width}-${theme}.png`) });
      await page.locator('.nav-signin').click();
      assert.equal(new URL(page.url()).pathname, '/account/');
      await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
      results.push({ width, theme, minimumContrast: contrast.minimum, publicPages: MARKETING_PAGES.length, accountNavigation: 'pass' });
      await page.close();
    }
  }
  // Consent controls work independently of the returning-visitor screenshots.
  const fresh = await browser.newPage();
  await fresh.goto(origin);
  await fresh.getByRole('button',{name:'Decline',exact:true}).click();
  assert.equal(await fresh.locator('.cmp-banner').isVisible(), false);
  await fresh.locator('[data-open-consent]').first().click();
  assert.equal(await fresh.getByRole('dialog',{name:'Cookie preferences'}).isVisible(), true);
  await fresh.keyboard.press('Escape');
  assert.equal(await fresh.getByRole('dialog',{name:'Cookie preferences'}).isVisible(), false);
  await fresh.goto(origin + '/changelog.html');
  await fresh.locator('[data-open-consent]').first().click();
  const analyticsToggle = fresh.getByRole('checkbox',{name:'Website analytics',exact:true});
  assert.equal(await analyticsToggle.isChecked(), false);
  await analyticsToggle.click();
  assert.equal(await analyticsToggle.isChecked(), true);
  await fresh.keyboard.press('Escape');
  await fresh.close();
  assert.deepEqual(errors, []);
  await writeFile(path.join(artifacts, 'verification.json'), JSON.stringify({ results, errors, consent: 'pass', tabs: 'pass', faq: 'pass' }, null, 2));
  console.log(JSON.stringify(results));
  console.log(`PASS: 10 viewport/theme combinations, ${MARKETING_PAGES.length} public pages, account navigation, contrast, tabs, FAQ, consent, no page errors.`);
} finally { await browser.close(); server.close(); }
