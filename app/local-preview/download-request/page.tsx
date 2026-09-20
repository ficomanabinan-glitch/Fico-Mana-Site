import { notFound } from 'next/navigation'
import DownloadRequestDemo from './download-request-demo'

export default function LocalDownloadRequestPreview() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <DownloadRequestDemo />
}
