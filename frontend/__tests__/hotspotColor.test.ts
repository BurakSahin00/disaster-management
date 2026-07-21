import { hotspotFillColor } from '@/components/map/HotspotLayer'

describe('hotspotFillColor', () => {
  it('returns deep red for z >= 2.576 (hot 99%)', () => {
    expect(hotspotFillColor(3.0)).toBe('#dc2626')
    expect(hotspotFillColor(2.576)).toBe('#dc2626')
  })

  it('returns orange for 1.96 <= z < 2.576 (hot 95%)', () => {
    expect(hotspotFillColor(2.0)).toBe('#f97316')
    expect(hotspotFillColor(1.96)).toBe('#f97316')
  })

  it('returns yellow for 1.645 <= z < 1.96 (hot 90%)', () => {
    expect(hotspotFillColor(1.7)).toBe('#fbbf24')
    expect(hotspotFillColor(1.645)).toBe('#fbbf24')
  })

  it('returns deep blue for z <= -2.576 (cold 99%)', () => {
    expect(hotspotFillColor(-3.0)).toBe('#1d4ed8')
    expect(hotspotFillColor(-2.576)).toBe('#1d4ed8')
  })

  it('returns medium blue for -2.576 < z <= -1.96 (cold 95%)', () => {
    expect(hotspotFillColor(-2.0)).toBe('#60a5fa')
    expect(hotspotFillColor(-1.96)).toBe('#60a5fa')
  })

  it('returns pale blue for -1.96 < z <= -1.645 (cold 90%)', () => {
    expect(hotspotFillColor(-1.7)).toBe('#93c5fd')
    expect(hotspotFillColor(-1.645)).toBe('#93c5fd')
  })

  it('returns transparent for not significant', () => {
    expect(hotspotFillColor(0)).toBe('transparent')
    expect(hotspotFillColor(1.0)).toBe('transparent')
    expect(hotspotFillColor(-1.0)).toBe('transparent')
    expect(hotspotFillColor(1.644)).toBe('transparent')
  })
})
