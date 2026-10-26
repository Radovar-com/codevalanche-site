// Local Data API adapter: run every SQL operation as the production database role.
// Auth and external providers are supplied separately by each scenario.
const roleQueues=new WeakMap();

export function roleSqlClient(db, role, {claims={}}={}) {
  if (!/^[a-z_]+$/.test(role)) throw new Error('invalid test role');
  const identifier = value => {
    if (!/^[a-z_][a-z_0-9]*$/.test(value)) throw new Error('invalid SQL identifier');
    return `"${value}"`;
  };
  const run = operation => {
    // PGlite has one session: serialize the entire role scope across clients.
    const pending=(roleQueues.get(db)??Promise.resolve()).then(async () => {
      await db.exec(`set role ${role}`);
      try {
        await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);
        return {data:await operation(),error:null};
      } catch (error) { return {data:null,error}; }
      finally { await db.exec('reset role'); }
    });
    roleQueues.set(db,pending.catch(()=>{}));
    return pending;
  };
  return {
    rpc(name,args={}) {
      return run(async () => {
        const keys=Object.keys(args);
        const rows=(await db.query(`select * from public.${identifier(name)}(${keys.map((k,i)=>`${identifier(k)}=>$${i+1}`).join(',')})`,keys.map(k=>args[k]))).rows;
        const fn=(await db.query(`select proretset,t.typtype,t.typname from pg_proc p join pg_type t on t.oid=p.prorettype
          join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`,[name])).rows;
        if (fn.length !== 1) throw new Error(`ambiguous test RPC ${name}`);
        return fn[0].proretset || fn[0].typtype==='c' || fn[0].typname==='record' ? rows : rows[0]?.[name] ?? null;
      });
    },
    from(table) {
      let columns='*',write,values,options={},single=false;
      const filters=[];
      const builder={
        select(value='*') { columns=value;return this; },
        eq(key,value) { filters.push([key,value]);return this; },
        insert(value) { write='insert';values=value;return this; },
        upsert(value,opts={}) { write='upsert';values=value;options=opts;return this; },
        update(value) { write='update';values=value;return this; },
        maybeSingle() { single=true;return this; },
        then(resolve,reject) {
          return run(async () => {
            const params=[];
            const bind=value => { params.push(value);return `$${params.length}`; };
            let sql;
            if (write==='insert'||write==='upsert') {
              const keys=Object.keys(values);
              sql=`insert into public.${identifier(table)}(${keys.map(identifier).join(',')}) values(${keys.map(k=>bind(values[k])).join(',')})`;
              if (write==='upsert') {
                const conflict=options.onConflict ? options.onConflict.split(',') : (await db.query(`select a.attname
                  from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,position)
                  join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
                  where i.indrelid=$1::regclass and i.indisprimary order by k.position`,[`public.${table}`])).rows.map(r=>r.attname);
                if (!conflict.length) throw new Error('upsert requires conflict columns');
                sql+=` on conflict(${conflict.map(identifier).join(',')}) ${options.ignoreDuplicates ? 'do nothing'
                  : `do update set ${keys.map(k=>`${identifier(k)}=excluded.${identifier(k)}`).join(',')}`}`;
              }
            } else if (write==='update') sql=`update public.${identifier(table)} set ${Object.entries(values).map(([k,v])=>`${identifier(k)}=${bind(v)}`).join(',')}`;
            else sql=`select ${columns==='*'?'*':columns.split(',').map(identifier).join(',')} from public.${identifier(table)}`;
            if (filters.length) sql+=` where ${filters.map(([k,v])=>`${identifier(k)}=${bind(v)}`).join(' and ')}`;
            const rows=(await db.query(sql,params)).rows;
            return write ? null : single ? rows[0]??null : rows;
          }).then(resolve,reject);
        },
      };
      return builder;
    },
  };
}
