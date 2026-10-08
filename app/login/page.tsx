import {AuthForm} from '@/components/AuthForm';
export default async function Login({searchParams}:{searchParams:Promise<{next?:string}>}){const {next}=await searchParams;return <div className="container page-pad"><AuthForm mode="login" next={next}/></div>}
