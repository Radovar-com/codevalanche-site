import { initializeLocale, localizeDocument } from './runtime.js';

const state = await initializeLocale(document);
localizeDocument(document, state.catalog, state.locale);
