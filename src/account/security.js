export function createAccountSecurity(client,{isRecovery=()=>false,assertRemoval=async()=>{throw new Error('reauthentication_required')}}={}) {
 let factor=null,verified=false,requiresFreshVerification=false,generation=0
 const guard=()=>{if(isRecovery())throw new Error('recovery_restricted')}
 const checked=result=>{if(result.error)throw result.error;return result.data}
 return {
  state:()=>({factor,verified,requiresFreshVerification}),
  clear:()=>{generation++;factor=null;verified=false;requiresFreshVerification=false},
  async enroll(){guard();const turn=++generation;const data=checked(await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Codevalanche authenticator'}));if(turn!==generation)throw new Error('account_request_superseded');factor=data;verified=false;return data},
  async verify(code,factorId=factor?.id){guard();if(!factorId||!/^\d{6}$/.test(code))throw new Error('invalid_fields');const enrollment=!!factor;const turn=generation;const challenge=checked(await client.auth.mfa.challenge({factorId}));if(turn!==generation)throw new Error('account_request_superseded');const data=checked(await client.auth.mfa.verify({factorId,challengeId:challenge.id,code}));if(turn!==generation)throw new Error('account_request_superseded');verified=true;requiresFreshVerification=enrollment;factor=null;return data},
  async cancel(){const pending=factor;if(!pending||verified)return;generation++;factor=null;verified=false;checked(await client.auth.mfa.unenroll({factorId:pending.id}))},
  async remove(factorId){guard();const turn=generation;await assertRemoval();guard();if(turn!==generation)throw new Error('account_request_superseded');checked(await client.auth.mfa.unenroll({factorId}));generation++;factor=null;verified=false},
  async factors(){const turn=generation;const data=checked(await client.auth.mfa.listFactors())?.totp||[];if(turn!==generation)throw new Error('account_request_superseded');return data}
 }
}
