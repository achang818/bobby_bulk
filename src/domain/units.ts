import type { WeightUnit } from './models'

const KG_TO_LB = 2.2046226218

export function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return weight
  return from === 'kg' ? weight * KG_TO_LB : weight / KG_TO_LB
}

export function displayWeight(weight: number, from: WeightUnit | undefined, to: WeightUnit): number {
  return roundWeight(convertWeight(weight, from ?? to, to))
}

function roundWeight(weight: number): number {
  return Math.round(weight * 10) / 10
}
