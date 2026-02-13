import { ExternalLink } from 'lucide-react'
import { motion } from 'framer-motion'
import type { PortfolioCollection } from '../api/backend'

function formatTon(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
}

export function PortfolioCollectionRow({ c }: { c: PortfolioCollection }) {
  const title = c.displayName ?? c.sampleName ?? 'Коллекция'
  
  return (
    <motion.tr
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-zinc-800/50 hover:bg-zinc-900/40 transition-colors group"
    >
      <td className="py-3 pl-4 px-3 align-middle">
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
            <div className="text-xs text-zinc-500 truncate font-mono">
              {c.collectionAddress.slice(0, 4)}...{c.collectionAddress.slice(-4)}
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 px-3 text-center align-middle text-sm text-zinc-300">
        <span className="bg-zinc-800/50 px-2 py-1 rounded text-xs">{c.count}</span>
      </td>
      <td className="py-3 px-3 text-right align-middle text-sm font-medium text-zinc-300 whitespace-nowrap">
        {formatTon(c.floorTon)}
      </td>
      <td className="py-3 px-3 text-right align-middle text-sm font-medium text-zinc-300 whitespace-nowrap hidden sm:table-cell">
        {formatTon(c.medianSoldTon ?? c.avgSoldTon)}
      </td>
      <td className="py-3 px-3 text-right align-middle text-sm font-medium text-blue-300/80 whitespace-nowrap hidden md:table-cell">
        {formatTon(c.valueFloorTon)}
      </td>
      <td className="py-3 px-3 text-right align-middle text-sm font-medium text-purple-300/80 whitespace-nowrap hidden lg:table-cell">
        {formatTon(c.valueMedianSoldTon ?? c.valueAvgSoldTon)}
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
