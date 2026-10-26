import test from 'node:test';
import assert from 'node:assert/strict';
const search = await import('../src/docs/search-core.js').catch(() => null);

test('guide search matches localized text, accents, case and all query words', () => {
  assert.equal(typeof search?.searchGuide, 'function', 'local guide search exists');
  const pages = [
    {url:'/ro/docs/installation/', title:'Instalare', description:'Primii pași', text:'Instalare pe Windows, avertisment.'},
    {url:'/ro/docs/files/', title:'Fișiere', description:'Modificări', text:'Verifică fișierele și modificările.'},
    {url:'/ar/docs/installation/', title:'التثبيت', description:'Windows', text:'خطوات التثبيت على Windows'},
    {url:'/ja/docs/settings/', title:'設定', description:'表示言語', text:'テーマと表示言語を選ぶ'},
  ];
  assert.equal(search.searchGuide(pages, '  FISIERE  ')[0]?.url, '/ro/docs/files/');
  assert.equal(search.searchGuide(pages, 'windows avertisment').length, 1);
  assert.equal(search.searchGuide(pages, 'windows nonexistent').length, 0);
  assert.equal(search.searchGuide(pages, 'التثبيت')[0]?.url, '/ar/docs/installation/');
  assert.equal(search.searchGuide(pages, '表示言語')[0]?.url, '/ja/docs/settings/');
  for (const query of ['', '   ', '!!!', '<script>alert(1)</script>', 'x'.repeat(300)]) assert.deepEqual(search.searchGuide(pages, query), []);
});

test('title matches come first and results are bounded without mutating the index', () => {
  assert.equal(typeof search?.searchGuide, 'function');
  const pages=Array.from({length:25},(_,i)=>({url:`/docs/${i}/`,title:i===24?'Windows':'Other',description:'',text:'Windows'}));
  const before=JSON.stringify(pages);
  const result=search.searchGuide(pages,'windows');
  assert.equal(result[0].title,'Windows');
  assert.equal(result.length,20);
  assert.equal(JSON.stringify(pages),before);
});
