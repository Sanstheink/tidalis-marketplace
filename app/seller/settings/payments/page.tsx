import {requireSeller,requireMfa} from '@/lib/auth';
import PaymentProfileEditor from '@/components/PaymentProfileEditor';
import type {PaymentProfile} from '@/lib/payment-utils';
export default async function SellerPaymentSettings({searchParams}:{searchParams:Promise<{notice?:string;currency?:string}>}){
 const {client,member,shop}=await requireSeller();await requireMfa(client,'/seller/settings/payments');
 const {data:storedProfile,error}=await client.from('payment_profiles').select('*').eq('shop_id',member.shop_id).maybeSingle();if(error)throw Error('Payment settings unavailable');
 const requested=(await searchParams).currency;const selected=requested&&['THB','LAK','USD'].includes(requested)?requested:storedProfile?.bank_currency;
 const bank=storedProfile?.bank_accounts?.[selected||'THB'];const profile=storedProfile?{...storedProfile,bank_currency:selected,bank_name:bank?.bank,bank_account:bank?.account,bank_enabled:bank?.enabled||false,qr_private_path:bank?.qrPath||null}:null;
 let qrUrl=null;if(profile?.qr_private_path){const {data}=await client.storage.from('tidalis-payment-qr').createSignedUrl(profile.qr_private_path,300);qrUrl=data?.signedUrl||null;}
 return <div className="container page-pad operations-page"><div className="page-heading"><div className="eyebrow">SELLER STUDIO / PAYMENT SETTINGS</div><h1>รับเงิน<em>เข้าร้าน.</em></h1><p>{shop.name} · ตั้งค่าช่องทางที่ลูกค้าจ่ายถึงคุณโดยตรง</p></div><PaymentProfileEditor profile={profile as PaymentProfile|null} scope="shop" name={shop.name} notice={(await searchParams).notice} qrUrl={qrUrl}/></div>;
}
