import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function buildAnalytics({radovarRoot=process.env.OWNED_ANALYTICS_RADOVAR_ROOT,check=false}={}){
 const result=await build({entryPoints:[path.join(root,'src/analytics/core/client.js')],bundle:true,write:false,format:'esm',minify:true,target:['es2022'],legalComments:'none',plugins:[{name:'event-contract-only',setup(b){b.onLoad({filter:/contract\.schema\.json$/},async args=>{const schema=JSON.parse(await readFile(args.path,'utf8'));return {contents:JSON.stringify({$defs:{WebsiteEventV1:schema.$defs.WebsiteEventV1,BatchReceipt:schema.$defs.BatchReceipt}}),loader:'json'};});}}]});
 // A single minified line without a final newline keeps raw SHA stable under Git autocrlf.
 const bundle=Buffer.from(result.outputFiles[0].text.replace(/\r?\n$/,''),'utf8'),sha256=createHash('sha256').update(bundle).digest('hex'),sourceFiles=['client','page','sections','transport','sanitizer','registry','consent','quality'];const sourceHash=createHash('sha256');for(const file of sourceFiles)sourceHash.update((await readFile(path.join(root,`src/analytics/core/${file}.js`),'utf8')).replace(/\r\n/g,'\n'));sourceHash.update((await readFile(path.join(root,'supabase/contracts/website-analytics/v1/contract.schema.json'),'utf8')).replace(/\r\n/g,'\n'));
 if(/[\r\n]/.test(bundle.toString('utf8')))throw new Error('Analytics distribution must contain no CR or LF');
 const manifest=JSON.stringify({sdkVersion:'1.0.0',contractVersion:1,sha256,sourceSha256:sourceHash.digest('hex'),bytes:bundle.length,format:'esm',asset:'owned-analytics.js'},null,2)+'\n';
 for(const directory of [path.join(root,'src/analytics'),...(radovarRoot?[path.join(radovarRoot,'public/analytics')]:[])]){if(check){if(!(await readFile(path.join(directory,'owned-analytics.js'))).equals(Buffer.from(bundle))||(await readFile(path.join(directory,'manifest.json'),'utf8')).replace(/\r\n/g,'\n')!==manifest)throw new Error('Analytics distribution drift');}else{await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'owned-analytics.js'),bundle);await writeFile(path.join(directory,'manifest.json'),manifest);}}
 console.log(`${check?'Verified':'Built'} owned analytics 1.0.0 ${sha256} (${bundle.length} bytes) ${radovarRoot?"identical C/R":"C distribution"}`);return {sha256};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildAnalytics({check:process.argv.includes('--check'),radovarRoot:process.argv.includes('--radovar-root')?process.argv[process.argv.indexOf('--radovar-root')+1]:process.env.OWNED_ANALYTICS_RADOVAR_ROOT});
