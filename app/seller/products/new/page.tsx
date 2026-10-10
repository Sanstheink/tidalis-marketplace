import Link from 'next/link';
import {requireSeller} from '@/lib/auth';
import {SellerProductEditor} from '@/components/SellerProductEditor';
const notices:Record<string,string>={'invalid-fields':'กรุณาตรวจข้อมูลสินค้า Slug ราคา และสต็อก','slug-taken':'URL สินค้านี้ถูกใช้ในร้านแล้ว','mfa-required':'กรุณายืนยัน MFA และลองอีกครั้ง','save-failed':'บันทึกไม่สำเร็จ โปรดตรวจ Migration 005 สิทธิ์ร้าน และรายละเอียดที่กรอก'};
export default async function NewSellerProduct({searchParams}:{searchParams:Promise<{notice?:string}>}){
  const {client,member}=await requireSeller();
  const [{data:workTypes},{notice}]=await Promise.all([client.from('shop_work_types').select('id,name').eq('shop_id',member.shop_id).order('name'),searchParams]);
  return <div className="container page-pad phase5-page"><div className="eyebrow">SELLER STUDIO / PHASE 5</div>
    <h1>Create <em>artwork.</em></h1><p>สร้างสินค้าในร้านของคุณ จัดเก็บเป็น Draft ก่อนเผยแพร่ทุกครั้ง</p>
    <Link href="/seller/products" className="text-link">← กลับรายการสินค้า</Link>
    {notice&&notices[notice]&&<div className="phase4-alert" role="alert">{notices[notice]}</div>}
    <SellerProductEditor workTypes={workTypes||[]}/></div>;
}
