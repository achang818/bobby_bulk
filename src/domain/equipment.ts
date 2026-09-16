import type { EquipmentTag, Exercise, TodaysContext } from './models'

export const equipmentLabels: Record<EquipmentTag, string> = {
  dumbbells: 'Dumbbells', barbells: 'Barbells / EZ bars', cables: 'Cables', machines: 'Machines',
  benches: 'Benches', 'pull-up-bar': 'Pull-up bar', kettlebells: 'Kettlebells',
  'trap-bar': 'Trap bar', bodyweight: 'Bodyweight', other: 'Other equipment (dip bars, ab wheel, box)',
}
export const equipmentTags = Object.keys(equipmentLabels) as EquipmentTag[]

type EquipmentContext = Pick<TodaysContext, 'availableEquipment'> & { unavailableEquipment?: EquipmentTag[] }

/** Each option is a complete setup; all equipment within that option is required. */
export function exerciseEquipmentOptions(exercise: Exercise): EquipmentTag[][] {
  return exercise.equipment.split(/\s+or\s+/i).map((label) => {
    const tag = equipmentTagFor({ ...exercise, equipment: label })
    const needsBench = ['dumbbells', 'barbells', 'kettlebells'].includes(tag)
      && /bench|incline|chest.supported|bulgarian|seated.*(?:dumbbell|db)/i.test(exercise.name)
    return needsBench ? [tag, 'benches'] : [tag]
  })
}

export function availableExerciseEquipment(exercise: Exercise, context: EquipmentContext): EquipmentTag | undefined {
  return exerciseEquipmentOptions(exercise).find((option) => option.every((tag) =>
    !context.unavailableEquipment?.includes(tag)
    && (tag === 'bodyweight' || context.availableEquipment === undefined || context.availableEquipment.includes(tag))))?.[0]
}

export function isExerciseAvailable(exercise: Exercise, context: EquipmentContext): boolean {
  return availableExerciseEquipment(exercise, context) !== undefined
}

/** Normalizes catalog equipment labels into the broad constraints used by gyms. */
export function equipmentTagFor(exercise: Exercise): EquipmentTag {
  const normalized = exercise.equipment.toLowerCase()
  if (normalized.includes('dumbbell')) return 'dumbbells'
  if (normalized.includes('barbell') || normalized.includes('ez bar')) return 'barbells'
  if (normalized.includes('cable')) return 'cables'
  if (normalized.includes('machine')) return 'machines'
  if (normalized.includes('bench')) return 'benches'
  if (normalized.includes('pull-up') || normalized.includes('pull up')) return 'pull-up-bar'
  if (normalized.includes('kettlebell')) return 'kettlebells'
  if (normalized.includes('trap bar')) return 'trap-bar'
  if (normalized.includes('bodyweight')) return 'bodyweight'
  return 'other'
}
