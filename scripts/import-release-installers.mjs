import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadReleases } from './changelog.mjs';

// Refresh release metadata from the public release host before reviewing a release.
// The site build uses only these checked-in records and never needs network access.
export function installerMetadata(published, version) {
  const release = published.find(item => item.tag_name === `v${version}` && !item.draft && !item.prerelease);
  const prefix = `Codevalanche-Desktop-Setup-${version}-stable-`;
  const assets = release?.assets?.filter(asset => asset.name?.startsWith(prefix) && asset.name.endsWith('.exe')) ?? [];
  if (assets.length !== 1 || !/^sha256:[a-f0-9]{64}$/.test(assets[0].digest ?? '')) {
    throw new Error(`${version}: one published stable installer with a SHA-256 digest is required`);
  }
  return { fileName: assets[0].name, sha256: assets[0].digest.slice(7) };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(await readFile(path.join(root, 'supabase/functions/_shared/download-manifest.json'), 'utf8'));
  const url = new URL(manifest.assets.find(asset => asset.qualified && asset.platform === 'windows').targetUrl);
  const [, owner, repo] = url.pathname.split('/');
  if (url.hostname !== 'github.com' || !owner || !repo) throw new Error('Expected the configured public release host');
  const published = [];
  for (let page = 1; ; page++) {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=100&page=${page}`, {
      headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Release metadata request failed: ${response.status}`);
    const batch = await response.json();
    published.push(...batch);
    if (batch.length < 100) break;
  }
  const directory = path.join(root, 'content/releases');
  const releases = await loadReleases(directory);
  // Validate all records before writing any of them.
  const updated = releases.map(release => ({ ...release, installer: installerMetadata(published, release.version) }));
  for (const release of updated) await writeFile(path.join(directory, `${release.version}.json`), `${JSON.stringify(release, null, 2)}\n`);
  console.log(`Imported installer metadata for ${updated.length} published releases`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
