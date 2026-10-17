import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractTranslationUnits } from './localization.mjs';
import { ensureLanguagePicker } from './locale-export.mjs';
import { LOCALES, MARKETING_PAGES } from '../src/locales/manifest.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PAGES = [
  ...MARKETING_PAGES.map(page => page.file), 'account.html',
  'account/index.html', 'account/authorize/index.html', 'account/signed-in/index.html',
];
const MARKETING_SOURCE_FILES = new Set(MARKETING_PAGES.map(page => page.file));

export async function collectSiteStrings(root = ROOT) {
  const source = path.join(root, 'src');
  const sharedHeader = await readFile(path.join(source, 'partials/header.html'), 'utf8');
  const sharedFooter = await readFile(path.join(source, 'partials/footer.html'), 'utf8');
  const homepage = (await readFile(path.join(source, 'index.html'), 'utf8')).replace('<!-- site-footer -->', sharedFooter);
  const footerPicker = homepage.match(/<details class="lang-picker">[\s\S]*?<\/details>/)?.[0];
  if (!footerPicker) throw new Error('The source footer language picker could not be found');
  const units = new Set();
  for (const relativePath of SOURCE_PAGES) {
    let html = await readFile(path.join(source, relativePath), 'utf8');
    html = html.replace('<!-- site-header -->', sharedHeader).replace('<!-- site-footer -->', sharedFooter);
    if (MARKETING_SOURCE_FILES.has(relativePath)) html = ensureLanguagePicker(html, footerPicker);
    for (const unit of extractTranslationUnits(html)) units.add(unit);
  }
  const runtimeStrings = JSON.parse(await readFile(path.join(source, 'locales', 'runtime-strings.en.json'), 'utf8'));
  for (const unit of runtimeStrings) units.add(unit);
  return [...units].sort((a, b) => a.localeCompare(b, 'en'));
}

export async function writeEnglishCatalog(root = ROOT) {
  const strings = await collectSiteStrings(root);
  const catalog = Object.fromEntries(strings.map(value => [value, value]));
  const output = path.join(root, 'src', 'locales', 'en.json');
  await writeFile(output, `${JSON.stringify(catalog, null, 2)}\n`);
  return { count: strings.length, output };
}

export async function validateLocaleCatalogs(root = ROOT, locales = LOCALES) {
  const sourceCatalog = JSON.parse(await readFile(path.join(root, 'src', 'locales', 'en.json'), 'utf8'));
  const sourceKeys = Object.keys(sourceCatalog);
  const failures = [];
  for (const locale of locales.filter(item => item.slug)) {
    const file = path.join(root, 'src', 'locales', `${locale.slug}.json`);
    let catalog;
    try {
      catalog = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      failures.push(`${locale.tag}: catalog is missing or invalid`);
      continue;
    }
    const missing = sourceKeys.filter(key => typeof catalog[key] !== 'string' || !catalog[key].trim());
    const extra = Object.keys(catalog).filter(key => !(key in sourceCatalog));
    const placeholderMismatches = sourceKeys.filter(key => typeof catalog[key] === 'string'
      && JSON.stringify([...key.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match => match[1]).sort())
        !== JSON.stringify([...catalog[key].matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match => match[1]).sort()));
    if (missing.length || extra.length || placeholderMismatches.length) failures.push(`${locale.tag}: ${missing.length} missing, ${extra.length} stale, ${placeholderMismatches.length} placeholder mismatches`);
  }
  if (failures.length) throw new Error(`Locale catalogs are incomplete:\n${failures.join('\n')}`);
  return { locales: locales.length, strings: sourceKeys.length };
}

export async function validateEnglishSourceCatalog(root = ROOT) {
  const expected = await collectSiteStrings(root);
  const catalog = JSON.parse(await readFile(path.join(root, 'src', 'locales', 'en.json'), 'utf8'));
  const missing = expected.filter(key => typeof catalog[key] !== 'string' || !catalog[key].trim());
  const extra = Object.keys(catalog).filter(key => !expected.includes(key));
  if (missing.length || extra.length) throw new Error(`English source catalog mismatch: ${missing.length} missing, ${extra.length} stale strings`);
  return { strings: expected.length };
}

async function main() {
  const command = process.argv[2];
  if (command === 'extract') {
    const result = await writeEnglishCatalog();
    console.log(`Extracted ${result.count} unique website strings to ${path.relative(ROOT, result.output)}`);
    return;
  }
  if (command === 'check') {
    const english = await validateEnglishSourceCatalog();
    const result = await validateLocaleCatalogs();
    console.log(`Validated ${english.strings} English source strings and ${result.strings} entries for ${result.locales} locales`);
    return;
  }
  throw new Error('Usage: node scripts/translate-site.mjs <extract|check>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
