import {VerifyEmailForm} from '@/components/VerifyEmailForm';
export default async function VerifyEmail({searchParams}:{searchParams:Promise<{email?:string;next?:string;flow?:string}>}){
  const params=await searchParams;
  const flow=params.flow==='login'||params.flow==='recovery'?params.flow:'signup';
  return <VerifyEmailForm initialEmail={params.email||''} next={params.next} flow={flow}/>;
}
