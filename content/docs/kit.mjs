// Small building blocks for docs pages. Each returns HTML.
const ICONS = {
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>',
  tip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20zM12 10v4M12 17h.01"/></svg>',
};
/** An on-screen label, written exactly as the app shows it. */
export const ui = text => `<span class="ui-term">${text}</span>`;
export const h2 = (id, text) => `<h2 id="${id}">${text}</h2>`;
export const h3 = text => `<h3>${text}</h3>`;
export const p = (...lines) => lines.map(line => `<p>${line}</p>`).join('\n');
export const list = items => `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
export const steps = items => `<ol class="docs-steps">${items.map(([title, text]) => `<li><strong>${title}</strong>${text ? ` ${text}` : ''}</li>`).join('')}</ol>`;
const callout = kind => text => `<div class="docs-callout ${kind}">${ICONS[kind]}<p>${text}</p></div>`;
export const note = callout('note');
export const tip = callout('tip');
export const warn = callout('warn');
/** rows: [[term, meaning], ...]; head: optional [left, right]. */
export const table = (rows, head) => `<div class="docs-table-wrap"><table class="docs-table">${head ? `<thead><tr>${head.map(cell => `<th>${cell}</th>`).join('')}</tr></thead>` : ''}<tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
export const faq = items => `${h2('faq', 'Questions')}<div class="docs-faq">${items.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`;
export const keys = (...combo) => combo.map(key => `<kbd class="docs-kbd">${key}</kbd>`).join('+');
export const pill = (text, color) => `<span class="docs-pill"${color ? ` style="--c:var(--${color})"` : ''}>${text}</span>`;
export const cards = items => `<div class="docs-cards">${items.map(([href, title, text]) => `<a href="${href}"><strong>${title}</strong><span>${text}</span></a>`).join('')}</div>`;
