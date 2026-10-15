import manifest from './download-manifest.json' with {type:'json'};
import {qualifiedAssets,downloadRegistry} from './downloadManifest.js';
export {qualifiedAssets};
export const trustedDownloadManifest=manifest;
export const releaseRegistry=downloadRegistry;
