import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
process.chdir(root);
function run(args){const r=spawnSync(process.execPath,args,{stdio:'inherit',cwd:root});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1)}
if(!existsSync('dist/server/wrangler.json'))run(['scripts/run-framework.mjs','build']);
mkdirSync('work',{recursive:true});
// Local setup only. The tracked migration remains immutable; request handlers never create tables.
const schema=readFileSync('drizzle/0000_gorgeous_bucky.sql','utf8').replace('CREATE TABLE `workspace_state`','CREATE TABLE IF NOT EXISTS `workspace_state`');
writeFileSync('work/init-local.sql',schema);
run(['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file','work/init-local.sql']);
console.log('\nFrotaGer: demonstração local. Nenhuma publicação será executada.\n');
process.argv=[process.execPath,fileURLToPath(new URL('./run-framework.mjs',import.meta.url)),'dev','--hostname','127.0.0.1'];
await import('./run-framework.mjs');
