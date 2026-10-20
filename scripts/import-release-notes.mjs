import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateRelease } from './changelog.mjs';

// Run once per published version:
//   node scripts/import-release-notes.mjs <desktop app checkout> <version>
// It copies the app's "What's new" notes (lib/desktop/whats-new/v<version>.ts,
// every language) and the release date from the app's CHANGELOG.md into
// content/releases/<version>.json. Nothing is written when a language is missing.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function importReleaseNotes(appRoot, version, { date, outputDirectory = path.join(ROOT, 'content', 'releases') } = {}) {
  const notesFile = path.join(appRoot, 'lib', 'desktop', 'whats-new', `v${version}.ts`);
  const module = await import(pathToFileURL(notesFile).href);
  const notes = Object.values(module).find(value => value && typeof value === 'object' && value.version === version && value.copy);
  if (!notes) throw new Error(`${notesFile} does not export the notes for ${version}`);
  let releaseDate = date;
  if (!releaseDate) {
    const changelog = await readFile(path.join(appRoot, 'CHANGELOG.md'), 'utf8');
    const heading = changelog.match(new RegExp(`^## v${version.replace(/\./g, '\\.')} [—-] (\\d{4}-\\d{2}-\\d{2})\\s*$`, 'm'));
    if (!heading) throw new Error(`CHANGELOG.md has no dated "## v${version} — YYYY-MM-DD" heading; pass --date`);
    releaseDate = heading[1];
  }
  const copy = Object.fromEntries(Object.entries(notes.copy).map(([tag, value]) => [tag, {
    headline: value.headline,
    summary: value.summary,
    sections: value.sections.map(section => ({ title: section.title, body: section.body, ...(section.detail ? { detail: section.detail } : {}) })),
  }]));
  const release = validateRelease({ version, date: releaseDate, copy }, `v${version}.ts`);
  await mkdir(outputDirectory, { recursive: true });
  const output = path.join(outputDirectory, `${version}.json`);
  await writeFile(output, `${JSON.stringify(release, null, 2)}\n`);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [appRoot, version, ...rest] = process.argv.slice(2);
  const dateIndex = rest.indexOf('--date');
  if (!appRoot || !version) throw new Error('Usage: node scripts/import-release-notes.mjs <desktop app checkout> <version> [--date YYYY-MM-DD]');
  const output = await importReleaseNotes(path.resolve(appRoot), version, { date: dateIndex >= 0 ? rest[dateIndex + 1] : undefined });
  console.log(`Wrote ${path.relative(ROOT, output)}`);
}
