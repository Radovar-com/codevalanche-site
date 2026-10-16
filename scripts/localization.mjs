import { parse, serialize } from 'parse5';
import { LOCALES } from '../src/locales/manifest.js';

const SKIP_TEXT_TAGS = new Set(['script', 'style', 'template', 'code', 'pre', 'kbd', 'samp']);
const TRANSLATABLE_ATTRIBUTES = new Set(['alt', 'aria-label', 'placeholder', 'title']);

function normalized(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function localeFor(value) {
  const key = String(value ?? '').toLowerCase();
  return LOCALES.find(locale => locale.tag.toLowerCase() === key || locale.slug === key) ?? null;
}

function visit(node, callback, parentExcluded = false) {
  const excluded = parentExcluded || SKIP_TEXT_TAGS.has(node.tagName);
  callback(node, excluded);
  for (const child of node.childNodes ?? []) visit(child, callback, excluded);
}

function translatableMetaContent(node) {
  if (node.tagName !== 'meta') return false;
  const attributes = new Map((node.attrs ?? []).map(attribute => [attribute.name, attribute.value]));
  const name = (attributes.get('name') ?? '').toLowerCase();
  const property = (attributes.get('property') ?? '').toLowerCase();
  return ['description', 'twitter:title', 'twitter:description', 'twitter:image:alt'].includes(name)
    || ['og:title', 'og:description', 'og:image:alt'].includes(property);
}

function isLanguageListText(node) {
  for (let parent = node.parentNode; parent; parent = parent.parentNode) {
    const classes = parent.attrs?.find(attribute => attribute.name === 'class')?.value ?? '';
    if (parent.tagName === 'ul' && classes.split(/\s+/).includes('lang-grid')) return true;
  }
  return false;
}

function translate(value, translations, missing) {
  const source = normalized(value);
  if (!source) return value;
  const result = translations[source];
  if (typeof result !== 'string' || !result.trim()) {
    missing.add(source);
    return value;
  }
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  return `${leading}${result}${trailing}`;
}

export function extractTranslationUnits(html) {
  const document = parse(html);
  const units = new Set();
  visit(document, (node, excluded) => {
    if (node.nodeName === '#text' && !excluded) {
      const value = normalized(node.value ?? '');
      if (value) units.add(value);
      return;
    }
    if (node.tagName && TRANSLATABLE_ATTRIBUTES.size) {
      for (const attribute of node.attrs ?? []) {
        if (TRANSLATABLE_ATTRIBUTES.has(attribute.name) && normalized(attribute.value)) units.add(normalized(attribute.value));
        if (attribute.name === 'content' && translatableMetaContent(node) && normalized(attribute.value)) units.add(normalized(attribute.value));
      }
    }
  });
  return [...units];
}

export function renderTranslatedHtml(html, translations, targetLocale) {
  const locale = localeFor(targetLocale);
  if (!locale) throw new Error(`Unknown locale: ${targetLocale}`);
  const document = parse(html);
  const missing = new Set();
  visit(document, (node, excluded) => {
    if (node.nodeName === '#text' && !excluded && !isLanguageListText(node)) {
      node.value = translate(node.value ?? '', translations, missing);
      return;
    }
    if (!node.tagName) return;
    for (const attribute of node.attrs ?? []) {
      if (TRANSLATABLE_ATTRIBUTES.has(attribute.name)
        || attribute.name === 'content' && translatableMetaContent(node)) {
        attribute.value = translate(attribute.value, translations, missing);
      }
      if (node.tagName === 'html' && attribute.name === 'lang') attribute.value = locale.tag;
      if (node.tagName === 'html' && attribute.name === 'dir') attribute.value = locale.dir;
    }
    if (node.tagName === 'html' && !node.attrs?.some(attribute => attribute.name === 'dir')) {
      node.attrs ??= [];
      node.attrs.push({ name: 'dir', value: locale.dir });
    }
  });
  if (missing.size) {
    const sample = [...missing].slice(0, 8).map(value => JSON.stringify(value)).join(', ');
    throw new Error(`Incomplete translation catalog for ${locale.tag}; ${missing.size} missing: ${sample}`);
  }
  return serialize(document);
}
