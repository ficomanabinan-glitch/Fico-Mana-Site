import type { Metadata } from 'next'
import EditorPortalShell from '@/components/editor-portal-shell'

export const metadata:Metadata={title:'FICO MANA Editor Portal',description:'Secure FICO MANA post-production and private storage workflow.',robots:{index:false,follow:false}}
export default function EditorLayout({children}:{children:React.ReactNode}){return <div className="editor-console contents"><EditorPortalShell>{children}</EditorPortalShell></div>}
