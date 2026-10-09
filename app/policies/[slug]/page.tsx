import Link from 'next/link';
import {notFound} from 'next/navigation';
import {policyPages} from '@/lib/policies';
import {supabaseServer} from '@/lib/supabase/server';

const outline:Record<string,string[]>={terms:['บทบาท Marketplace Tidalis และความสัมพันธ์ระหว่างผู้ซื้อกับร้านผู้ขาย','การสมัครบัญชี การยืนยันตัวตน และสิทธิ์การใช้งาน','การสั่งซื้อสินค้าแบบราคาคงที่และ Commission','สิทธิ์และหน้าที่ของสมาชิก และข้อจำกัดความรับผิดตามกฎหมาย','การร้องเรียนและการเปลี่ยนแปลงข้อกำหนด'],privacy:['ประเภทข้อมูลที่เก็บ: Auth, คำสั่งซื้อ, สลิป, Reference, เอกสารผู้ขาย','วัตถุประสงค์และฐานทางกฎหมายสำหรับการประมวลผล','การเปิดเผยข้อมูลแก่ผู้ขายและผู้ให้บริการระบบ','ระยะเวลาจัดเก็บ ความปลอดภัย และสิทธิ์เจ้าของข้อมูล','ข้อมูลติดต่อผู้ควบคุมข้อมูลส่วนบุคคล'],cookies:['Essential cookies สำหรับการเข้าสู่ระบบและตะกร้า','Analytics และ Marketing cookies เมื่อมีการเปิดใช้','การเลือกและถอนความยินยอม','อายุคุกกี้และคู่ค้าที่เกี่ยวข้อง'],'buyer-protection':['การแจ้งปัญหาหากไม่ได้รับสินค้า/ไฟล์','การตรวจสอบกรณีผู้ขายไม่ส่งมอบงาน','หลักฐานการโอนและการป้องกันสลิปซ้ำ','ข้อพิพาท กระบวนการพิจารณา และสิทธิ์ตามกฎหมาย'],'seller-agreement':['การสมัครร้าน การตรวจสอบตัวตนและนโยบายร้าน','การรับเงินโดยตรงของผู้ขายและความรับผิดชอบต่อสินค้า','ค่าธรรมเนียมเป็นเปอร์เซ็นต์จากยอดขายที่ยืนยันและรอบบิล','การออกใบเสร็จ การยืนยัน VAT และเอกสารภาษี','การรับเรื่องร้องเรียน การระงับร้าน และการอุทธรณ์'],'payment-refund':['ผู้ซื้อชำระเข้าบัญชี PromptPay หรือช่องทางของร้านโดยตรง','การอัปโหลดสลิปและผู้ขายตรวจสอบก่อนส่งไฟล์','นโยบายคืนเงินแต่ละร้านและหลักสิทธิ์ตามกฎหมาย','การคืนเงิน Manual โดยร้าน พร้อมหลักฐานและข้อพิพาท','การปรับค่าธรรมเนียมเมื่อคืนเงินสำเร็จ'],'copyright':['ความเป็นเจ้าของและสิทธิ์ที่ผู้ขายรับรอง','Personal Use และ Commercial Use พร้อมราคาผู้ขายกำหนด','ขอบเขตของ Exclusive และการโอนลิขสิทธิ์','การรับแจ้งละเมิดและกระบวนการอุทธรณ์'],'community':['เนื้อหาที่อนุญาตหรือห้ามเผยแพร่','การติดต่อสื่อสารระหว่างผู้ซื้อและผู้ขาย','การป้องกันสแปม ฉ้อโกง และสินค้าละเมิดสิทธิ์','มาตรการตรวจสอบ รายงาน และระงับบัญชี']};
export function generateStaticParams(){return policyPages.map(p=>({slug:p.slug}));}
export default async function Policy({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const page=policyPages.find(p=>p.slug===slug);
  if(!page)notFound();
  if(slug==='seller-agreement'){
    const client=await supabaseServer();
    const {data:policies}=client?await client.from('platform_policy_versions')
      .select('id,version,title,content,effective_from,approved_by')
      .eq('policy_type','seller-agreement').eq('status','published')
      .lte('effective_from',new Date().toISOString()).not('approved_by','is',null)
      .order('version',{ascending:false}).limit(1):{data:null};
    const published=policies?.[0];
    if(published)return <article className="container page-pad legal-content">
      <Link href="/policies" className="back-link">← กลับสู่ศูนย์นโยบาย</Link>
      <div className="eyebrow">TIDALIS / SELLER AGREEMENT · VERSION {published.version}</div>
      <h1>{published.title}</h1>
      <p>ฉบับเผยแพร่ · มีผลตั้งแต่ {new Date(published.effective_from).toLocaleDateString('th-TH',{dateStyle:'long'})}</p>
      <section className="phase4-policy-body" aria-label="Seller Agreement Full Text">{published.content}</section>
      <p className="phase4-small">การยอมรับข้อตกลงจะเกิดขึ้นเมื่อผู้สมัครยืนยันในแบบฟอร์ม Seller Application ไม่ใช่เพียงการเข้าชมหน้านี้</p>
    </article>;
  }
  return <article className="container page-pad legal-content"><Link href="/policies" className="back-link">← กลับสู่ศูนย์นโยบาย</Link>
    <div className="eyebrow">TIDALIS / LEGAL CENTER</div><h1>{page.title}</h1><p>{page.desc}</p>
    <div className="legal-alert"><strong>ฉบับร่างเพื่อการวางระบบเท่านั้น</strong> — ยังไม่มีวันที่มีผลบังคับ ไม่ใช่เงื่อนไขที่เผยแพร่ใช้งานจริง และไม่ควรใช้เป็นหลักฐานการยอมรับสัญญา</div>
    {(outline[slug]||[]).map((line,i)=><section key={line}><h2>{i+1}. {line}</h2><p>ส่วนนี้รอจัดทำเนื้อหาข้อกำหนดฉบับสมบูรณ์ และตรวจสอบโดยผู้รับผิดชอบด้านกฎหมายและการดำเนินงานของ Marketplace Tidalis ก่อนเปิดเว็บไซต์จริง</p></section>)}
  </article>;
}
