export interface DamageClass {
  key: string
  label: string
  color: string
}

export const DAMAGE_CLASSES: Record<number, DamageClass> = {
  0: { key: 'no-damage',    label: 'Hasarsız',     color: '#22c55e' },
  1: { key: 'minor-damage', label: 'Az Hasarlı',   color: '#eab308' },
  2: { key: 'major-damage', label: 'Ağır Hasarlı', color: '#f97316' },
  3: { key: 'destroyed',    label: 'Yıkık',        color: '#ef4444' },
}

export function getDamageClass(damageClass: number): DamageClass {
  return DAMAGE_CLASSES[damageClass] ?? DAMAGE_CLASSES[0]
}
