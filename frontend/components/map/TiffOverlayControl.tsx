'use client'

interface TiffOverlayControlProps {
  loading: boolean
  error: string | null
  available: boolean
  visible: boolean
  opacity: number        // 0–100
  onToggle: () => void
  onOpacityChange: (v: number) => void
}

export function TiffOverlayControl({
  loading,
  error,
  available,
  visible,
  opacity,
  onToggle,
  onOpacityChange,
}: TiffOverlayControlProps) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 158,
        left: 16,
        zIndex: 1000,
        width: 208,
        background: 'white',
        borderRadius: 12,
        border: '1px solid #ebe9e4',
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
        padding: '10px 12px',
        userSelect: 'none',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#6b6864" strokeWidth="1.6">
            <circle cx="8" cy="8" r="3"/>
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#3a3835' }}>
            Satellite Image
          </span>
        </div>

        {!loading && !error && available && (
          <button
            onClick={onToggle}
            style={{
              width: 32,
              height: 18,
              borderRadius: 9,
              border: 'none',
              background: visible ? '#2563EB' : '#d1cfc8',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
            aria-label={visible ? 'Hide satellite image' : 'Show satellite image'}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: visible ? 16 : 2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'white',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              }}
            />
          </button>
        )}
      </div>

      {loading && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#8b8880', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8b8880" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
              <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
            </path>
          </svg>
          <span>Preparing image…</span>
        </div>
      )}

      {!loading && error && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#dc2626' }}>
          Image could not be loaded
        </div>
      )}

      {!loading && !error && !available && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#8b8880' }}>
          Not yet available
        </div>
      )}

      {!loading && !error && available && visible && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#8b8880' }}>Opacity</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#3a3835' }}>{opacity}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => onOpacityChange(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#2563EB', cursor: 'pointer' }}
          />
        </div>
      )}
    </div>
  )
}
