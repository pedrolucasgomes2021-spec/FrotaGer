import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Vértice — Gestão de mobilidade',description:'Conecte passageiros, motoristas e rotas em uma operação de fretamento inteligente.',manifest:'/manifest.webmanifest',icons:{icon:'/favicon.svg',apple:'/icon-192.png'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><head><meta name="theme-color" content="#0b0e11"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="apple-mobile-web-app-capable" content="yes"/></head><body>{children}</body></html>}
