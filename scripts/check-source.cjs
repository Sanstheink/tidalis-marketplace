/* Structural source check; does NOT replace next build or integration tests. */
const fs=require('fs');const path=require('path');const ts=require('typescript');
let files=[];const errors=[];
function walk(dir){for(const entry of fs.readdirSync(dir)){const p=path.join(dir,entry);if(fs.statSync(p).isDirectory()){if(entry!=='node_modules'&&entry!=='.next')walk(p)}else if(/\.(ts|tsx)$/.test(p)&&!p.endsWith('.d.ts'))files.push(p)}}
for(const dir of ['app','components','lib'])walk(dir);
files.push('proxy.ts','next.config.ts');
for(const f of files){const code=fs.readFileSync(f,'utf8');const parsed=ts.createSourceFile(f,code,ts.ScriptTarget.Latest,true,f.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);for(const d of parsed.parseDiagnostics)errors.push(`${f}: ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`);
  const imports=code.matchAll(/(?:import\s+(?:[^'"\n]*?\s+from\s+)?|import\s*\(|require\s*\()['"](@\/[^'"]+|\.\.?\/[^'"]+)['"]/g);
  for(const found of imports){const local=found[1];const loc=local.startsWith('@/')?local.substring(2):path.join(path.dirname(f),local);if(![loc,loc+'.ts',loc+'.tsx',loc+'.js',loc+'.jsx',path.join(loc,'index.ts'),path.join(loc,'index.tsx')].some(x=>fs.existsSync(x)))errors.push(`${f}: missing ${local}`)}
}
for(const asset of ['public/brand/tidalis-horizontal.png','app/icon.png'])if(!fs.existsSync(asset))errors.push('Missing approved logo asset: '+asset);
for(const needed of ['supabase/migrations/001_identity_catalog.sql','supabase/migrations/002_finance_tax.sql','supabase/migrations/003_phase3_auth_hardening.sql'])if(!fs.existsSync(needed))errors.push('Missing migration: '+needed);
console.log(`Source checks: ${files.length} TypeScript files, ${errors.length} error(s)`);if(errors.length){console.error(errors.join('\n'));process.exitCode=1}
