import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
// through: apply migrations up to and including this file name (default: all).
export async function createSqlFixture({through}={}) {
 const {PGlite}=await import(process.env.ACCOUNT_PGLITE_MODULE?pathToFileURL(process.env.ACCOUNT_PGLITE_MODULE).href:'@electric-sql/pglite');
 const db=await PGlite.create();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create role authenticator nologin;
 create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now(),last_sign_in_at timestamptz,raw_user_meta_data jsonb default '{}',encrypted_password text,banned_until timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz default now(),updated_at timestamptz default now(),user_agent text,not_after timestamptz);
 create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,status text,factor_type text,secret text);
 create table auth.mfa_amr_claims(session_id uuid references auth.sessions(id) on delete cascade,authentication_method text,created_at timestamptz default now(),updated_at timestamptz default now());`);
 const root=new URL('../migrations/',import.meta.url);
 for(const file of (await readdir(root)).filter(f=>f.endsWith('.sql')&&(!through||f<=through)).sort()) {
  try {await db.exec(await readFile(new URL(file,root),'utf8'))}catch(error){await db.exec('rollback');await db.close();throw new Error(`${file}: ${error.message}`)}
 }
 return db;
}
