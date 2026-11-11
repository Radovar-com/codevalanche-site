import { renderReleaseActions } from '../src/release-actions.js';
import { renderDownloadLanding } from '../src/download-experience.js';

const { manifest, catalog } = JSON.parse(document.getElementById('download-layout-data').textContent);
const translate = (text, variables = {}) => (catalog[text] ?? text)
  .replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`);
// The full locale service may be late or unavailable. Retain the native labels
// already used by this document rather than painting English in the meantime.
window.CodevalancheDownloadTranslate = translate;
const visitor = { userAgent: navigator.userAgent, userAgentData: navigator.userAgentData, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints };
renderReleaseActions(document, manifest, visitor, translate);
// Layout initialization must never send a counter or start a file download.
renderDownloadLanding(document, manifest, visitor, translate, { count: false });
