// The Windows installer's file name, by version. Up to 1.1.76 the build named it
// Codevalanche-Desktop-Setup-<version>-stable-<12 hex>.exe; from 1.1.77 it is
// simply Codevalanche-Setup-<version>.exe.
export const SIMPLE_NAME_FROM = [1, 1, 77];
const parts = version => /^\d+\.\d+\.\d+$/.test(version ?? '') ? version.split('.').map(Number) : null;
const atLeast = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return true; };

export function usesSimpleName(version) {
  const v = parts(version);
  if (!v) throw new Error(`Not a version: ${version}`);
  return atLeast(v, SIMPLE_NAME_FROM);
}

/** The exact file name from 1.1.77 on; null for older versions, whose names carry a build id. */
export function installerFileName(version) {
  return usesSimpleName(version) ? `Codevalanche-Setup-${version}.exe` : null;
}

export function isInstallerFileName(version, fileName) {
  if (usesSimpleName(version)) return fileName === installerFileName(version);
  return new RegExp(`^Codevalanche-Desktop-Setup-${version.replace(/\./g, '\\.')}-stable-[0-9a-f]{12}\\.exe$`).test(fileName ?? '');
}

/** Either form, any version: used to count downloads across releases. */
export const ANY_INSTALLER = /^(?:Codevalanche-Setup-\d+\.\d+\.\d+|Codevalanche-Desktop-Setup-.+-stable-.+)\.exe$/;

/** The release asset address on the releases repository for one version. */
export function releaseAssetUrl(repository, version, fileName = installerFileName(version)) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error(`Not a repository: ${repository}`);
  if (!isInstallerFileName(version, fileName)) throw new Error(`${fileName} is not the installer name for ${version}`);
  return `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(fileName)}`;
}
