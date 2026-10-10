import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {requireSeller} from '@/lib/auth';
import {SellerProductEditor} from '@/components/SellerProductEditor';
import {SellerProductFiles} from '@/components/SellerProductFiles';
import {changeSellerProductReview} from '@/app/seller/products/review-actions';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notices:Record<string,string>={saved:'บันทึก Draft สำเร็จ คุณสามารถอัปโหลดไฟล์สินค้าแบบ Private ได้แล้ว','invalid-fields':'โปรดตรวจชื่อสินค้า URL License และสต็อก','slug-taken':'มีสินค้าที่ใช้ URL นี้อยู่แล้ว','save-failed':'บันทึกไม่สำเร็จ กรุณาตรวจสิทธิ์ MFA, Migration 005 และรายการที่กรอก','mfa-required':'ต้องเปิด MFA ก่อนจัดการสินค้า'};
export default async function SellerEditProduct({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{notice?:string}>}){
  const {id}=await params;if(!uuid.test(id))notFound();
  const {client,member}=await requireSeller();
  const {data:assurance}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const elevated=assurance?.currentLevel==='aal2';
  if(!['owner','manager','artist'].includes(member.role))redirect('/seller/products?notice=read-only');
  const [{data:product,error},{data:licenses},{data:workTypes},{data:files},query]=await Promise.all([
    client.from('products').select('id,shop_id,name,slug,description,product_type,work_type_id,is_exclusive,stock,status,review_note').eq('id',id).eq('shop_id',member.shop_id).maybeSingle(),
    client.from('product_license_prices').select('usage_type,price_minor,terms').eq('product_id',id),
    client.from('shop_work_types').select('id,name').eq('shop_id',member.shop_id).order('name'),
    client.from('product_files').select('id,file_path,is_delivery_file').eq('product_id',id).order('created_at',{ascending:true}),
    searchParams
  ]);
  if(error||!product)notFound();
  if(product.status!=='draft')return <div className="container page-pad"><h1>Product <em>locked.</em></h1><p>สินค้าต้องอยู่สถานะ Draft จึงจะแก้ไขได้</p><Link className="text-link" href="/seller/products">กลับรายการสินค้า</Link></div>;
  const {data:publishBlockers,error:publishError}=await client.rpc('tidalis_product_publish_blockers',{p_product_id:id});
  const mappedFiles=await Promise.all((files||[]).map(async f=>{
    const {data}=!f.is_delivery_file||elevated
      ?await client.storage.from('tidalis-product-files').createSignedUrl(f.file_path,300)
      :{data:null};
    return {...f,url:data?.signedUrl||null};
  }));
  return <div className="container page-pad phase5-page"><div className="eyebrow">SELLER STUDIO / PRODUCT DRAFT</div><h1>Edit <em>artwork.</em></h1>
    <p>{product.name} · เฉพาะทีมร้านที่ผ่านการลงทะเบียน Authenticator; การอัปโหลดไฟล์ส่งมอบและส่งตรวจต้อง AAL2</p><Link className="text-link" href="/seller/products">← กลับรายการสินค้า</Link>
    {query.notice&&notices[query.notice]&&<div className="phase4-alert" role="status">{notices[query.notice]}</div>}
    {product.review_note&&<div className="phase5-note" role="status">Admin ขอให้แก้ไข: {product.review_note}</div>}
    <SellerProductEditor product={product} workTypes={workTypes||[]} licenses={licenses||[]}/>
    <SellerProductFiles shopId={member.shop_id} productId={product.id} files={mappedFiles} productType={product.product_type} elevated={elevated}/>
    <section className="phase5-panel"><div className="eyebrow">05 / PRODUCT REVIEW</div><h2>ส่งให้ Admin ตรวจ</h2>
    {publishError?<p role="alert">ตรวจความพร้อมไม่ได้ กรุณาตรวจ Migration 008</p>:(publishBlockers||[]).length?<div className="phase5-note"><p>รายการที่ต้องแก้ก่อนส่งตรวจ:</p><ul>{(publishBlockers as string[]).map(x=><li key={x}>{x}</li>)}</ul></div>:<p>ข้อมูลพร้อมสำหรับส่งให้ Admin ตรวจแล้ว · การส่งตรวจยังไม่เผยแพร่สินค้า</p>}
    {!elevated&&<p><Link className="text-link" href={`/mfa?next=${encodeURIComponent(`/seller/products/${id}`)}`}>ยืนยัน Authenticator ก่อนส่งสินค้าให้ตรวจ →</Link></p>}
    <form action={changeSellerProductReview}><input type="hidden" name="id" value={id}/><input type="hidden" name="action" value="submit"/><button className="btn btn-primary" type="submit" disabled={!elevated||Boolean(publishError)||(publishBlockers||[]).length>0}>ส่งสินค้าให้ Admin ตรวจ</button></form></section>
  </div>;
}
