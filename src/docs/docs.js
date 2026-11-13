// Docs: search (Ctrl+K or /), "On this page" highlight, mobile navigation.
// Search reads the full text of every docs page from /docs/search-index.json,
// written by the build; until it loads, it searches the navigation.
const nav = document.querySelector('.docs-nav')
const dialog = document.querySelector('.docs-dialog')
const input = dialog?.querySelector('input')
const list = dialog?.querySelector('ul')
const pages = [...(nav?.querySelectorAll('li a') ?? [])].map(a => ({ title: a.textContent.trim(), href: a.getAttribute('href'), section: a.closest('ul')?.previousElementSibling?.textContent.trim() ?? '' }))
// Each section of this page is searchable by its full text, not only its heading.
const pageTitle = document.querySelector('.docs-article h1')?.textContent.trim() ?? ''
const here = [...document.querySelectorAll('.docs-article h2[id]')].map(h => {
  let body = ''
  for (let node = h.nextElementSibling; node && node.tagName !== 'H2'; node = node.nextElementSibling) body += ` ${node.textContent}`
  return { title: h.textContent.trim(), href: `#${h.id}`, section: pageTitle, body }
})
const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
let selected = 0
let fullIndex = null
async function loadIndex() {
  if (fullIndex) return
  try {
    const response = await fetch('/docs/search-index.json', { credentials: 'same-origin' })
    if (response.ok) fullIndex = (await response.json()).map(item => ({ title: item.title, href: item.href, section: item.section, body: `${item.nav} ${item.text}` }))
  } catch {}
  if (fullIndex && dialog?.open) render(input.value)
}

function render(query) {
  const words = fold(query).split(/\s+/).filter(Boolean)
  // A word also matches its close forms: "merge" finds "merging".
  const matches = (text, word) => text.includes(word) || (word.length > 4 && text.includes(word.slice(0, -1)))
  const pool = fullIndex ? [...here, ...fullIndex] : [...pages, ...here]
  const score = item => words.reduce((sum, word) => sum + (fold(item.title).includes(word) ? 3 : 0), 0)
  const hits = pool.filter(item => words.every(word => matches(fold(`${item.title} ${item.section} ${item.body ?? ''}`), word)))
    .sort((a, b) => score(b) - score(a)).slice(0, 12)
  selected = 0
  list.replaceChildren(...(hits.length ? hits.map((item, index) => {
    const li = document.createElement('li')
    const a = document.createElement('a')
    a.href = item.href
    a.textContent = item.title
    if (index === 0) a.setAttribute('aria-selected', 'true')
    const small = document.createElement('small')
    small.textContent = item.section
    a.append(small)
    li.append(a)
    return li
  }) : [Object.assign(document.createElement('li'), { className: 'empty', textContent: list.dataset.empty })]))
}
function open() {
  if (!dialog) return
  dialog.showModal()
  loadIndex()
  input.value = ''
  render('')
  input.focus()
}
document.querySelector('.docs-search')?.addEventListener('click', open)
document.addEventListener('keydown', event => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')
  if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing)) { event.preventDefault(); open() }
})
input?.addEventListener('input', () => render(input.value))
input?.addEventListener('keydown', event => {
  const links = [...list.querySelectorAll('a')]
  if (!links.length) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    links[selected]?.removeAttribute('aria-selected')
    selected = (selected + (event.key === 'ArrowDown' ? 1 : links.length - 1)) % links.length
    links[selected].setAttribute('aria-selected', 'true')
    links[selected].scrollIntoView({ block: 'nearest' })
  } else if (event.key === 'Enter') { event.preventDefault(); links[selected].click(); dialog.close() }
})
list?.addEventListener('click', event => { if (event.target.closest('a')) dialog.close() })

document.querySelector('.docs-nav-toggle')?.addEventListener('click', event => {
  const isOpen = nav.classList.toggle('open')
  event.currentTarget.setAttribute('aria-expanded', String(isOpen))
})

const tocLinks = new Map([...document.querySelectorAll('.docs-toc a')].map(a => [a.getAttribute('href').slice(1), a]))
if (tocLinks.size && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      for (const link of tocLinks.values()) link.classList.remove('on')
      tocLinks.get(entry.target.id)?.classList.add('on')
    }
  }, { rootMargin: '-80px 0px -70% 0px' })
  for (const id of tocLinks.keys()) { const target = document.getElementById(id); if (target) observer.observe(target) }
}
