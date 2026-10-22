export function createAccountSecurity(client,{isRecovery=()=>false,assertRemoval=async()=>{throw new Error('reauthentication_required')}}={}) {
 let factor=null,verified=false,requiresFreshVerification=false,generation=0
 const guard=()=>{if(isRecovery())throw new Error('recovery_restricted')}
 const checked=result=>{if(result.error)throw result.error;return result.data}
 return {
  state:()=>({factor,verified,requiresFreshVerification}),
  clear:()=>{generation++;factor=null;verified=false;requiresFreshVerification=false},
  async enroll({replacePending=false}={}){
   guard();const turn=++generation
   const current=()=>{guard();if(turn!==generation)throw new Error('account_request_superseded')}
   if(replacePending){
    const listed=checked(await client.auth.mfa.listFactors());current()
    const unfinished=(listed?.all||[]).filter(f=>f.factor_type==='totp'&&f.status==='unverified'&&f.friendly_name==='Codevalanche authenticator')
    for(const pending of unfinished){checked(await client.auth.mfa.unenroll({factorId:pending.id}));current()}
   }
   const data=checked(await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Codevalanche authenticator'}));current();factor=data;verified=false;return data
  },
  async verify(code,factorId=factor?.id){guard();if(!factorId||!/^\d{6}$/.test(code))throw new Error('invalid_fields');const enrollment=!!factor;const turn=generation;const challenge=checked(await client.auth.mfa.challenge({factorId}));if(turn!==generation)throw new Error('account_request_superseded');const data=checked(await client.auth.mfa.verify({factorId,challengeId:challenge.id,code}));if(turn!==generation)throw new Error('account_request_superseded');verified=true;requiresFreshVerification=enrollment;factor=null;return data},
  async cancel(){guard();const pending=factor;if(!pending||verified)return;const turn=++generation;checked(await client.auth.mfa.unenroll({factorId:pending.id}));if(turn!==generation)throw new Error('account_request_superseded');factor=null;verified=false},
  async remove(factorId){guard();const turn=generation;await assertRemoval();guard();if(turn!==generation)throw new Error('account_request_superseded');checked(await client.auth.mfa.unenroll({factorId}));generation++;factor=null;verified=false},
  async factors(){const turn=generation;const data=checked(await client.auth.mfa.listFactors())?.totp||[];if(turn!==generation)throw new Error('account_request_superseded');return data}
 }
}
