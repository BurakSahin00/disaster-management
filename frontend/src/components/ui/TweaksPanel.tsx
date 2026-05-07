'use client'

import { useEffect, useRef } from 'react'
import Script from 'next/script'

const TWEAKS_CDN = 'https://cdn.jsdelivr.net/npm/tweaks-panel/dist/tweaks-panel.umd.js'

interface TweaksPanelWrapperProps {
  defaults: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

export function TweaksPanelWrapper({ defaults, onChange }: TweaksPanelWrapperProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<unknown>(null)

  function initPanel() {
    const w = window as unknown as Record<string, unknown>
    if (!w.TweaksPanel || !mountRef.current) return

    const TweaksPanelClass = w.TweaksPanel as new (
      el: HTMLElement,
      options: { defaults: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }
    ) => unknown

    panelRef.current = new TweaksPanelClass(mountRef.current, { defaults, onChange })
  }

  useEffect(() => {
    return () => {
      if (panelRef.current && typeof (panelRef.current as { destroy?: () => void }).destroy === 'function') {
        ;(panelRef.current as { destroy: () => void }).destroy()
      }
    }
  }, [])

  return (
    <>
      <Script src={TWEAKS_CDN} onLoad={initPanel} strategy="lazyOnload" />
      <div ref={mountRef} />
    </>
  )
}
