import type { AvailableLoad, ExerciseFeatures, ExercisePerformance, PerformedSet, LoggedSet, WeightUnit } from './models'

const KG_TO_LB = 2.2046226218

export function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return weight
  return from === 'kg' ? weight * KG_TO_LB : weight / KG_TO_LB
}

export function displayWeight(weight: number, from: WeightUnit | undefined, to: WeightUnit): number {
  return roundWeight(convertWeight(weight, from ?? to, to))
}

/** Preserve a gym's physical weights when display preferences change. */
export function availableLoadsInUnit(loads: AvailableLoad[] | undefined, unit: WeightUnit): AvailableLoad[] | undefined {
  return loads?.map((load) => ({
    ...load, unit,
    increments: [...new Set(load.increments.filter((weight) => Number.isFinite(weight) && weight >= 0)
      .map((weight) => displayWeight(weight, load.unit ?? 'lb', unit)))].sort((a, b) => a - b),
  }))
}

export function effectiveLoad(set: LoggedSet, bodyweightLb?: number): number {
  if (set.loadType === 'bodyweight') return bodyweightLb ?? 0
  if (set.loadType === 'weighted-bodyweight') return (bodyweightLb ?? 0) + set.weight
  if (set.loadType === 'assisted') return Math.max(0, (bodyweightLb ?? 0) - set.weight)
  return set.weight
}

function roundWeight(weight: number): number {
  return Math.round(weight * 10) / 10
}

/** Classification is performed once in pounds; converting display values never reclassifies it. */
export function displayExerciseFeatures(features: ExerciseFeatures, unit: WeightUnit): ExerciseFeatures {
  const weight = (value: number) => displayWeight(value, 'lb', unit)
  const optional = (value?: number) => value === undefined ? undefined : weight(value)
  const set = <T extends PerformedSet>(item: T): T => ({ ...item, weight: weight(item.weight), ...(item.estimatedOneRepMax === undefined ? {} : { estimatedOneRepMax: weight(item.estimatedOneRepMax) }) })
  const performance = (item: ExercisePerformance): ExercisePerformance => ({ ...item, sets: item.sets.map(set), workingSets: item.workingSets.map(set),
    ...(item.bestWorkingSet ? { bestWorkingSet: set(item.bestWorkingSet) } : {}), workingVolume: weight(item.workingVolume),
    heaviestWorkingWeight: optional(item.heaviestWorkingWeight), bestEstimatedOneRepMax: optional(item.bestEstimatedOneRepMax), averageEstimatedOneRepMax: optional(item.averageEstimatedOneRepMax), demonstratedWorkingLoad: optional(item.demonstratedWorkingLoad) })
  return { ...features, recentPerformances: features.recentPerformances.map(performance), mostRecentPerformance: features.mostRecentPerformance ? performance(features.mostRecentPerformance) : undefined,
    bestWorkingWeight: optional(features.bestWorkingWeight), bestEstimatedOneRepMax: optional(features.bestEstimatedOneRepMax), recentWorkingVolume: weight(features.recentWorkingVolume), recentWorkingSets: features.recentWorkingSets.map(set) }
}
