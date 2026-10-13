import 'server-only';
import PDFDocument from 'pdfkit';
import path from 'node:path';

export type OrderDocument={
 title:string;number:string;edition:string;reference:string;
 sections:{title:string;lines:string[];layout?:'summary'|'items'}[];
 footer:string;
};
type TextLine={text:string;size:number;bold:boolean;height:number;item:number};

// Local OFL fonts and measured Thai wrapping keep document contents private and intact.
export async function renderOrderDocument(data:OrderDocument):Promise<Buffer>{
 const doc=new PDFDocument({size:'A4',margins:{top:44,bottom:60,left:48,right:48},bufferPages:true,info:{Title:data.title,Author:'Tidalis'}});
 const chunks:Buffer[]=[];
 const complete=new Promise<Buffer>((resolve,reject)=>{
  doc.on('data',(chunk:Buffer)=>chunks.push(chunk));
  doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
 });
 doc.registerFont('regular',path.join(process.cwd(),'assets/fonts/Sarabun-Regular.ttf'));
 doc.registerFont('semibold',path.join(process.cwd(),'assets/fonts/Sarabun-SemiBold.ttf'));
 const left=48,width=doc.page.width-96,bottom=doc.page.height-76;
 const color={ink:'#292337',muted:'#686473',accent:'#70528D',pale:'#F4F0F8',line:'#E2DBE9',paper:'#FAF9FC'};
 const words=new Intl.Segmenter('th',{granularity:'word'}),graphemes=new Intl.Segmenter('th',{granularity:'grapheme'});
 let y=44;

 function font(size:number,bold=false){doc.font(bold?'semibold':'regular').fontSize(size);}
 function wrap(value:string,available:number,size:number,bold=false):string[]{
  font(size,bold);const lines:string[]=[];
  for(const paragraph of value.replace(/\r\n?/g,'\n').split('\n')){
   let line='';
   for(const {segment:word} of words.segment(paragraph)){
    if(doc.widthOfString(line+word)<=available){line+=word;continue;}
    if(line){lines.push(line);line='';}
    if(doc.widthOfString(word)<=available){line=word;continue;}
    for(const {segment:letter} of graphemes.segment(word)){
     if(line&&doc.widthOfString(line+letter)>available){lines.push(line);line='';}
     line+=letter;
    }
   }
   lines.push(line);
  }
  return lines;
 }
 function text(value:string,x:number,top:number,size=10.5,bold=false,fill=color.ink){
  font(size,bold);doc.fillColor(fill).text(value||' ',x,top,{lineBreak:false});
 }
 function rule(top:number){doc.moveTo(left,top).lineTo(left+width,top).lineWidth(.6).strokeColor(color.line).stroke();}
 function header(first:boolean){
  doc.rect(0,0,doc.page.width,6).fill(color.accent);
  text('TIDALIS',left,36,14,true,color.accent);
  text('SHOP DOCUMENT',left+width-103,41,9,false,color.muted);
  y=first?75:66;
  const titleSize=first?26:15;
  for(const line of wrap(data.title,width,titleSize,true)){text(line,left,y,titleSize,true);y+=titleSize*1.5;}
  const editionLines=wrap(data.edition,width-24,10,true);
  doc.roundedRect(left,y+5,width,editionLines.length*17+16,5).fill(color.pale);
  for(const line of editionLines){text(line,left+12,y+12,10,true,color.accent);y+=17;}
  y+=30;
  if(first){
   const number=wrap(data.number,width-104,9.5,true),reference=wrap(data.reference,width-104,9.5);
   const height=(number.length+reference.length)*16+25;
   doc.roundedRect(left,y,width,height,5).fill(color.paper);
   text('เลขที่เอกสาร',left+12,y+10,9,false,color.muted);
   let row=y+9;for(const line of number){text(line,left+96,row,9.5,true);row+=16;}
   text('อ้างอิง',left+12,row+4,9,false,color.muted);row+=4;
   for(const line of reference){text(line,left+96,row,9.5);row+=16;}
   y+=height+21;
  }else{
   for(const line of wrap(data.number,width,9)){text(line,left,y,9,false,color.muted);y+=15;}
   rule(y+3);y+=20;
  }
 }
 function nextPage(){doc.addPage();header(false);}
 header(true);

 data.sections.forEach((section,index)=>{
  const lines:TextLine[]=section.lines.flatMap((value,item)=>{
   const emphasis=section.layout==='summary'&&item===0,size=emphasis?20:10.5;
   return wrap(value,width-32,size,emphasis).map(text=>({text,size,bold:emphasis,height:size*1.65,item}));
  });
  // Every continuation repeats its heading; keep at least two body lines with it.
  if(!lines.length)lines.push({text:'',size:10.5,bold:false,height:17.325,item:0});
  let offset=0;
  while(offset<lines.length){
   const heading=wrap(`${String(index+1).padStart(2,'0')}  ${section.title}${offset?' (ต่อ)':''}`,width-32,11,true);
   const headingHeight=heading.length*18+18;
   const firstLines=lines.slice(offset,offset+2).reduce((total,line)=>total+line.height,0);
   if(y+headingHeight+firstLines+12>bottom)nextPage();
   let end=offset,bodyHeight=0;
   while(end<lines.length&&y+headingHeight+bodyHeight+lines[end].height+12<=bottom){bodyHeight+=lines[end].height;end++;}
   const height=headingHeight+bodyHeight+12;
   const summary=section.layout==='summary';
   doc.roundedRect(left,y,width,height,6).fill(summary?color.pale:color.paper);
   doc.rect(left,y+11,3,Math.max(16,headingHeight-18)).fill(color.accent);
   let row=y+9;for(const line of heading){text(line,left+16,row,11,true,color.accent);row+=18;}
   row=y+headingHeight;
   for(let i=offset;i<end;i++){
    const line=lines[i];
    if(section.layout==='items'&&line.item%2===1)doc.rect(left+8,row-1,width-16,line.height).fill('#EFEAF4');
    text(line.text,left+16,row,line.size,line.bold);row+=line.height;
   }
   y+=height+13;offset=end;
  }
 });

 const notes=wrap(data.footer,width-24,9);
 let note=0;
 while(note<notes.length){
  if(y+43>bottom)nextPage();
  rule(y+1);y+=12;
  while(note<notes.length&&y+16<=bottom){text(notes[note++],left+2,y,9,false,color.muted);y+=16;}
  if(note<notes.length)nextPage();
 }
 const pages=doc.bufferedPageRange();
 for(let i=pages.start;i<pages.start+pages.count;i++){
  doc.switchToPage(i);const savedBottom=doc.page.margins.bottom;doc.page.margins.bottom=0;
  rule(doc.page.height-53);
  // Footer text must never trigger PDFKit's automatic page creation.
  text(data.edition,left,doc.page.height-42,8,false,color.muted);
  const pageLabel=`${i-pages.start+1} / ${pages.count}`;font(9);
  text(pageLabel,left+width-doc.widthOfString(pageLabel),doc.page.height-43,9,false,color.muted);
  doc.page.margins.bottom=savedBottom;
 }
 doc.end();return complete;
}

export async function documentResponse(data:OrderDocument,filename:string){
 const bytes=await renderOrderDocument(data);
 return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filename}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
