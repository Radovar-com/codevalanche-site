(() => {
  const html = document.documentElement;
  try {
    const raw = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('codevalanche_language='))?.slice('codevalanche_language='.length) ?? '';
    const preference = decodeURIComponent(raw).toLowerCase();
    const supported = {
      ar: ['ar', 'rtl'], de: ['de', 'ltr'], es: ['es', 'ltr'], fr: ['fr', 'ltr'], hi: ['hi', 'ltr'],
      id: ['id', 'ltr'], it: ['it', 'ltr'], ja: ['ja', 'ltr'], ko: ['ko', 'ltr'], 'pt-br': ['pt-BR', 'ltr'],
      ro: ['ro', 'ltr'], ru: ['ru', 'ltr'], tr: ['tr', 'ltr'], vi: ['vi', 'ltr'],
      'zh-hans': ['zh-Hans', 'ltr'], 'zh-hant': ['zh-Hant', 'ltr'],
    }[preference];
    if (supported) {
      html.lang = supported[0];
      html.dir = supported[1];
      html.dataset.localePending = 'true';
    }
  } catch {}
})();
