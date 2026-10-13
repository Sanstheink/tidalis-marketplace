import 'server-only';
export function proofFileType(bytes:Buffer){
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {ext:'png',mime:'image/png'};
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {ext:'jpg',mime:'image/jpeg'};
 if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return {ext:'webp',mime:'image/webp'};
 if(bytes.toString('ascii',0,5)==='%PDF-')return {ext:'pdf',mime:'application/pdf'};return null;
}
