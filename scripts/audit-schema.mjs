import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFileSync,readdirSync} from 'node:fs';
import {schemaQuery,schemaDifferences} from '../tests/db/schema-contract.mjs';
// Export schemaQuery with a read-only hosted query; pass its schema_audit JSON.
// This audit does not need a secret key and never writes to the hosted project.
if(!process.argv[2]){console.error('Usage: node scripts/audit-schema.mjs <hosted-schema.json>');process.exit(1)}
const actual=JSON.parse(readFileSync(process.argv[2],'utf8'));
const db=new PGlite({extensions:{pgcrypto}});
try{
 await db.waitReady;await db.exec(readFileSync('tests/db/supabase-model.sql','utf8'));
 for(const name of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(`supabase/migrations/${name}`,'utf8'));
 const expected=(await db.query(schemaQuery)).rows[0].schema_audit;
 const differences=schemaDifferences(expected,actual);
 console.log(`${expected.columns.length} columns, ${expected.functions.length} application functions, ${expected.policies.length} policies checked`);
 for(const difference of differences)console.error(difference);
 console.log(`${differences.length} schema/function differences`);if(differences.length)process.exitCode=1;
}catch(error){console.error(error.message);process.exitCode=1}finally{await db.close()}
