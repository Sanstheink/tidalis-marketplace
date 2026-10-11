'use client';
import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import type {PublicProduct} from './public-catalog-shared';
import {liveLineKey,normalizeLiveCart,type LiveCartLine,type LiveLicense} from './marketplace-cart-utils';
type Cart={lines:LiveCartLine[];hydrated:boolean;add:(product:PublicProduct,license:LiveLicense,quantity:number)=>void;update:(key:string,quantity:number)=>void;remove:(key:string)=>void;clearShop:(shopId:string)=>void};
const Context=createContext<Cart|null>(null);
export function MarketplaceCartProvider({children}:{children:React.ReactNode}){
  const [lines,setLines]=useState<LiveCartLine[]>([]);const [hydrated,setHydrated]=useState(false);
  useEffect(()=>{try{setLines(normalizeLiveCart(JSON.parse(localStorage.getItem('tidalis:marketplace-cart:v1')||'[]')))}catch{}setHydrated(true)},[]);
  useEffect(()=>{if(hydrated)try{localStorage.setItem('tidalis:marketplace-cart:v1',JSON.stringify(lines))}catch{}},[lines,hydrated]);
  const value=useMemo<Cart>(()=>({lines,hydrated,
    add:(product,license,quantity)=>setLines(old=>{
      if(product.pricingMode!=='fixed'||!product.licenses.some(l=>l.usageType===license)||!Number.isInteger(quantity)||quantity<1)return old;
      const item:LiveCartLine={productId:product.id,shopId:product.shopId,license,quantity:Math.min(product.exclusive?1:20,quantity)};
      const list=product.exclusive?old.filter(l=>l.productId!==product.id):old;
      const existing=list.find(l=>liveLineKey(l)===liveLineKey(item));
      if(existing)return list.map(l=>l===existing?{...l,quantity:Math.min(20,l.quantity+item.quantity)}:l);
      return list.length>=20?list:[...list,item];
    }),
    update:(key,quantity)=>setLines(old=>old.map(l=>liveLineKey(l)===key?{...l,quantity:Math.max(1,Math.min(20,Math.trunc(quantity)||1))}:l)),
    remove:key=>setLines(old=>old.filter(l=>liveLineKey(l)!==key)),clearShop:shopId=>setLines(old=>old.filter(l=>l.shopId!==shopId))
  }),[lines,hydrated]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMarketplaceCart(){const context=useContext(Context);if(!context)throw Error('MarketplaceCartProvider missing');return context;}
