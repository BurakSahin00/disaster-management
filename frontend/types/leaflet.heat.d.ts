import type { Layer, LayerOptions } from 'leaflet'

declare module 'leaflet' {
  interface HeatLayerOptions extends LayerOptions {
    minOpacity?: number
    max?: number
    radius?: number
    blur?: number
    gradient?: Record<string, string>
    maxZoom?: number
  }

  class HeatLayer extends Layer {
    constructor(latlngs: [number, number, number][], options?: HeatLayerOptions)
    setLatLngs(latlngs: [number, number, number][]): this
    addLatLng(latlng: [number, number, number]): this
    setOptions(options: HeatLayerOptions): this
    redraw(): this
  }

  export function heatLayer(
    latlngs: [number, number, number][],
    options?: HeatLayerOptions
  ): HeatLayer
}

declare module 'leaflet.heat' {
  // leaflet.heat is a side-effect module that registers L.heatLayer
}
