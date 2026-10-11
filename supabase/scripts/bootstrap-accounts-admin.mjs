import {readFile} from 'node:fs/promises';
import {uuid} from '../functions/_shared/accountContract.ts';
const [snapshotFile,targetId,role='support_readonly']=process.argv.slice(2);
if(!snapshotFile||!uuid.test(targetId||'')||!['owner','accounts_admin','support_readonly'].includes(role)){console.error('Usage: bootstrap-accounts-admin.mjs VERIFIED_SYNTHETIC_OR_SANITIZED_SNAPSHOT.json TARGET_UUID ROLE');process.exitCode=2}
else {
 const snapshot=JSON.parse(await readFile(snapshotFile,'utf8'));
 if(snapshot.authority!=='supabase_auth'||!Array.isArray(snapshot.verifiedUsers)||!snapshot.verifiedUsers.some(u=>u.id===targetId&&u.operatorVerified===true)||!Array.isArray(snapshot.protectedOwnerIds)||snapshot.protectedOwnerIds.some(id=>!uuid.test(id)))throw new Error('Verified canonical identity and protected owner inventory required');
 console.log(JSON.stringify({execute:false,authority:'supabase_auth',targetId,role,protectedOwners:snapshot.protectedOwnerIds.length,ownerReviewRequired:true,sql:`insert into public.codevalanche_admin_memberships(user_id,role,active) values('${targetId}','${role}',true) on conflict(user_id) do update set role=excluded.role,active=true;`}));
}
