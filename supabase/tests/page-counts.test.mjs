import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';

test('visitors can only add one to a known page count, never read or write the table', async () => {
  const db = await createSqlFixture();
  try {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await db.query("select public.count_site_page('codevalanche','home','visit','search','ro')");
      await db.query("select public.count_site_page('codevalanche','home','page_view','search','ro')");
      // Unknown values are ignored instead of creating new rows.
      await db.query("select public.count_site_page('codevalanche','<script>','visit','search','ro')");
      await db.query("select public.count_site_page('codevalanche','home','session','search','ro')");
      await db.query("select public.count_site_page('codevalanche','home','visit','https://example.com/x','ro')");
      await db.query("select public.count_site_page('codevalanche','home','visit','search','xx')");
      await db.query("select public.count_site_page('example','home','visit','search','ro')");
      await assert.rejects(() => db.query('select * from public.site_page_counts'), /permission denied/);
      await assert.rejects(() => db.query("insert into public.site_page_counts(day,site,page_id,metric,source,locale,count) values(current_date,'codevalanche','home','visit','direct','en',999)"), /permission denied/);
      await assert.rejects(() => db.query('update public.site_page_counts set count = 999'), /permission denied/);
      await db.exec('reset role');
    }
    const rows = (await db.query('select site, page_id, metric, source, locale, count::int from public.site_page_counts order by metric')).rows;
    assert.deepEqual(rows, [
      {site: 'codevalanche', page_id: 'home', metric: 'page_view', source: 'search', locale: 'ro', count: 2},
      {site: 'codevalanche', page_id: 'home', metric: 'visit', source: 'search', locale: 'ro', count: 2},
    ]);
    const columns = (await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='site_page_counts' order by ordinal_position")).rows.map(row => row.column_name);
    assert.deepEqual(columns, ['day', 'site', 'page_id', 'metric', 'source', 'locale', 'count']);
  } finally {
    await db.close();
  }
});
