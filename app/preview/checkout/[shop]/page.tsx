import {Suspense} from 'react';
import CheckoutForm from '@/components/CheckoutForm';
export default function CheckoutPage(){return <Suspense fallback={<div className="container page-pad">กำลังเตรียม Checkout...</div>}><CheckoutForm/></Suspense>}
