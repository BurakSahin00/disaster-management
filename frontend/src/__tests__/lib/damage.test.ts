import { getDamageClass, DAMAGE_CLASSES } from '@/lib/damage'

describe('getDamageClass', () => {
  it('returns correct label for class 0', () => {
    expect(getDamageClass(0).label).toBe('Hasarsız')
  })
  it('returns correct label for class 3', () => {
    expect(getDamageClass(3).label).toBe('Yıkık')
  })
  it('falls back to class 0 for unknown class', () => {
    expect(getDamageClass(99).key).toBe('no-damage')
  })
  it('has 4 damage classes defined', () => {
    expect(Object.keys(DAMAGE_CLASSES)).toHaveLength(4)
  })
})
