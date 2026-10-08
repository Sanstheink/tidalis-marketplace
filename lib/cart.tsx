'use client';
import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import type {License} from '@/lib/catalog';
export type CartLine={key:string; productId:string; license:License; quantity:number};
type CartContextValue={lines:CartLine[]; add:(productId:string,license:License,qty?:number)=>void; remove:(key:string)=>void; update:(key:string,qty:number)=>void; clear:()=>void; hydrated:boolean};
const CartContext=createContext<CartContextValue|null>(null);
export function CartProvider({children}:{children:React.ReactNode}){
  const [lines,setLines]=useState<CartLine[]>([]); const [hydrated,setHydrated]=useState(false);
  useEffect(()=>{try{const raw=localStorage.getItem('tidalis:cart:v1');if(raw){const saved:unknown=JSON.parse(raw);if(Array.isArray(saved))setLines(saved.filter(x=>x&&typeof x.productId==='string'&&['personal','commercial'].includes(x.license)&&Number.isInteger(x.quantity)&&x.quantity>0));}}catch{}setHydrated(true)},[]);
  useEffect(()=>{if(hydrated)localStorage.setItem('tidalis:cart:v1',JSON.stringify(lines))},[lines,hydrated]);
  const value=useMemo<CartContextValue>(()=>({lines,hydrated,add:(productId,license,qty=1)=>setLines(old=>{const key=`${productId}:${license}`;const existing=old.find(x=>x.key===key);return existing?old.map(x=>x.key===key?{...x,quantity:Math.min(20,x.quantity+qty)}:x):[...old,{key,productId,license,quantity:Math.min(20,qty)}]}),remove:(key)=>setLines(old=>old.filter(x=>x.key!==key)),update:(key,qty)=>setLines(old=>old.map(x=>x.key===key?{...x,quantity:Math.max(1,Math.min(20,qty))}:x)),clear:()=>setLines([])}),[lines,hydrated]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export const useCart=()=>{const value=useContext(CartContext);if(!value)throw new Error('CartProvider missing');return value};
