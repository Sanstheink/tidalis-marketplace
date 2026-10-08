export type License = 'personal' | 'commercial';
export type ProductType = 'ready_made' | 'digital_asset' | 'commission';
export type Product = {
  id: string; slug: string; shopSlug: string; shopName: string; name: string;
  category: ProductType; workType: string; description: string;
  personalPrice: number; commercialPrice: number;
  pricingMode: 'fixed' | 'quote'; stock: number | null; exclusive: boolean;
  artClass: string; artEmoji: string; tags: string[]; files: string[];
};
export const shop = {slug:'moonlight-studio',name:'Moonlight Studio',subtitle:'Dreamlike characters and violet fantasy worlds',location:'Thailand',status:'เปิดรับงาน', policyVersion:'2026-10-01'};
export const products: Product[] = [
  {id:'pr-001',slug:'violet-moon-character',shopSlug:shop.slug,shopName:shop.name,name:'Violet Moon Character',category:'ready_made',workType:'Character Illustration',description:'Original character artwork โทนแฟนตาซีม่วงดำ พร้อมไฟล์ความละเอียดสูงและรายละเอียดสิทธิ์การใช้งานตาม License ที่เลือก',personalPrice:1890,commercialPrice:3500,pricingMode:'fixed',stock:1,exclusive:true,artClass:'art-one',artEmoji:'✦',tags:['Exclusive','Character Design'],files:['PNG High Resolution','PSD Source','License PDF']},
  {id:'pr-002',slug:'arcane-brush-pack',shopSlug:shop.slug,shopName:shop.name,name:'Arcane Brush Collection',category:'digital_asset',workType:'Brush Pack',description:'ชุดแปรงสำหรับสร้างงานแฟนตาซี เหมาะกับนักวาดและนักออกแบบ พร้อมคู่มือการใช้งาน',personalPrice:350,commercialPrice:690,pricingMode:'fixed',stock:null,exclusive:false,artClass:'art-two',artEmoji:'✧',tags:['Digital Asset','Brush'],files:['Brush Pack ZIP','Quick Guide PDF']},
  {id:'pr-003',slug:'full-body-commission',shopSlug:shop.slug,shopName:shop.name,name:'Full Body Commission',category:'commission',workType:'Full Body',description:'รับวาดตัวละครแบบเต็มตัว เลือกบรีฟ สี ฉาก และภาพอ้างอิงได้ ศิลปินจะตรวจบรีฟและเสนอราคาสุดท้ายก่อนชำระ',personalPrice:1500,commercialPrice:2900,pricingMode:'quote',stock:null,exclusive:false,artClass:'art-three',artEmoji:'☾',tags:['Commission','Full Body'],files:['Finished Artwork']},
  {id:'pr-004',slug:'nebula-background',shopSlug:shop.slug,shopName:shop.name,name:'Nebula Dreamscape',category:'ready_made',workType:'Background Art',description:'ภาพฉากท้องฟ้าแฟนตาซีสำหรับใช้เป็นแบ็กกราวนด์ในงานสร้างสรรค์',personalPrice:890,commercialPrice:1750,pricingMode:'fixed',stock:null,exclusive:false,artClass:'art-four',artEmoji:'✺',tags:['Background','Ready-made'],files:['4K PNG','License PDF']},
  {id:'pr-005',slug:'chibi-commission',shopSlug:shop.slug,shopName:shop.name,name:'Soft Chibi Commission',category:'commission',workType:'Chibi',description:'งานวาดตัวละครสไตล์ Chibi รายละเอียดเฉพาะตัวตามบรีฟของลูกค้า',personalPrice:750,commercialPrice:1450,pricingMode:'quote',stock:null,exclusive:false,artClass:'art-five',artEmoji:'♡',tags:['Commission','Chibi'],files:['Finished Artwork']},
  {id:'pr-006',slug:'astral-ui-icons',shopSlug:shop.slug,shopName:shop.name,name:'Astral UI Icon Set',category:'digital_asset',workType:'UI Assets',description:'เซ็ตไอคอนธีมอวกาศและเวทมนตร์สำหรับงานออกแบบอินเทอร์เฟซ',personalPrice:490,commercialPrice:990,pricingMode:'fixed',stock:null,exclusive:false,artClass:'art-six',artEmoji:'✧',tags:['UI','Icons'],files:['PNG Pack','SVG Pack','License PDF']}
];
export const categories = [
  {value:'all',label:'สินค้าทั้งหมด'},
  {value:'commission',label:'Commission'},
  {value:'ready_made',label:'Ready-made Art'},
  {value:'digital_asset',label:'Digital Assets'},
];
export const money = (amount:number)=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',minimumFractionDigits:2}).format(amount);
export const getProduct=(slug:string)=>products.find(p=>p.slug===slug);
