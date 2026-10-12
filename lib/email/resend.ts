import 'server-only';

/**
 * Application transactional email adapter (orders, seller decisions, invoices etc).
 * Do not call this from client components or expose it as an unauthenticated send API.
 * Auth OTP and recovery emails are sent by Supabase Auth via Resend SMTP instead.
 */
export async function sendTransactionalEmail({to,subject,html,text}:{to:string;subject:string;html:string;text?:string}){
  const key=process.env.RESEND_API_KEY;
  const from=process.env.RESEND_FROM_EMAIL;
  if(!key||!from)throw new Error('Resend transactional email is not configured');
  // Only call from authorized server-side business events; never with client-selected content.
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({from,to:[to],subject,html,text}),
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok){
    // Do not log recipient, message, API credentials, or full provider response.
    throw new Error(`Resend delivery request failed (${response.status})`);
  }
  return response.json() as Promise<{id:string}>;
}
