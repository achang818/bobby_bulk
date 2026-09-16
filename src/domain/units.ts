import type { AvailableLoad, LoggedSet, WeightUnit } from './models'

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
