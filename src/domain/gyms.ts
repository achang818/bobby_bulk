import { equipmentTags } from './equipment'
import type { EquipmentTag, Gym, TodaysContext } from './models'

export const defaultGym: Gym = {
  id: 'default-gym', name: 'Default gym',
  equipment: ['dumbbells', 'barbells', 'cables', 'machines', 'benches', 'pull-up-bar'],
}

/** No inventory or outages are inferred from a different gym. */
export function contextForGym(context: TodaysContext, gym: Gym): TodaysContext {
  return { ...context, gymId: gym.id, availableEquipment: [...gym.equipment],
    unavailableEquipment: context.gymId === gym.id ? context.unavailableEquipment.filter((tag) => gym.equipment.includes(tag) || tag === 'bodyweight') : [],
  }
}

/** Defensive boundary for local snapshots. Discard retired weight inventories. */
export function normalizeGyms(value: unknown): Gym[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((item): Gym[] => {
    if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || !Array.isArray(item.equipment)) return []
    seen.add(item.id)
    const equipment = [...new Set<EquipmentTag>(item.equipment.filter(isEquipmentTag))]
    return [{ id: item.id, name: item.name.trim(), equipment }]
  })
}

function isEquipmentTag(value: unknown): value is EquipmentTag { return equipmentTags.includes(value as EquipmentTag) }
