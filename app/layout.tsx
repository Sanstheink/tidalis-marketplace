import type {Metadata} from 'next';
import './globals.css';
import {Header,Footer} from '@/components/Chrome';
import {CartProvider} from '@/lib/cart';
export const metadata:Metadata={title:{default:'Marketplace Tidalis — Art & Creative Marketplace',template:'%s | Marketplace Tidalis'},description:'Marketplace สำหรับงาน Commission, Ready-made Artwork และ Digital Assets จากศิลปินหลายร้าน',metadataBase:new URL('https://marketplace.tidalis.site')};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="th"><body><CartProvider><Header/><main id="main-content">{children}</main><Footer/></CartProvider></body></html>}
