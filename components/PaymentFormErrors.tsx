export default function PaymentFormErrors({id,errors}:{id:string;errors:Record<string,string>}){
 if(!Object.keys(errors).length)return null;
 return <div id={id} className="form-message" role="alert" tabIndex={-1}><strong>ยังบันทึกไม่ได้ กรุณาตรวจข้อมูล</strong><ul>{Object.entries(errors).map(([key,message])=><li key={key}>{message}</li>)}</ul></div>;
}
