'use client'
import { useState } from 'react'
import type { SalesTrendPoint } from '@/lib/sales-read-cache'
import { peso, studioDay } from '@/lib/new-admin/presentation-data'
import styles from './new-admin.module.css'
import { Empty } from './ui'

export default function FinancialChart({ daily }: { daily: SalesTrendPoint[] }) {
  const points = daily.filter(point => point.key <= studioDay()).slice(-7)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = points.find(point => point.key === selectedKey) ?? points.at(-1)
  if (!selected) return <Empty title="No financial activity yet">The chart will use recorded revenue and expenses as they become available.</Empty>
  const floor = Math.min(0, ...points.map(point => point.netProfit))
  const ceiling = Math.max(1000, ...points.flatMap(point => [point.revenue, point.expenses, point.netProfit]))
  const y = (value: number) => 145 - (value-floor)/(ceiling-floor)*125
  const x = (index: number) => 65 + index * (430 / Math.max(1, points.length-1))
  const series = [['revenue', 'Revenue', 'var(--revenue)'], ['expenses', 'Expenses', 'var(--expenses)'], ['netProfit', 'Net profit', 'var(--profit)']] as const
  function path(key: 'revenue' | 'expenses' | 'netProfit') {
    return points.map((point,index) => index === 0 ? `M ${x(index)} ${y(point[key])}` : `C ${x(index-1)+30} ${y(points[index-1][key])}, ${x(index)-30} ${y(point[key])}, ${x(index)} ${y(point[key])}`).join(' ')
  }
  return <figure><figcaption className={styles.muted}>Up to 7 days · select a date to keep its figures visible</figcaption><div className={styles.chartValues} aria-live="polite">{series.map(([key,label,color]) => <div key={key}><span style={{ color }}>{label}</span><strong>{peso(selected[key])}</strong></div>)}</div>
    <svg viewBox="0 0 520 170" className={styles.chart} role="img" aria-label="Revenue, expenses and net profit over the latest recorded dates">
      {[floor,(floor+ceiling)/2,ceiling].map(value => <g key={value}><line x1="65" x2="500" y1={y(value)} y2={y(value)} stroke="var(--line)" /><text x="2" y={y(value)+4}>{Math.round(value).toLocaleString('en-PH')}</text></g>)}
      {series.map(([key,,color]) => <path key={key} className={styles.chartLine} d={path(key)} stroke={color} />)}
      {series.map(([key,,color]) => <circle key={key} cx={x(points.indexOf(selected))} cy={y(selected[key])} r="4" fill="var(--card)" stroke={color} strokeWidth="2" />)}
    </svg><div className={styles.chartSelectors}>{points.map(point => <button key={point.key} type="button" aria-pressed={point.key === selected.key} aria-label={`Select ${point.key}`} onClick={() => setSelectedKey(point.key)}>{point.label}</button>)}</div>
  </figure>
}
