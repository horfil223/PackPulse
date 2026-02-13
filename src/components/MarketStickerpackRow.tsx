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

export function MarketStickerpackRow({
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
    <motion.tr
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-zinc-800/50 hover:bg-zinc-900/40 transition-colors group"
    >
      <td className="py-3 pl-4 pr-3 align-middle w-10">
        <button
          type="button"
          onClick={onToggleStar}
          className="text-zinc-600 hover:text-yellow-400 transition-colors"
        >
          <Star className={`w-4 h-4 ${starred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
        </button>
      </td>
      <td className="py-3 px-3 align-middle">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-zinc-800 overflow-hidden shrink-0">
            {c.sampleImage ? (
              <img src={c.sampleImage} alt={title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs font-bold">{title.slice(0, 1)}</div>
            )}
          </div>
          <div className="min-w-0 max-w-[200px] md:max-w-xs">
            <div className="text-sm font-medium text-zinc-200 truncate">{title}</div>
            <div className="text-xs text-zinc-500 truncate font-mono">{c.collectionAddress.slice(0, 4)}...{c.collectionAddress.slice(-4)}</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-3 text-right align-middle text-sm font-medium text-zinc-300">
        {formatTon(c.floorTon)}
      </td>
      <td className="py-3 px-3 text-right align-middle text-sm font-medium text-zinc-300">
        {formatTon(c.medianSoldTon ?? null)}
      </td>
      <td className="py-3 px-3 text-right align-middle text-sm text-zinc-400">
        {typeof c.salesCount === 'number' ? c.salesCount : '—'}
        {period && <div className="text-[10px] text-zinc-600">за {period}</div>}
      </td>
      <td className="py-3 px-3 text-right align-middle text-sm text-zinc-400">
        {formatDate(c.lastSoldAt)}
      </td>
      <td className="py-3 pl-3 pr-4 text-right align-middle">
        <a
          href={`https://getgems.io/collection/${c.collectionAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex p-2 text-zinc-500 hover:text-white transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </td>
    </motion.tr>
  )
}
