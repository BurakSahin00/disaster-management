import { DAMAGE_CLASSES } from '@/types'

describe('DAMAGE_CLASSES', () => {
  it('has exactly 4 entries', () => {
    expect(DAMAGE_CLASSES).toHaveLength(4)
  })

  it('ids are 0-3 in order', () => {
    expect(DAMAGE_CLASSES.map(d => d.id)).toEqual([0, 1, 2, 3])
  })

  it('each entry has color, light, border, label', () => {
    DAMAGE_CLASSES.forEach(d => {
      expect(d.color).toMatch(/^#/)
      expect(d.light).toMatch(/^#/)
      expect(d.border).toMatch(/^#/)
      expect(d.label).toBeTruthy()
    })
  })
})
