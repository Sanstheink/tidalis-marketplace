import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {SellerApply} from '@/components/SellerApply';

export default async function Apply(){
  const {client,user}=await requireUser('/sell/apply');
  const [{data:policies,error:policyError},{data:applications,error:applicationError},{data:intake,error:intakeError}]=await Promise.all([
    client.from('platform_policy_versions')
      .select('id,version,title,status,effective_from,approved_by')
      .eq('policy_type','seller-agreement').eq('status','published')
      .lte('effective_from',new Date().toISOString())
      .not('approved_by','is',null).order('version',{ascending:false}).limit(1),
    client.from('seller_applications')
      .select('id,shop_name,requested_slug,portfolio_url,description,status,review_note')
      .eq('user_id',user.id).order('submitted_at',{ascending:false}).limit(1),
    client.from('marketplace_settings').select('seller_intake_open').eq('singleton',true).single()
  ]);
  const policy=policies?.[0];
  const last=applications?.[0];
  const enabled=intake?.seller_intake_open===true&&!intakeError;
  const pending=last && ['submitted','under_review'].includes(last.status);
  const canEdit=last?.status==='needs_information';
  return <div className="container page-pad">
    <div className="page-heading"><div className="eyebrow">BECOME A CREATOR</div>
      <h1>Open your <em>studio.</em></h1>
      <p>เปิดรับสมัครเฉพาะเมื่อ Seller Agreement ที่ผ่านการตรวจสอบและเผยแพร่มีผลใช้จริงเท่านั้น</p>
    </div>
    {policyError&&<div role="alert" className="form-message">ไม่สามารถตรวจสถานะข้อตกลงได้ กรุณาลองใหม่ภายหลัง</div>}
    {(intakeError||applicationError)&&<div role="alert" className="form-message">ไม่สามารถตรวจสถานะการรับสมัครได้ กรุณาลองใหม่ภายหลัง</div>}
    {(!policy||!enabled)&&<div className="legal-alert">
      ขณะนี้ยังไม่เปิดรับสมัครผู้ขายจริง เนื่องจาก Seller Agreement หรือการอนุญาตเปิดรับสมัครยังไม่พร้อม
      <div className="phase4-small">ติดตามข่าวการเปิดรับสมัครได้จากประกาศของแพลตฟอร์ม</div>
    </div>}
    {pending?<div className="phase4-card"><h2>ใบสมัครกำลังรอตรวจสอบ</h2><p>คุณมีคำขอที่อยู่ระหว่างพิจารณาแล้ว ไม่จำเป็นต้องส่งซ้ำ</p>
      <Link className="btn btn-outline" href="/sell/application">ติดตามสถานะใบสมัคร</Link></div>
    :last?.status==='approved'?<div className="phase4-card"><h2>ร้านได้รับการอนุมัติแล้ว</h2><p>ตั้งค่า Authenticator MFA เพื่อเข้าสู่ Seller Studio</p>
      <Link className="btn btn-primary" href="/seller">เข้าสู่ Seller Studio</Link></div>
    :<SellerApply policy={policy?{id:policy.id,version:policy.version,title:policy.title}:null}
      enabled={enabled&&Boolean(policy)&&!policyError&&!applicationError}
      existing={canEdit?{id:last.id,shop_name:last.shop_name,requested_slug:last.requested_slug,
        portfolio_url:last.portfolio_url,description:last.description,review_note:last.review_note}:undefined}/>}
  </div>;
}
