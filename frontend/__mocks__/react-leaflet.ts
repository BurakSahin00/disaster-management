// Mock for react-leaflet — used by Jest so ESM import doesn't break unit tests
/* eslint-disable @typescript-eslint/no-explicit-any */
const noop = (): any => ({})

export const useMap = noop
export const useMapEvent = noop
export const useMapEvents = noop
export const MapContainer = noop
export const TileLayer = noop
export const GeoJSON = noop
