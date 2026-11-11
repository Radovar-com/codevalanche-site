import {readFile,readdir} from 'node:fs/promises';
import {createSqlFixture} from './sqlHarness.mjs';

export async function createAccessFixture({legacyTableGrants=false,...options}={}) {
  if (!legacyTableGrants) return createSqlFixture(options);
  // Reproduce historical Supabase defaults before any application table exists.
  const db=await createSqlFixture({through:'0'});
  try {
    await db.exec('alter default privileges in schema public grant all on tables to anon,authenticated,service_role');
    const root=new URL('../migrations/',import.meta.url);
    for (const file of (await readdir(root)).filter(f=>f.endsWith('.sql')&&(!options.through||f<=options.through)).sort()) {
      await db.exec(await readFile(new URL(file,root),'utf8'));
    }
    return db;
  } catch (error) { await db.close();throw error; }
}
