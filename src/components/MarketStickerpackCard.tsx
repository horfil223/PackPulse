import { ExternalLink, Star } from 'lucide-react'
import { motion } from 'framer-motion'
import type { MarketStickerpack } from '../api/backend'

function formatTon(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const t = Date.parse(value)
  if (!Number.isFinite(t)) return '—'
  return new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit' })
}

function formatPeriod(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return ''
  const t1 = Date.parse(start)
  const t2 = Date.parse(end)
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return ''
  
  const diffMs = t2 - t1
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (days < 1) {
     const hours = Math.round(diffMs / (1000 * 60 * 60))
     return `${hours} ч.`
  }
  return `${days} дн.`
}

export function MarketStickerpackCard({
  c,
  starred,
  onToggleStar,
}: {
  c: MarketStickerpack
  starred: boolean
  onToggleStar: () => void
}) {
  const title = c.displayName ?? c.sampleName ?? 'Стикерпак'
  const period = formatPeriod(c.oldestEventAt, c.lastSoldAt ?? new Date().toISOString())
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-900 transition-all group"
    >
      <button
        type="button"
        className="absolute top-0 left-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={onToggleStar}
        aria-label={starred ? 'Убрать из избранного' : 'Добавить в избранное'}
      >
        <Star className={`w-5 h-5 ${starred ? 'text-white fill-white' : 'text-zinc-500 hover:text-white'}`} />
      </button>

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
              {c.collectionAddress.slice(0, 4)}…{c.collectionAddress.slice(-4)}
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
            <div className="text-zinc-200 text-sm font-medium">{formatTon(c.medianSoldTon ?? null)}</div>
          </div>
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Продаж</div>
            <div className="text-zinc-200 text-sm">
              {typeof c.salesCount === 'number' ? c.salesCount : '—'}
              {period && <span className="text-zinc-600 text-xs ml-1">за {period}</span>}
            </div>
          </div>
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Посл. сделка</div>
            <div className="text-zinc-200 text-sm">{formatDate(c.lastSoldAt)}</div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
