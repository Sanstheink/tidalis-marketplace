import Link from 'next/link';
import {requirePlatformAdmin} from '@/lib/auth';
import PaymentProfileEditor from '@/components/PaymentProfileEditor';
import IssuerSettingsForm from '@/components/IssuerSettingsForm';
import {PendingButton} from '@/components/PendingButton';
import {setSales,saveFee} from './actions';
import {supabaseService} from '@/lib/supabase/service';
import type {PaymentProfile} from '@/lib/payment-utils';
export default async function PlatformPaymentSettings({searchParams}:{searchParams:Promise<{notice?:string;currency?:string}>}){
 const {client}=await requirePlatformAdmin('/admin/settings/payments');const results=await Promise.all([
 client.from('payment_profiles').select('*').is('shop_id',null).maybeSingle(),client.from('platform_issuer_profile').select('*').maybeSingle(),client.from('marketplace_settings').select('fixed_orders_enabled').eq('singleton',true).single(),client.from('shops').select('id,name').order('name'),client.from('commission_fee_rules').select('shop_id,rate_basis_points').is('effective_until',null).is('category',null)]);
 if(results.some(result=>result.error))return <div className="container page-pad operations-page"><div className="page-heading"><h1>ตั้งค่ารับเงินแพลตฟอร์ม</h1></div><p className="form-message" role="alert">โหลดข้อมูลการเงินไม่สำเร็จ กรุณาลองใหม่ก่อนแก้ไขข้อมูลผู้รับเงินหรือผู้ออกเอกสาร</p><Link href="/admin/settings/payments" className="btn btn-primary">โหลดข้อมูลอีกครั้ง</Link></div>;
 const [{data:storedProfile},{data:issuer},{data:settings},{data:shops},{data:rules}]=results;
 const names=new Map((shops||[]).map(s=>[s.id,s.name]));
 const requested=(await searchParams).currency;const selected=requested&&['THB','LAK','USD'].includes(requested)?requested:storedProfile?.bank_currency;
 const bank=storedProfile?.bank_accounts?.[selected||'THB'];const profile=storedProfile?{...storedProfile,bank_currency:selected,bank_name:bank?.bank,bank_account:bank?.account,bank_enabled:bank?.enabled||false,qr_private_path:bank?.qrPath||null}:null;
 let qrUrl=null;if(profile?.qr_private_path){const {data}=await client.storage.from('tidalis-payment-qr').createSignedUrl(profile.qr_private_path,300);qrUrl=data?.signedUrl||null;}
 const notice=(await searchParams).notice;const messages:Record<string,string>={issuer_saved:'บันทึกผู้ออกใบเสร็จแล้ว',sales_saved:'บันทึกการเปิดรับคำสั่งซื้อแล้ว',fee_saved:'บันทึกอัตราค่าธรรมเนียมสำหรับคำสั่งซื้อใหม่แล้ว',invalid_issuer:'ตรวจชื่อจริง ที่อยู่ และเลขผู้เสียภาษี (ถ้ากรอก)',invalid_fee:'อัตราค่าธรรมเนียมต้องอยู่ระหว่าง 0–100%',policies_required:'เผยแพร่นโยบายการชำระเงินและคืนเงินก่อนเปิดรับคำสั่งซื้อ'};
 return <div className="container page-pad operations-page"><div className="page-heading"><div className="eyebrow">ADMIN / PAYMENT SETTINGS</div><h1>รับเงิน<em>แพลตฟอร์ม.</em></h1><p>ช่องทางรับค่าบริการ ข้อมูลผู้ออกใบเสร็จ และการเปิดขาย</p></div>{notice&&messages[notice]?<p className="form-message" role="status">{messages[notice]}</p>:null}
 <PaymentProfileEditor profile={profile as PaymentProfile|null} scope="platform" name="Tidalis" notice={notice&&!messages[notice]?notice:undefined} qrUrl={qrUrl}/>
 <div className="operations-grid"><IssuerSettingsForm issuer={issuer}/>
 <div><form className="commerce-card operations-form" action={setSales}><div className="eyebrow">SALES CONTROL</div><h2>เปิดรับคำสั่งซื้อ</h2><p>ร้านต้องผ่านการอนุมัติและมีข้อมูลพร้อม ลูกค้าชำระได้เฉพาะช่องทางที่ตั้งค่าครบ</p><label className="operations-check"><input type="checkbox" name="enabled" defaultChecked={settings?.fixed_orders_enabled}/> เปิดสั่งซื้อสินค้าราคาคงที่</label><label className="operations-check"><input type="checkbox" name="confirmed" value="yes" required/> ตรวจนโยบาย สินค้า และช่องทางรับเงินก่อนเปลี่ยนสถานะ</label><PendingButton>บันทึกสถานะการขาย</PendingButton><p className="payment-assurance">บริการตรวจหลักฐานบนเซิร์ฟเวอร์: {supabaseService()?'ตั้งค่าแล้ว':'รอตั้งค่ากุญแจฝั่งเซิร์ฟเวอร์'}</p></form>
 <form className="commerce-card operations-form" action={saveFee}><div className="eyebrow">PLATFORM FEES</div><h2>อัตราค่าธรรมเนียม</h2><label>ใช้กับ<select name="shopId"><option value="">ทุกร้าน (อัตราเริ่มต้น)</option>{(shops||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>ค่าธรรมเนียม (%)<input name="rate" required type="number" min="0" max="100" step="0.01"/></label><p>มีผลกับคำสั่งซื้อใหม่ เก็บอัตราที่ใช้กับแต่ละคำสั่งซื้อไว้ตรวจสอบได้</p>{(rules||[]).map((r,i)=><p key={i}>{r.shop_id?names.get(r.shop_id):'อัตราเริ่มต้น'}: {(r.rate_basis_points/100).toFixed(2)}%</p>)}<label className="operations-check"><input type="checkbox" name="confirmed" value="yes" required/> ตรวจอัตราก่อนบันทึกแล้ว</label><PendingButton>บันทึกอัตราใหม่</PendingButton></form></div></div>
 </div>;
}
