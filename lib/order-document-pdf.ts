import 'server-only';
import PDFDocument from 'pdfkit';
import path from 'node:path';
export type OrderDocument={title:string;number:string;edition:string;reference:string;sections:{title:string;lines:string[]}[];footer:string};
// Embedded OFL font; no remote fetch, customer data or credentials leave the server.
export async function renderOrderDocument(data:OrderDocument):Promise<Buffer>{
 const doc=new PDFDocument({size:'A4',margins:{top:48,bottom:58,left:48,right:48},bufferPages:true,info:{Title:data.title,Author:'Tidalis'}});
 const chunks:Buffer[]=[];const complete=new Promise<Buffer>((resolve,reject)=>{doc.on('data',(chunk:Buffer)=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.font(path.join(process.cwd(),'assets/fonts/Sarabun-Regular.ttf'));
 const width=doc.page.width-96;
 function line(text:string,size=11,color='#303644'){
  doc.fontSize(size).fillColor(color);
  const words=[...new Intl.Segmenter('th',{granularity:'word'}).segment(text.replace(/\r/g,''))].map(s=>s.segment);
  let current='';const flush=()=>{if(doc.y+size*1.8>doc.page.height-64)doc.addPage();const y=doc.y;doc.text(current||' ',48,y,{width,lineBreak:false});doc.y=y+size*1.8;current='';};
  for(const word of words){if(word==='\n'){flush();continue;}if(doc.widthOfString(current+word)<=width){current+=word;continue;}if(current)flush();
   if(doc.widthOfString(word)<=width){current=word;continue;}
   for(const g of new Intl.Segmenter('th',{granularity:'grapheme'}).segment(word)){if(current&&doc.widthOfString(current+g.segment)>width)flush();current+=g.segment;}
  }if(current)flush();
 }
 line('TIDALIS / SHOP DOCUMENT',10,'#73628c');doc.y+=9;
 line(data.title,23,'#292136');line(data.edition,12,'#755295');doc.y+=8;
 line(data.number,10);line(data.reference,10);doc.y+=15;
 for(const section of data.sections){if(doc.y>doc.page.height-140)doc.addPage();line(section.title,13,'#755295');doc.y+=4;for(const text of section.lines)line(text);doc.y+=14;}
 line(data.footer,9,'#646879');
 const pages=doc.bufferedPageRange();for(let i=pages.start;i<pages.start+pages.count;i++){doc.switchToPage(i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.fontSize(9).fillColor('#646879').text(`${data.edition}  |  ${i+1} / ${pages.count}`,48,doc.page.height-40,{width,lineBreak:false,align:'right'});doc.page.margins.bottom=bottom;}
 doc.end();return complete;
}
export async function documentResponse(data:OrderDocument,filename:string){
 const bytes=await renderOrderDocument(data);
 return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filename}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
