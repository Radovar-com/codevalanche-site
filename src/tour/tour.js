// Progressive enhancement: without this module all six steps remain readable.
const tour = document.querySelector('[data-tour]');
if (tour) {
  const tablist = tour.querySelector('[data-tour-tabs]');
  const tabs = [...tour.querySelectorAll('[data-tour-tab]')];
  const panels = [...tour.querySelectorAll('[data-tour-panel]')];
  const previous = tour.querySelector('[data-tour-previous]');
  const next = tour.querySelector('[data-tour-next]');
  const progress = tour.querySelector('[data-tour-progress]');
  let current = 0;
  const rtl = () => getComputedStyle(tour).direction === 'rtl';

  const show = (index, focus = false) => {
    current = Math.max(0, Math.min(index, panels.length - 1));
    tabs.forEach((tab, i) => {
      const selected = i === current;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[i].hidden = !selected;
    });
    previous.setAttribute('aria-disabled', String(current === 0));
    next.setAttribute('aria-disabled', String(current === panels.length - 1));
    progress.textContent = `${current + 1} / ${panels.length}`;
    tour.querySelector('[data-tour-status]').textContent = tabs[current].textContent.trim();
    // Only the selected panel's image needs to load now.
    panels[current].querySelector('img').loading = 'eager';
    if (focus) tabs[current].focus({ preventScroll: true });
    // Keep the active step visible in the horizontal phone navigation, without
    // scrolling the document or animating against reduced-motion preferences.
    const tab = tabs[current];
    const bounds = tablist.getBoundingClientRect();
    const item = tab.getBoundingClientRect();
    if (item.left < bounds.left || item.right > bounds.right) tablist.scrollBy({ left: item.left < bounds.left ? item.left - bounds.left : item.right - bounds.right, behavior: 'instant' });
  };

  tablist.setAttribute('role', 'tablist');
  tabs.forEach((tab, i) => {
    tab.setAttribute('role', 'tab');
    panels[i].setAttribute('role', 'tabpanel');
    panels[i].setAttribute('aria-labelledby', tab.id);
    panels[i].tabIndex = 0;
    tab.addEventListener('click', () => show(i));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const forward = event.key === (rtl() ? 'ArrowLeft' : 'ArrowRight');
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (forward ? 1 : -1) + tabs.length) % tabs.length;
      show(index, true);
    });
  });
  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));

  // Native vertical scrolling and pinch zoom remain available. Only a single
  // horizontal touch on the capture changes steps; mouse selection is untouched.
  let gesture = null;
  let suppressClickUntil = 0;
  tour.querySelectorAll('.tour-image-link').forEach(image => {
    image.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch') return;
      if (gesture) { gesture = null; return; }
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    image.addEventListener('pointercancel', () => { gesture = null; });
    image.addEventListener('pointerup', event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      gesture = null;
      if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
      suppressClickUntil = performance.now() + 400;
      show(current + ((rtl() ? dx > 0 : dx < 0) ? 1 : -1));
    });
    image.addEventListener('click', event => {
      if (performance.now() < suppressClickUntil) event.preventDefault();
    });
  });

  const syncTheme = () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    tour.querySelectorAll('[data-tour-dark]').forEach(node => {
      const value = theme === 'dark' ? node.dataset.tourDark : node.dataset.tourLight;
      node.setAttribute(node.tagName === 'SOURCE' ? 'srcset' : 'src', value);
      if (node.tagName === 'IMG') node.closest('a').href = value;
    });
  };
  window.addEventListener('codevalanche-theme', syncTheme);
  syncTheme();
  show(0);
  tablist.hidden = false;
  tour.querySelector('[data-tour-controls]').hidden = false;
  tour.querySelector('[data-tour-help]').hidden = false;
}
