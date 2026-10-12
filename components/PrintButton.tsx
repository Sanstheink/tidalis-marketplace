'use client';
import {Printer} from 'lucide-react';
export function PrintButton(){return <button className="btn btn-primary" type="button" onClick={()=>window.print()}><Printer size={16}/> พิมพ์ / บันทึก PDF</button>;}
