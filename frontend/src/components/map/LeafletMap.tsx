import dynamic from 'next/dynamic'

export const LeafletMap = dynamic(
  () => import('./LeafletMapInner').then((m) => m.LeafletMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-slate-800 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Harita yükleniyor...</div>
      </div>
    ),
  }
)
