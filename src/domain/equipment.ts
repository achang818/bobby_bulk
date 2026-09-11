import type { EquipmentTag, Exercise } from './models'

/** Normalizes catalog equipment labels into the broad constraints used by gyms. */
export function equipmentTagFor(exercise: Exercise): EquipmentTag {
  const normalized = exercise.equipment.toLowerCase()
  if (normalized.includes('dumbbell')) return 'dumbbells'
  if (normalized.includes('barbell')) return 'barbells'
  if (normalized.includes('cable')) return 'cables'
  if (normalized.includes('machine')) return 'machines'
  if (normalized.includes('bench')) return 'benches'
  if (normalized.includes('pull-up') || normalized.includes('pull up')) return 'pull-up-bar'
  if (normalized.includes('kettlebell')) return 'kettlebells'
  if (normalized.includes('trap bar')) return 'trap-bar'
  if (normalized.includes('bodyweight')) return 'bodyweight'
  return 'other'
}
