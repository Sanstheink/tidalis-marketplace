const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
module.exports=function load(file,overrides={}) {
  const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const loaded={exports:{}};
  function localRequire(name){
    if(Object.hasOwn(overrides,name))return overrides[name];
    if(name.startsWith('@/'))return load(path.join(process.cwd(),name.slice(2)+'.ts'),overrides);
    return require(name);
  }
  new Function('require','module','exports',compiled)(localRequire,loaded,loaded.exports);
  return loaded.exports;
};
