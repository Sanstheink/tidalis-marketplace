import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
const scripts=readdirSync('scripts').filter(file=>/^test-.*\.(cjs|mjs)$/.test(file)).sort();
for(const file of ['check-source.cjs',...scripts]){
  const result=spawnSync(process.execPath,[`scripts/${file}`],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
}
for(const args of [['--test',...readdirSync('tests/unit').filter(f=>f.endsWith('.test.cjs')).map(f=>`tests/unit/${f}`)],['tests/db/regression.mjs'],['tests/db/fixed-orders.mjs'],['tests/db/payments.mjs']]){
  const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
}
