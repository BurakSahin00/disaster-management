// Mock for leaflet — used by Jest so ESM import doesn't break unit tests
/* eslint-disable @typescript-eslint/no-explicit-any */
const noop = (): any => ({})

const L = {
  geoJSON: () => ({ addTo: noop, remove: noop, bindTooltip: noop }),
  heatLayer: () => ({ addTo: noop, remove: noop }),
  layerGroup: () => ({ addTo: noop, remove: noop, clearLayers: noop }),
  map: noop,
  tileLayer: noop,
}

export default L
module.exports = L
