import {orderLabels} from '@/lib/marketplace-cart-utils';
export default function OrderHistoryFilters({path,filters}:{path:string;filters:{q:string;status:string;kind:string}}){return <form method="get" action={path} className="phase6-search">
 <label>ค้นหาคำสั่งซื้อ<input name="q" maxLength={80} defaultValue={filters.q} placeholder="เลขคำสั่งซื้อ ชื่อผลงาน หรือชื่อร้าน"/></label>
 <label>ประเภท<select name="kind" defaultValue={filters.kind}><option value="all">ทุกประเภท</option><option value="fixed">สินค้าราคาคงที่</option><option value="commission">งาน Commission</option></select></label>
 <label>สถานะ<select name="status" defaultValue={filters.status}><option value="all">ทุกสถานะ</option>{Object.entries(orderLabels).filter(([key])=>key!=='expired').map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
 <button className="btn btn-outline" type="submit">ค้นหา</button>
 </form>;}
