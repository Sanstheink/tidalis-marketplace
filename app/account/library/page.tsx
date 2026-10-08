import {requireUser} from '@/lib/auth';
import {LibraryBig} from 'lucide-react';
export default async function Library(){await requireUser('/account/library');return <div className="container page-pad"><div className="page-heading"><div className="eyebrow">MY ACCOUNT</div><h1>My <em>Library.</em></h1><p>ไฟล์ที่มีสิทธิ์ดาวน์โหลดจากการซื้อที่ยืนยันแล้ว</p></div><div className="empty-state"><LibraryBig size={42}/><h2>ยังไม่มีไฟล์ในคลัง</h2><p>สิทธิ์ดาวน์โหลดจะปรากฏหลังผู้ขายยืนยันรับเงินจริง ระบบไม่เปิดลิงก์ไฟล์สาธารณะ</p></div></div>}
