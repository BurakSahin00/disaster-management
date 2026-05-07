import React from 'react'
export const MapContainer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
export const TileLayer = () => null
export const GeoJSON = () => null
export const useMapEvents = () => ({
  getBounds: () => ({
    getWest: () => 0,
    getSouth: () => 0,
    getEast: () => 1,
    getNorth: () => 1,
  }),
})
