'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireSeller} from '@/lib/auth';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slug=/^[a-z0-9-]{3,80}$/;

function textValue(value:FormDataEntryValue|null, limit:number){
  if(typeof value!=='string'||value.length>limit)return null;
  return value.trim();
}
function priceToMinor(value:FormDataEntryValue|null){
  if(typeof value!=='string'||!/^\d{1,8}(?:\.\d{1,2})?$/.test(value))return null;
  const [baht,satang='']=value.split('.');
  const minor=Number(baht)*100+Number(satang.padEnd(2,'0'));
  return minor<=1_000_000_000?minor:null;
}
function bounce(reason:string,id?:string){
  return `/seller/products/${id&&uuid.test(id)?id:'new'}?notice=${reason}`;
}

export async function saveSellerProductDraft(form:FormData){
  const {client,member}=await requireSeller();
  if(!['owner','manager','artist'].includes(member.role))redirect('/seller/products?notice=read-only');
  const id=textValue(form.get('productId'),40)||null;
  const name=textValue(form.get('name'),120);
  const productSlug=textValue(form.get('slug'),80);
  const description=textValue(form.get('description'),10000);
  const productType=textValue(form.get('productType'),30);
  const workType=textValue(form.get('workTypeId'),40)||null;
  const exclusive=form.get('exclusive')==='on';
  const stockValue=textValue(form.get('stock'),8);
  const stock=stockValue&&/^\d+$/.test(stockValue)?Number(stockValue):null;
  const personalPrice=priceToMinor(form.get('personalPrice'));
  const commercialPrice=priceToMinor(form.get('commercialPrice'));
  const personalTerms=textValue(form.get('personalTerms'),2500);
  const commercialTerms=textValue(form.get('commercialTerms'),2500);
  if((id&&!uuid.test(id))||!name||name.length<3||!productSlug||!slug.test(productSlug)||
    description===null||!['commission','ready_made','digital_asset'].includes(productType||'')||
    (workType&&!uuid.test(workType))||personalPrice===null||commercialPrice===null||
    personalTerms===null||commercialTerms===null||
    (productType==='commission'&&(exclusive||stock!==null))||
    (exclusive&&(productType!=='ready_made'||stock!==1))||
    (stock!==null&&(stock<0||stock>100000))){
    redirect(bounce('invalid-fields',id||undefined));
  }
  const {data,error}=await client.rpc('save_seller_product_draft',{
    p_shop_id:member.shop_id,p_product_id:id,p_name:name,p_slug:productSlug,
    p_description:description,p_product_type:productType,p_work_type_id:workType,
    p_is_exclusive:exclusive,p_stock:stock,p_personal_price_minor:personalPrice,
    p_personal_terms:personalTerms,p_commercial_price_minor:commercialPrice,
    p_commercial_terms:commercialTerms
  });
  if(error){
    const reason=error.code==='23505'?'slug-taken':
      error.message?.includes('MFA')?'mfa-required':'save-failed';
    redirect(bounce(reason,id||undefined));
  }
  revalidatePath('/seller/products');
  revalidatePath('/seller');
  redirect(`/seller/products/${data}?notice=saved`);
}
