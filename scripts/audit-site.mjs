import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import lighthouse from 'lighthouse';
import desktop from 'lighthouse/core/config/desktop-config.js';
import assert from 'node:assert/strict';
import { LOCALES, MARKETING_PAGES, localizedMarketingPath } from '../src/locales/manifest.js';

// Redirect stdout to an external evidence file. Results are never written into
// the source tree; browser traffic is restricted to the local static preview.
const mode = process.argv[2];
const origin = new URL(process.argv[3] ?? 'http://127.0.0.1:4173');
if (!['lighthouse', 'accessibility'].includes(mode)) throw new Error('Usage: node scripts/audit-site.mjs lighthouse|accessibility [local origin]');
if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Audits require the local IPv4 preview origin');
const languages = LOCALES.filter(locale => ['en', 'ro', 'ar'].includes(locale.tag));
const rows = [];
const browser = await chromium.launch({ headless: true, args: mode === 'lighthouse' ? ['--remote-debugging-port=9222'] : [] });
let failures = 0;

async function keyboardChecks(page, mobile, route) {
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.skip-link').evaluate(el => el === document.activeElement), true, 'first Tab reaches skip link');
  await page.waitForFunction(() => {
    const el = document.querySelector('.skip-link');
    const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
    return el === document.activeElement && rect.top >= 0 && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
  });
  assert.equal(await page.locator('.skip-link').evaluate(el => {
    const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
    return rect.top >= 0 && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
  }), true, 'skip link has visible keyboard focus');
  // Reach controls using Tab only, activate with the keyboard, then verify state.
  async function tabTo(selector) {
    for (let index = 0; index < 150; index++) {
      if (await page.evaluate(selector => document.activeElement?.matches(selector), selector)) return;
      await page.keyboard.press('Tab');
    }
    throw new Error(`Keyboard could not reach ${selector}`);
  }
  if (mobile) {
    await tabTo('.mobile-nav > summary');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.mobile-nav').getAttribute('open'), '');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.mobile-nav-panel').evaluate(el => el.contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.mobile-nav').getAttribute('open'), null);
  }
  await tabTo('[data-theme-toggle]');
  const theme = await page.locator('html').getAttribute('data-theme');
  await page.keyboard.press('Enter');
  assert.notEqual(await page.locator('html').getAttribute('data-theme'), theme);
  await page.keyboard.press('Enter');
  if (route === '/') {
    await tabTo('#tab-brief');
    const next = await page.locator('html').getAttribute('dir') === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.press(next);
    assert.equal(await page.locator('#tab-execution').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await page.locator('#tab-brief').getAttribute('aria-selected'), 'true');
  }
  await tabTo('.lang-picker > summary');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.lang-picker').getAttribute('open'), '');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.lang-grid').evaluate(el => el.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.lang-picker').getAttribute('open'), null);
  assert.equal(await page.locator('.lang-picker > summary').evaluate(el => el === document.activeElement), true);
  // A reload can restore the browser's old sequential-focus starting point.
  // Cycle to the actual skip link, then activate it using only the keyboard.
  await tabTo('.skip-link');
  await page.keyboard.press('Enter');
  await page.waitForURL(url => url.hash === '#main');
  assert.equal(new URL(page.url()).hash, '#main', 'skip link reaches main content');
}
try {
  for (const locale of languages) for (const route of MARKETING_PAGES) {
    if (mode === 'lighthouse' && ['/privacy.html', '/terms.html'].includes(route.path)) continue;
    for (const form of ['mobile', 'desktop']) {
      const url = new URL(localizedMarketingPath(route.path, locale.tag), origin).href;
      if (mode === 'lighthouse') {
        const { lhr } = await lighthouse(url, { port: 9222, logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'], blockedUrlPatterns: ['https://*'] }, form === 'desktop' ? desktop : undefined);
        const row = { lang: locale.tag, route: route.path, form, scores: Object.fromEntries(Object.entries(lhr.categories).map(([key, value]) => [key, Math.round(value.score * 100)])), fcp: lhr.audits['first-contentful-paint'].numericValue, lcp: lhr.audits['largest-contentful-paint'].numericValue, cls: lhr.audits['cumulative-layout-shift'].numericValue, tbt: lhr.audits['total-blocking-time'].numericValue, error: lhr.runtimeError, issues: Object.entries(lhr.audits).filter(([, audit]) => audit.score !== null && audit.score < 1).map(([id, audit]) => ({ id, score: audit.score, display: audit.displayValue, details: audit.details })) };
        if (row.error) failures++;
        rows.push(row);
        console.error(`${rows.length}/54 ${url} ${form}: ${JSON.stringify(row.scores)}`);
        continue;
      }
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width: form === 'mobile' ? 390 : 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
        await context.route('**/*', route => new URL(route.request().url()).origin === origin.origin ? route.continue() : route.abort());
        await context.addInitScript(theme => localStorage.setItem('codevalanche_theme', theme), theme);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const response = await page.goto(url);
        assert.equal(response.status(), 200);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => window.CodevalancheLocale && document.querySelector('[data-owned-consent]'));
        assert.equal(await page.locator('html').getAttribute('lang'), locale.tag);
        assert.equal(await page.locator('html').getAttribute('dir'), locale.dir);
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
        let keyboardError;
        try { await keyboardChecks(page, form === 'mobile', route.path); } catch (error) { keyboardError = error.message; }
        const violations = result.violations.map(({ id, impact, help, nodes }) => ({ id, impact, help, nodes: nodes.map(({ target, html, failureSummary }) => ({ target, html, failureSummary })) }));
        const row = { lang: locale.tag, route: route.path, form, theme, violations, incomplete: result.incomplete.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) })), keyboardError, errors };
        rows.push(row);
        if (violations.length || keyboardError || errors.length) failures++;
        console.error(`${rows.length}/132 ${url} ${form}/${theme}: ${violations.length} violations; keyboard ${keyboardError ?? 'OK'}`);
        await context.close();
      }
    }
  }
} finally { await browser.close(); }
console.log(JSON.stringify(rows, null, 2));
if (failures) process.exitCode = 1;
