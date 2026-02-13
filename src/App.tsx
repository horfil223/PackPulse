import { useEffect, useMemo, useState } from 'react'
import { TonConnectButton, useTonAddress } from '@tonconnect/ui-react'
import { LayoutGrid, List, RefreshCw } from 'lucide-react'
import { fetchMarketStickerpacks, fetchPortfolio, scanMarketStickerpacks, type MarketStickerpacksResponse, type PortfolioResponse } from './api/backend'
import { MarketStickerpackCard } from './components/MarketStickerpackCard'
import { MarketStickerpackRow } from './components/MarketStickerpackRow'
import { PortfolioCollectionCard } from './components/PortfolioCollectionCard'
import { PortfolioCollectionRow } from './components/PortfolioCollectionRow'

function formatTon(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
}

function shortAddr(a: string) {
  if (!a) return ''
  return `${a.slice(0, 4)}…${a.slice(-4)}`
}

export default function App() {
  const ownerAddress = useTonAddress(false)
  const ownerAddressDisplay = useTonAddress(true)

  const [tab, setTab] = useState<'market' | 'portfolio'>('market')

  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null)
  const [market, setMarket] = useState<MarketStickerpacksResponse | null>(null)
  const [marketMode, setMarketMode] = useState<'active' | 'full'>('active')
  const [marketLimit, setMarketLimit] = useState(60)
  const [marketQuery, setMarketQuery] = useState('')
  const [marketSort, setMarketSort] = useState<'floor_desc' | 'median_desc' | 'sales_desc' | 'name_asc'>('floor_desc')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('packpulse.favorites')
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
    } catch {
      return []
    }
  })
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connected = Boolean(ownerAddress)

  useEffect(() => {
    try {
      localStorage.setItem('packpulse.favorites', JSON.stringify(favorites))
    } catch {}
  }, [favorites])

  const favoritesSet = useMemo(() => new Set(favorites), [favorites])

  const loadPortfolio = async () => {
    if (!ownerAddress) {
      setError('Подключите кошелёк')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPortfolio(ownerAddress)
      setPortfolio(data)
    } catch (e: any) {
      setPortfolio(null)
      setError(e?.message ?? 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  const loadMarket = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMarketStickerpacks(marketLimit, marketMode)
      setMarket(data)
    } catch (e: any) {
      setMarket(null)
      setError(e?.message ?? 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  const scanMarket = async () => {
    setScanning(true)
    setError(null)
    try {
      await scanMarketStickerpacks(10)
      const data = await fetchMarketStickerpacks(marketLimit, 'full')
      setMarket(data)
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка')
    } finally {
      setScanning(false)
    }
  }

  const toggleFavorite = (collectionAddress: string) => {
    setFavorites((prev) => {
      if (prev.includes(collectionAddress)) return prev.filter((x) => x !== collectionAddress)
      return [...prev, collectionAddress]
    })
  }

  useEffect(() => {
    if (tab === 'market') {
      loadMarket()
      return
    }
    setPortfolio(null)
    setError(null)
    if (ownerAddress) loadPortfolio()
  }, [tab, ownerAddress, marketLimit, marketMode])

  const totals = useMemo(() => {
    return {
      floor: portfolio?.totals.totalFloorTon ?? null,
      avg: portfolio?.totals.totalAvgSoldTon ?? null,
    }
  }, [portfolio])

  const marketView = useMemo(() => {
    const items = market?.collections ?? []
    const q = marketQuery.trim().toLowerCase()
    const filteredByFav = onlyFavorites ? items.filter((c) => favoritesSet.has(c.collectionAddress)) : items
    const filtered = q
      ? filteredByFav.filter((c) => {
          const name = (c.displayName ?? c.sampleName ?? '').toLowerCase()
          return name.includes(q) || c.collectionAddress.toLowerCase().includes(q)
        })
      : filteredByFav

    const sorted = filtered.slice()
    if (marketSort === 'floor_desc') {
      sorted.sort((a, b) => (b.floorTon ?? -1) - (a.floorTon ?? -1))
    } else if (marketSort === 'median_desc') {
      sorted.sort((a, b) => ((b.medianSoldTon ?? b.avgSoldTon) ?? -1) - ((a.medianSoldTon ?? a.avgSoldTon) ?? -1))
    } else if (marketSort === 'sales_desc') {
      sorted.sort((a, b) => (Number(b.salesCount ?? -1) || -1) - (Number(a.salesCount ?? -1) || -1))
    } else {
      sorted.sort((a, b) => (a.displayName ?? a.sampleName ?? '').localeCompare(b.displayName ?? b.sampleName ?? '', 'ru'))
    }
    return { total: items.length, items: sorted }
  }, [market, marketQuery, marketSort, favoritesSet, onlyFavorites])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-white/20">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
          <div className="text-left">
            <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
              PackPulse
            </h1>
            <div className="text-zinc-400 text-base font-light">
              {tab === 'market'
                ? 'Рыночный сканер стикеров'
                : 'Ваш портфель коллекций'}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <TonConnectButton />
            <button
              type="button"
              onClick={tab === 'market' ? loadMarket : loadPortfolio}
              disabled={(tab === 'portfolio' && !connected) || loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-black hover:bg-gray-200 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-lg font-medium transition-all active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </button>
          </div>
        </header>

        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex p-1 bg-zinc-900 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('market')}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
                tab === 'market' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Рынок
            </button>
            <button
              type="button"
              onClick={() => setTab('portfolio')}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
                tab === 'portfolio' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Портфель
            </button>
          </div>
        </div>

        <div className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-xs text-zinc-500 uppercase tracking-wider">
          <div>
            {connected
              ? `Кошелёк: ${ownerAddressDisplay ? shortAddr(ownerAddressDisplay) : shortAddr(ownerAddress)}`
              : 'Нет подключения'}
          </div>
          <div>
            {tab === 'market' && market?.updatedAt ? `Обновлено: ${new Date(market.updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}
            {tab === 'portfolio' && portfolio?.updatedAt ? `Обновлено: ${new Date(portfolio.updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-900/30 bg-red-900/10 p-4 text-red-400 mb-8 text-sm">
            {error}
          </div>
        )}

        {tab === 'market' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <div className="flex flex-col gap-1 p-4 border-l border-zinc-800">
                <div className="text-zinc-500 text-xs uppercase tracking-wider">Стикерпаки</div>
                <div className="text-3xl font-light text-white">{market ? marketView.items.length : '—'}</div>
                <div className="text-xs text-zinc-600">
                  {market ? `Всего: ${marketView.total}` : ''}
                </div>
              </div>
              <div className="flex flex-col gap-1 p-4 border-l border-zinc-800">
                <div className="text-zinc-500 text-xs uppercase tracking-wider">Источник</div>
                <div className="text-xl font-light text-white">
                  {marketMode === 'full'
                    ? market?.scan
                      ? `${market.scan.uniqueCollections} в каталоге`
                      : 'Каталог'
                    : market?.source
                      ? `${market.source.uniqueCollections} из истории`
                      : 'История'}
                </div>
              </div>
              <div className="flex flex-col gap-1 p-4 border-l border-zinc-800">
                <div className="text-zinc-500 text-xs uppercase tracking-wider">Режим</div>
                <div className="text-xl font-light text-white">{marketMode === 'full' ? 'Полный каталог' : 'Активные продажи'}</div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-8">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMarketMode('active')}
                  className={`px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                    marketMode === 'active'
                      ? 'bg-zinc-100 border-zinc-100 text-black font-medium'
                      : 'bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                  }`}
                >
                  Активные
                </button>
                <button
                  type="button"
                  onClick={() => setMarketMode('full')}
                  className={`px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                    marketMode === 'full'
                      ? 'bg-zinc-100 border-zinc-100 text-black font-medium'
                      : 'bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                  }`}
                >
                  Все
                </button>
                {marketMode === 'full' && (
                  <button
                    type="button"
                    onClick={scanMarket}
                    disabled={scanning}
                    className="px-4 py-2.5 rounded-lg border border-zinc-800 text-zinc-300 hover:bg-zinc-900 text-sm transition-colors"
                  >
                    {scanning ? 'Сканирую…' : 'Сканировать'}
                  </button>
                )}
              </div>
              <div className="flex-1">
                <input
                  value={marketQuery}
                  onChange={(e) => setMarketQuery(e.target.value)}
                  placeholder="Поиск..."
                  className="w-full rounded-lg bg-zinc-900/50 border border-zinc-800 px-4 py-2.5 outline-none focus:border-zinc-600 text-sm text-white placeholder:text-zinc-600 transition-colors"
                />
              </div>
              <select
                value={marketSort}
                onChange={(e) => setMarketSort(e.target.value as any)}
                className="rounded-lg bg-zinc-900/50 border border-zinc-800 px-4 py-2.5 outline-none focus:border-zinc-600 text-sm text-zinc-300 cursor-pointer"
              >
                <option value="floor_desc">Floor Price ↓</option>
                <option value="median_desc">Median Sold ↓</option>
                <option value="sales_desc">Кол-во продаж ↓</option>
                <option value="name_asc">Название (А-Я)</option>
              </select>
              
              <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setOnlyFavorites((v) => !v)}
                className={`rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                  onlyFavorites ? 'bg-zinc-100 border-zinc-100 text-black' : 'bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                Избранное
              </button>
            </div>

            {!market && loading && (
              viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="h-48 rounded-xl bg-zinc-900 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="h-16 rounded-lg bg-zinc-900 animate-pulse" />
                  ))}
                </div>
              )
            )}

            {market && (
              <>
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {marketView.items.map((c) => (
                      <MarketStickerpackCard
                        key={c.collectionAddress}
                        c={c}
                        starred={favoritesSet.has(c.collectionAddress)}
                        onToggleStar={() => toggleFavorite(c.collectionAddress)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wider">
                          <th className="py-3 pl-4 pr-3 font-medium w-10">★</th>
                          <th className="py-3 px-3 font-medium">Коллекция</th>
                          <th className="py-3 px-3 font-medium text-right cursor-pointer hover:text-white transition-colors" onClick={() => setMarketSort('floor_desc')}>Floor</th>
                          <th className="py-3 px-3 font-medium text-right cursor-pointer hover:text-white transition-colors" onClick={() => setMarketSort('median_desc')}>Median</th>
                          <th className="py-3 px-3 font-medium text-right cursor-pointer hover:text-white transition-colors" onClick={() => setMarketSort('sales_desc')}>Продаж</th>
                          <th className="py-3 px-3 font-medium text-right">Посл. сделка</th>
                          <th className="py-3 pl-3 pr-4 font-medium text-right"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {marketView.items.map((c) => (
                          <MarketStickerpackRow
                            key={c.collectionAddress}
                            c={c}
                            starred={favoritesSet.has(c.collectionAddress)}
                            onToggleStar={() => toggleFavorite(c.collectionAddress)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {marketView.items.length === 0 && (
                  <div className="text-center py-24 text-zinc-600 font-light">
                    Ничего не найдено
                  </div>
                )}
                {marketLimit < 100 && marketView.items.length > 0 && (
                  <div className="mt-12 text-center">
                     <button
                      type="button"
                      onClick={() => setMarketLimit((v) => Math.min(100, v + 20))}
                      className="px-6 py-3 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors text-sm"
                    >
                      Показать больше
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === 'portfolio' && !connected && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-12 text-center text-zinc-500">
            Подключите кошелёк для просмотра портфеля
          </div>
        )}

        {tab === 'portfolio' && connected && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <div className="flex flex-col gap-1 p-4 border-l border-zinc-800">
                <div className="text-zinc-500 text-xs uppercase tracking-wider">Floor Value</div>
                <div className="text-3xl font-light text-white">{formatTon(totals.floor)} TON</div>
              </div>
              <div className="flex flex-col gap-1 p-4 border-l border-zinc-800">
                <div className="text-zinc-500 text-xs uppercase tracking-wider">Est. Value (Sold)</div>
                <div className="text-3xl font-light text-white">{formatTon(totals.avg)} TON</div>
              </div>
              <div className="flex flex-col gap-1 p-4 border-l border-zinc-800">
                <div className="text-zinc-500 text-xs uppercase tracking-wider">Активы</div>
                <div className="text-xl font-light text-white">
                  {portfolio ? `${portfolio.counts.stickersTotal} NFT` : '—'}
                </div>
              </div>
            </div>

            {!portfolio && loading && (
              viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-48 rounded-xl bg-zinc-900 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-16 rounded-lg bg-zinc-900 animate-pulse" />
                  ))}
                </div>
              )
            )}

            {portfolio && (
              <>
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {portfolio.collections.map((c) => (
                      <PortfolioCollectionCard key={c.collectionAddress} c={c} />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wider">
                          <th className="py-3 pl-4 px-3 font-medium">Коллекция</th>
                          <th className="py-3 px-3 font-medium text-center">Шт</th>
                          <th className="py-3 px-3 font-medium text-right">Floor</th>
                          <th className="py-3 px-3 font-medium text-right">Median</th>
                          <th className="py-3 px-3 font-medium text-right">Val (Floor)</th>
                          <th className="py-3 px-3 font-medium text-right">Val (Median)</th>
                          <th className="py-3 pl-3 pr-4 font-medium text-right"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {portfolio.collections.map((c) => (
                          <PortfolioCollectionRow key={c.collectionAddress} c={c} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {portfolio.collections.length === 0 && (
                  <div className="col-span-full text-center py-24 text-zinc-600 font-light">
                    У вас пока нет стикеров
                  </div>
                )}
              </>
            )}
          </>
        )}

        <footer className="mt-24 text-center text-zinc-700 text-xs uppercase tracking-widest pb-8">
          PackPulse · Powered by Getgems API
        </footer>
      </div>
    </div>
  )
}
