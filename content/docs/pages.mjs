// The documentation, in reading order. Each section file holds its pages.
// Every statement is checked against the app (1.1.68/1.1.69) and its own wording.
import start from './sections/start.mjs';
import ais from './sections/ais.mjs';
import { localModels, projects } from './sections/local-projects.mjs';
import agents from './sections/agents.mjs';
import { app, privacy } from './sections/app.mjs';
import help from './sections/help.mjs';

export const DOCS_VERSION = '1.1.68';
export const DOCS_UPDATED = '2026-11-13';
export const DOCS_SECTIONS = [start, ais, localModels, projects, agents, app, privacy, help];
