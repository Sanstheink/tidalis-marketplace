import {AuthForm} from '@/components/AuthForm';
export default async function Login({searchParams}:{searchParams:Promise<{next?:string;error?:string}>}){
 const {next,error}=await searchParams;
 return <div className="container page-pad"><AuthForm mode="login" next={next} initialError={error}/></div>;
}
