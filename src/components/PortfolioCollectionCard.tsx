import { ExternalLink } from 'lucide-react'
import { motion } from 'framer-motion'
import type { PortfolioCollection } from '../api/backend'

function formatTon(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const t = Date.parse(value)
  if (!Number.isFinite(t)) return '—'
  return new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function PortfolioCollectionCard({ c }: { c: PortfolioCollection }) {
  const title = c.displayName ?? c.sampleName ?? 'Коллекция'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-900 transition-all group"
    >
      <button
        type="button"
        className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={() => window.open(`https://getgems.io/collection/${c.collectionAddress}`, '_blank')}
      >
        <ExternalLink className="w-5 h-5 text-zinc-500 hover:text-white" />
      </button>

      <div className="p-5">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden shrink-0">
            {c.sampleImage ? (
              <img src={c.sampleImage} alt={title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600 font-bold">{title.slice(0, 1)}</div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-base font-medium text-zinc-100 truncate">{title}</div>
            <div className="text-zinc-500 text-xs truncate font-mono mt-0.5">
              {c.collectionAddress.slice(0, 4)}…{c.collectionAddress.slice(-4)} · {c.count} шт
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-4 gap-x-2">
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Floor</div>
            <div className="text-zinc-200 text-sm font-medium">{formatTon(c.floorTon)}</div>
          </div>
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Median</div>
            <div className="text-zinc-200 text-sm font-medium">{formatTon(c.medianSoldTon ?? c.avgSoldTon)}</div>
          </div>
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Value (floor)</div>
            <div className="text-zinc-200 text-sm font-medium">{formatTon(c.valueFloorTon)}</div>
          </div>
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Value (median)</div>
            <div className="text-zinc-200 text-sm font-medium">{formatTon(c.valueMedianSoldTon ?? c.valueAvgSoldTon)}</div>
          </div>
        </div>
        
        <div className="mt-4 pt-4 border-t border-zinc-800/50 flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider">
          <div>Продаж: {typeof c.salesCount === 'number' ? c.salesCount : '—'}</div>
          <div>Посл: {formatDate(c.lastSoldAt)}</div>
        </div>
      </div>
    </motion.div>
  )
}

