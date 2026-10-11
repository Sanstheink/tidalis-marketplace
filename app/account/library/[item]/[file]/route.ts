import {redirect,notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
export async function GET(_request:Request,{params}:{params:Promise<{item:string;file:string}>}){
 const {item,file}=await params;if(!uuidPattern.test(item)||!uuidPattern.test(file))notFound();
 const {client,user}=await requireUser('/account/library');
 const {data:entitlement}=await client.from('download_entitlements').select('order_item_id').eq('order_item_id',item).eq('buyer_id',user.id).is('revoked_at',null).maybeSingle();if(!entitlement)notFound();
 const {data:orderItem}=await client.from('order_items').select('product_id,item_snapshot').eq('id',item).maybeSingle();if(!orderItem)notFound();
 const {data:productFile}=await client.from('product_files').select('file_path').eq('id',file).eq('product_id',orderItem.product_id).eq('is_delivery_file',true).maybeSingle();if(!productFile)notFound();
 const snapshot=orderItem.item_snapshot as {name?:string};const extension=productFile.file_path.split('.').pop()?.replace(/[^a-z0-9]/gi,'').slice(0,10)||'bin';
 const filename=(snapshot?.name||'artwork').replace(/[\x00-\x1f/\\"<>:|?*]/g,'-').slice(0,100)+'.'+extension;
 const {data,error}=await client.storage.from('tidalis-product-files').createSignedUrl(productFile.file_path,60,{download:filename});
 if(error||!data)return new Response('ยังดาวน์โหลดไม่ได้ กรุณาลองใหม่',{status:503,headers:{'Cache-Control':'no-store'}});redirect(data.signedUrl);
}
