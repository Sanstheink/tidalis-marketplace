'use client';
import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {products,quantityLimit,type License} from '@/lib/catalog';
import {lineKey,normalizeCartLines,type CartLine} from '@/lib/cart-utils';
export type {CartLine} from '@/lib/cart-utils';
type CartContextValue={lines:CartLine[]; add:(productId:string,license:License,qty?:number)=>void; remove:(key:string)=>void; update:(key:string,qty:number)=>void; clear:()=>void; hydrated:boolean};
const CartContext=createContext<CartContextValue|null>(null);
export function CartProvider({children}:{children:React.ReactNode}){
  const [lines,setLines]=useState<CartLine[]>([]); const [hydrated,setHydrated]=useState(false);
  useEffect(()=>{try{const raw=localStorage.getItem('tidalis:cart:v1');if(raw)setLines(normalizeCartLines(JSON.parse(raw)));}catch{}setHydrated(true)},[]);
  useEffect(()=>{if(hydrated){try{localStorage.setItem('tidalis:cart:v1',JSON.stringify(lines))}catch{/* unavailable browser storage */}}},[lines,hydrated]);
  const value=useMemo<CartContextValue>(()=>({lines,hydrated,
    add:(productId,license,qty=1)=>setLines(old=>{
      const product=products.find(p=>p.id===productId && p.pricingMode==='fixed');
      if(!product||!Number.isInteger(qty)||qty<1)return old;
      const key=lineKey(productId,license);
      const withoutConflictingExclusive=product.exclusive?old.filter(l=>l.productId!==productId||l.license===license):old;
      const existing=withoutConflictingExclusive.find(x=>x.key===key);
      const limit=quantityLimit(product);
      return existing?withoutConflictingExclusive.map(x=>x.key===key?{...x,quantity:Math.min(limit,x.quantity+qty)}:x):[...withoutConflictingExclusive,{key,productId,license,quantity:Math.min(limit,qty)}];
    }),
    remove:(key)=>setLines(old=>old.filter(x=>x.key!==key)),
    update:(key,qty)=>setLines(old=>old.map(x=>{
      if(x.key!==key)return x;const product=products.find(p=>p.id===x.productId);
      return {...x,quantity:Math.max(1,Math.min(product?quantityLimit(product):20,Math.trunc(qty)||1))};
    })),clear:()=>setLines([])}),[lines,hydrated]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export const useCart=()=>{const value=useContext(CartContext);if(!value)throw new Error('CartProvider missing');return value};
