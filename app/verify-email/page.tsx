import {VerifyEmailForm} from '@/components/VerifyEmailForm';
export default async function VerifyEmail({searchParams}:{searchParams:Promise<{email?:string;next?:string}>}){
 const params=await searchParams;return <VerifyEmailForm initialEmail={params.email} next={params.next}/>;
}
