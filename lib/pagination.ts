export function pageWindow(value:unknown,pageSize=25){
 const raw=typeof value==='string'?value:'';
 const page=/^\d+$/.test(raw)?Math.min(10000,Math.max(1,Number(raw))):1;
 return {page,pageSize,from:(page-1)*pageSize,to:page*pageSize-1};
}
export function pageHref(path:string,page:number,params:Record<string,string|undefined>={},key='page'){
 const query=new URLSearchParams();
 for(const [name,value] of Object.entries(params))if(value&&name!==key)query.set(name,value);
 if(page>1)query.set(key,String(page));
 return path+(query.size?'?'+query.toString():'');
}
