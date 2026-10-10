import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {requireSeller} from '@/lib/auth';
import {SellerProductEditor} from '@/components/SellerProductEditor';
import {SellerProductFiles} from '@/components/SellerProductFiles';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notices:Record<string,string>={saved:'บันทึก Draft สำเร็จ คุณสามารถอัปโหลดไฟล์สินค้าแบบ Private ได้แล้ว','invalid-fields':'โปรดตรวจชื่อสินค้า URL License และสต็อก','slug-taken':'มีสินค้าที่ใช้ URL นี้อยู่แล้ว','save-failed':'บันทึกไม่สำเร็จ กรุณาตรวจสิทธิ์ MFA, Migration 005 และรายการที่กรอก','mfa-required':'ต้องเปิด MFA ก่อนจัดการสินค้า'};
export default async function SellerEditProduct({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{notice?:string}>}){
  const {id}=await params;if(!uuid.test(id))notFound();
  const {client,member}=await requireSeller();
  if(!['owner','manager','artist'].includes(member.role))redirect('/seller/products?notice=read-only');
  const [{data:product,error},{data:licenses},{data:workTypes},{data:files},query]=await Promise.all([
    client.from('products').select('id,shop_id,name,slug,description,product_type,work_type_id,is_exclusive,stock,status').eq('id',id).eq('shop_id',member.shop_id).maybeSingle(),
    client.from('product_license_prices').select('usage_type,price_minor,terms').eq('product_id',id),
    client.from('shop_work_types').select('id,name').eq('shop_id',member.shop_id).order('name'),
    client.from('product_files').select('id,file_path,is_delivery_file').eq('product_id',id).order('created_at',{ascending:true}),
    searchParams
  ]);
  if(error||!product)notFound();
  if(product.status!=='draft')return <div className="container page-pad"><h1>Product <em>locked.</em></h1><p>สินค้าต้องอยู่สถานะ Draft จึงจะแก้ไขได้</p><Link className="text-link" href="/seller/products">กลับรายการสินค้า</Link></div>;
  const mappedFiles=await Promise.all((files||[]).map(async f=>{
    const {data}=await client.storage.from('tidalis-product-files').createSignedUrl(f.file_path,300);
    return {...f,url:data?.signedUrl||null};
  }));
  return <div className="container page-pad phase5-page"><div className="eyebrow">SELLER STUDIO / PRODUCT DRAFT</div><h1>Edit <em>artwork.</em></h1>
    <p>{product.name} · เฉพาะทีมร้านที่ได้รับสิทธิ์และผ่าน MFA</p><Link className="text-link" href="/seller/products">← กลับรายการสินค้า</Link>
    {query.notice&&notices[query.notice]&&<div className="phase4-alert" role="status">{notices[query.notice]}</div>}
    <SellerProductEditor product={product} workTypes={workTypes||[]} licenses={licenses||[]}/>
    <SellerProductFiles shopId={member.shop_id} productId={product.id} files={mappedFiles} productType={product.product_type}/>
  </div>;
}
