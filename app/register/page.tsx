import {AuthForm} from '@/components/AuthForm';
export default async function Register({searchParams}:{searchParams:Promise<{next?:string}>}){
 const {next}=await searchParams;return <div className="container page-pad"><AuthForm mode="register" next={next}/></div>;
}
