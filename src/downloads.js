import {downloadLinks} from '../supabase/functions/_shared/downloadManifest.js';
// Core download links initialize independently of the optional analytics SDK.
window.CODEVALANCHE_DOWNLOAD_LINKS=downloadLinks(window.CODEVALANCHE_RELEASE_MANIFEST);
