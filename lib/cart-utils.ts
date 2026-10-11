import {products,priceFor,quantityLimit,type License,type Product} from './catalog';

export type CartLine={key:string;productId:string;license:License;quantity:number};
export type ResolvedLine={line:CartLine;product:Product;unitPrice:number;subtotal:number};
export type CartGroup={shopSlug:string;shopName:string;lines:ResolvedLine[];subtotal:number};

export const lineKey=(id:string,license:License)=>`${id}:${license}`;

export function normalizeCartLines(value:unknown):CartLine[]{
  if(!Array.isArray(value))return [];
  const result:CartLine[]=[];
  for(const item of value){
    if(!item || typeof item!=='object')continue;
    const raw=item as Record<string,unknown>;
    const product=products.find(p=>p.id===raw.productId && p.pricingMode==='fixed');
    if(!product || (raw.license!=='personal'&&raw.license!=='commercial'))continue;
    if(typeof raw.quantity!=='number' || !Number.isInteger(raw.quantity) || raw.quantity<1)continue;
    const license=raw.license as License;
    const quantity=Math.min(raw.quantity,quantityLimit(product));
    if(quantity<1)continue;
    // An exclusive work is a single item, irrespective of the license option selected.
    if(product.exclusive && result.some(l=>l.productId===product.id))continue;
    const key=lineKey(product.id,license);
    const existing=result.find(l=>l.key===key);
    if(existing)existing.quantity=Math.min(quantityLimit(product),existing.quantity+quantity);
    else result.push({key,productId:product.id,license,quantity});
  }
  return result;
}

export function resolveLines(lines:CartLine[]):ResolvedLine[]{
  return normalizeCartLines(lines).flatMap(line=>{
    const product=products.find(p=>p.id===line.productId);
    if(!product)return [];
    const unitPrice=priceFor(product,line.license);
    return [{line,product,unitPrice,subtotal:unitPrice*line.quantity}];
  });
}

export function groupByShop(lines:CartLine[]):CartGroup[]{
  const groups:CartGroup[]=[];
  for(const row of resolveLines(lines)){
    let group=groups.find(g=>g.shopSlug===row.product.shopSlug);
    if(!group){group={shopSlug:row.product.shopSlug,shopName:row.product.shopName,lines:[],subtotal:0};groups.push(group)}
    group.lines.push(row);group.subtotal+=row.subtotal;
  }
  return groups;
}