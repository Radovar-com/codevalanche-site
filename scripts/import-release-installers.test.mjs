import test from 'node:test';
import assert from 'node:assert/strict';
const importer = await import('./import-release-installers.mjs').catch(() => ({}));
const filename = 'Codevalanche-Desktop-Setup-1.0.0-stable-abcdef123456.exe';
const published = [{ tag_name: 'v1.0.0', draft: false, prerelease: false, assets: [{ name: filename, digest: `sha256:${'a'.repeat(64)}` }] }];

test('installer metadata is imported from the matching published stable release asset', () => {
  assert.equal(typeof importer.installerMetadata, 'function');
  assert.deepEqual(importer.installerMetadata(published, '1.0.0'), { fileName: filename, sha256: 'a'.repeat(64) });
});

test('import refuses drafts, prereleases, missing or ambiguous assets and unavailable digests', () => {
  assert.equal(typeof importer.installerMetadata, 'function');
  const release = published[0];
  for (const change of [{ draft: true }, { prerelease: true }, { assets: [] }, { assets: [...release.assets, ...release.assets] },
    { assets: [{ name: filename, digest: null }] }, { assets: [{ name: filename, digest: 'sha256:invalid' }] }]) {
    assert.throws(() => importer.installerMetadata([{ ...release, ...change }], '1.0.0'), /1\.0\.0/);
  }
  assert.throws(() => importer.installerMetadata(published, '2.0.0'), /2\.0\.0/);
});
