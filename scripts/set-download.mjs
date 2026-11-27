#!/usr/bin/env node
// Points the download manifest at one released Windows installer. From 1.1.77
// the file name comes from the rule (Codevalanche-Setup-<version>.exe); older
// versions need --file with their build-id name.
//   node scripts/set-download.mjs --version 1.1.77 --size <bytes> --sha256 <hex>
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installerFileName, releaseAssetUrl } from './installer-name.mjs';

const REPO = 'Radovar-com/codevalanche-desktop-releases';
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase/functions/_shared/download-manifest.json');
const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map(a => a.split(/\s+/)));
const version = args.version, size = Number(args.size), sha256 = String(args.sha256 ?? '').toLowerCase();
const fileName = args.file ?? installerFileName(version);
if (!fileName) throw new Error(`${version} is older than 1.1.77: pass --file with its installer name`);
if (!Number.isInteger(size) || size <= 0) throw new Error('--size must be the installer size in bytes');
if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('--sha256 must be 64 hex characters');
const targetUrl = releaseAssetUrl(REPO, version, fileName);
const manifest = JSON.parse(await readFile(file, 'utf8'));
const asset = manifest.assets.find(a => a.siteId === 'codevalanche' && a.platform === 'windows');
if (!asset) throw new Error('The manifest has no Windows asset to update');
Object.assign(asset, { releaseId: version, targetUrl, display: { version, fileName, sizeBytes: size, sha256 } });
await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`download manifest: ${version} -> ${fileName}`);
