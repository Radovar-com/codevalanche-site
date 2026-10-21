import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';

test('visitors can only add one to a known download count, never read or write the table', async () => {
  const db = await createSqlFixture();
  try {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await db.query("select public.codevalanche_count_download('download_page_view','macos','ro')");
      await db.query("select public.codevalanche_count_download('download_started','windows-x64','en')");
      // Unknown values are ignored instead of creating new rows.
      await db.query("select public.codevalanche_count_download('page_view','macos','ro')");
      await db.query("select public.codevalanche_count_download('download_started','<script>','en')");
      await db.query("select public.codevalanche_count_download('download_started','windows-x64','xx')");
      await assert.rejects(() => db.query('select * from public.codevalanche_download_counts'), /permission denied/);
      await assert.rejects(() => db.query("insert into public.codevalanche_download_counts(day,metric,platform,locale,count) values(current_date,'download_started','windows-x64','en',999)"), /permission denied/);
      await assert.rejects(() => db.query('update public.codevalanche_download_counts set count = 999'), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const rows = (await db.query('select metric, platform, locale, count::int from public.codevalanche_download_counts order by metric, platform')).rows;
    assert.deepEqual(rows, [
      {metric: 'download_page_view', platform: 'macos', locale: 'ro', count: 2},
      {metric: 'download_started', platform: 'windows-x64', locale: 'en', count: 2},
    ]);
    const columns = (await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='codevalanche_download_counts' order by ordinal_position")).rows.map(row => row.column_name);
    assert.deepEqual(columns, ['day', 'metric', 'platform', 'locale', 'count'], 'only aggregate columns, nothing that identifies a visitor');
    await db.exec('reset role');
  } finally {
    await db.close();
  }
});
