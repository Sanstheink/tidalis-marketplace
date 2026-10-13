import Link from 'next/link';
import {productBlockerLabels,productStatusLabels} from '@/lib/product-readiness';
import {notFound,redirect} from 'next/navigation';
import {requireSeller} from '@/lib/auth';
import {sellerAccessMode} from '@/lib/seller-access';
import {SellerProductEditor} from '@/components/SellerProductEditor';
import {SellerProductFiles} from '@/components/SellerProductFiles';
import {changeSellerProductReview} from '@/app/seller/products/review-actions';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notices:Record<string,string>={saved:'บันทึกฉบับร่างแล้ว คุณสามารถอัปโหลดภาพตัวอย่างและไฟล์ส่งมอบได้','invalid-fields':'โปรดตรวจชื่อสินค้า URL สิทธิ์การใช้งาน และสต็อก','slug-taken':'มีสินค้าที่ใช้ URL นี้อยู่แล้ว','save-failed':'บันทึกไม่สำเร็จ กรุณาตรวจข้อมูลและยืนยัน Authenticator แล้วลองอีกครั้ง','mfa-required':'ต้องเปิด Authenticator ก่อนจัดการสินค้า'};
export default async function SellerEditProduct({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{notice?:string}>}){
  const {id}=await params;if(!uuid.test(id))notFound();
  const {client,member}=await requireSeller();
  const {data:assurance}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const mode=await sellerAccessMode(client);
  const elevated=assurance?.currentLevel==='aal2';
  if(!['owner','manager','artist'].includes(member.role))redirect('/seller/products?notice=read-only');
  const [{data:product,error},{data:licenses},{data:workTypes},{data:files},query]=await Promise.all([
    client.from('products').select('id,shop_id,name,slug,description,product_type,work_type_id,is_exclusive,stock,currency,status,review_note').eq('id',id).eq('shop_id',member.shop_id).maybeSingle(),
    client.from('product_license_prices').select('usage_type,price_minor,terms').eq('product_id',id),
    client.from('shop_work_types').select('id,name').eq('shop_id',member.shop_id).order('name'),
    client.from('product_files').select('id,file_path,is_delivery_file').eq('product_id',id).order('created_at',{ascending:true}),
    searchParams
  ]);
  if(error||!product)notFound();
  const {data:publishBlockers,error:publishError}=await client.rpc('tidalis_product_publish_blockers',{p_product_id:id});
  const mappedFiles=await Promise.all((files||[]).map(async f=>{
    const {data}=!f.is_delivery_file||elevated
      ?await client.storage.from('tidalis-product-files').createSignedUrl(f.file_path,300)
      :{data:null};
    return {...f,url:data?.signedUrl||null};
  }));
  if(product.status!=='draft')return <main className="container page-pad"><Link className="text-link" href="/seller/products">← รายการสินค้า</Link><div className="page-heading"><h1>{product.name}</h1><p>{productStatusLabels[product.status]||product.status} · เก็บข้อมูลเดิมไว้เพื่ออ้างอิงคำสั่งซื้อ</p></div><section className="commerce-card"><p className="order-note">{product.description}</p>{licenses?.map(l=><p key={l.usage_type}>{l.usage_type==='personal'?'Personal':'Commercial'} · {l.price_minor/100} {product.currency} · {l.terms}</p>)}{mappedFiles.map(f=>f.url?<p key={f.id}><a href={f.url} target="_blank" rel="noreferrer">{f.is_delivery_file?'เปิดไฟล์ส่งมอบ':'เปิดภาพตัวอย่าง'} ↗</a></p>:null)}{product.status==='under_review'&&mode.selfPublishing?<><h2>เผยแพร่รายการที่เคยส่งรอตรวจ</h2>{publishError?<p role="alert">ยังตรวจข้อมูลไม่สำเร็จ กรุณาโหลดใหม่</p>:<ul>{(publishBlockers||[]).map((x:string)=><li key={x}>{productBlockerLabels[x]||x}</li>)}</ul>}<form action={changeSellerProductReview}><input name="id" value={id} type="hidden"/><input name="action" value="publish" type="hidden"/><label className="operations-check"><input name="confirmed" value="yes" type="checkbox" required/> ฉันตรวจข้อมูลและไฟล์พร้อมเผยแพร่แล้ว</label><button className="btn btn-primary" type="submit" disabled={!elevated||Boolean(publishError)||(publishBlockers||[]).length>0}>เผยแพร่สินค้าเลย</button></form></>:null}</section></main>;
  return <div className="container page-pad phase5-page"><div className="eyebrow">SELLER STUDIO / PRODUCT DRAFT</div><h1>Edit <em>artwork.</em></h1>
    <p>{product.name} · เฉพาะทีมร้านที่ผ่านการลงทะเบียน Authenticator; การอัปโหลดไฟล์ส่งมอบและการเผยแพร่ต้องยืนยัน Authenticator</p><Link className="text-link" href="/seller/products">← กลับรายการสินค้า</Link>
    {query.notice&&notices[query.notice]&&<div className="phase4-alert" role="status">{notices[query.notice]}</div>}
    {product.review_note&&<div className="phase5-note" role="status">Admin ขอให้แก้ไข: {product.review_note}</div>}
    <SellerProductEditor product={product} workTypes={workTypes||[]} licenses={licenses||[]}/>
    <SellerProductFiles shopId={member.shop_id} productId={product.id} files={mappedFiles} productType={product.product_type} elevated={elevated}/>
    <section className="phase5-panel"><div className="eyebrow">05 / PRODUCT REVIEW</div><h2>{mode.selfPublishing?'เผยแพร่สินค้าของคุณ':'ส่งให้ Admin ตรวจ'}</h2>
    {publishError?<p role="alert">ตรวจความพร้อมไม่ได้ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแล</p>:(publishBlockers||[]).length?<div className="phase5-note"><p>รายการที่ต้องเตรียมก่อนเผยแพร่:</p><ul>{(publishBlockers as string[]).map(x=><li key={x}>{productBlockerLabels[x]||x}</li>)}</ul></div>:<p>{mode.selfPublishing?'ข้อมูลพร้อมแล้ว คุณเผยแพร่ได้ทันที':'ข้อมูลพร้อมสำหรับส่งให้แอดมินตรวจแล้ว'}</p>}
    {!elevated&&<p><Link className="text-link" href={`/mfa?next=${encodeURIComponent(`/seller/products/${id}`)}`}>ยืนยัน Authenticator ก่อนเผยแพร่สินค้า →</Link></p>}
    <form action={changeSellerProductReview}><input type="hidden" name="id" value={id}/><input type="hidden" name="action" value="submit"/>{mode.selfPublishing?<label className="operations-check"><input name="confirmed" value="yes" type="checkbox" required/> ฉันตรวจผลงาน ไฟล์ และสิทธิ์ที่จะเผยแพร่แล้ว</label>:null}<button className="btn btn-primary" type="submit" disabled={!elevated||!mode.available||Boolean(publishError)||(publishBlockers||[]).length>0}>{mode.selfPublishing?'เผยแพร่สินค้าเลย':'ส่งสินค้าให้ Admin ตรวจ'}</button></form></section>
  </div>;
}
