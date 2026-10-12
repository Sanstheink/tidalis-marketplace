export const schemaQuery="select jsonb_build_object('columns',(select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',udt_name,'nullable',is_nullable) order by table_name,ordinal_position) from information_schema.columns where table_schema='public'),'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'source',p.prosrc,'config',p.proconfig,'definer',p.prosecdef,'acl',p.proacl) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' and not exists(select 1 from pg_depend d where d.objid=p.oid and d.classid='pg_proc'::regclass and d.deptype='e')),'policies',(select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'roles',roles,'cmd',cmd,'qual',qual,'check',with_check) order by schemaname,tablename,policyname) from pg_policies where schemaname in ('public','storage'))) as schema_audit;";
/** Normalize SQL tokens while preserving string literals and quoted identifiers. */
export function sqlTokens(source){
 return (source.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z0-9_]*|\d+|[^\s]/g)||[])
  .filter(token=>!token.startsWith('--')&&!token.startsWith('/*'))
  .map(token=>token.startsWith("'")||token.startsWith('"')?token:token.toLowerCase());
}
export function schemaDifferences(expected,actual){
 const differences=[];
 for(const group of ['columns','functions','policies']){
  const key=row=>group==='columns'?`${row.table}.${row.column}`:group==='functions'?`${row.schema}.${row.name}(${row.args})`:`${row.schema}.${row.table}.${row.name}`;
  const found=new Map(actual[group].map(row=>[key(row),row]));
  for(const row of expected[group]){
   const other=found.get(key(row));if(!other){differences.push(`missing ${group}: ${key(row)}`);continue;}
   const fields=group==='columns'?['type','nullable']:group==='functions'?['source','config','definer']:['roles','cmd','qual','check'];
   for(const field of fields){const value=x=>field==='source'?sqlTokens(x[field]):x[field];if(JSON.stringify(value(row))!==JSON.stringify(value(other)))differences.push(`${group}: ${key(row)} (${field})`);}
  }
 }
 return differences;
}
