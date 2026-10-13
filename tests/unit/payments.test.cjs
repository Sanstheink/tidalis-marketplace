const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-typescript.cjs');
const money=load('lib/payment-utils.ts');
const qr=load('lib/promptpay.ts');
test('financial amounts use integer minor units without floating point rounding',()=>{
 assert.equal(money.decimalToMinor('126.75'),12675n);assert.equal(money.decimalToMinor('0.01'),1n);
 assert.equal(money.decimalToMinor('999999999999.99'),99999999999999n);
 for(const invalid of ['1e2','NaN','-1','1.999','1,000','0x10',''])assert.throws(()=>money.decimalToMinor(invalid));
 assert.equal(money.formatMoney(12675,'LAK'),'126.75 ₭');assert.equal(money.formatMoney(12675,'USD'),'126.75 USD');
});
test('PromptPay uses the Bank of Thailand merchant AID, Thai phone format and exact amount',()=>{
 const payload=qr.promptPayPayload('0812345678',12675);
 assert.ok(payload.startsWith('000201010212'));assert.ok(payload.includes('0016A00000067701011101130066812345678'));assert.ok(payload.includes('53037645406126.755802TH6304'));
 let crc=0xffff;for(const byte of Buffer.from(payload)){crc^=byte<<8;for(let bit=0;bit<8;bit++)crc=(crc&0x8000)?(crc<<1)^0x1021:crc<<1;crc&=0xffff;}
 // Check the encoded checksum against a separate polynomial implementation.
 const data=payload.slice(0,-4);let check=0xffff;for(const c of Buffer.from(data)){check^=c<<8;for(let i=0;i<8;i++)check=((check<<1)^((check&0x8000)?0x1021:0))&0xffff;}
 assert.equal(payload.slice(-4),check.toString(16).toUpperCase().padStart(4,'0'));
 assert.throws(()=>qr.promptPayPayload('USD-ACCOUNT',100));assert.throws(()=>qr.promptPayPayload('0812345678',0));
});
