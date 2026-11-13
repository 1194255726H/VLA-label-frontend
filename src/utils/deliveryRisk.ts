import type { ProjectStatus } from '../types/api'

export type DeliveryRisk = 'normal' | 'due-soon' | 'overdue'
export const deliveryRiskLabels: Record<DeliveryRisk, string> = { normal: '正常', 'due-soon': '临期', overdue: '逾期' }

function calendarDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const [, year, month, day] = match.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined
  return date.getTime() / 86400000
}

// Both arguments are calendar dates, so daylight saving and UTC offsets do not shift the day boundaries.
export function datasetDeliveryRisk(deliveryAt: string, status: ProjectStatus, today: string): DeliveryRisk | undefined {
  const deliveryDay = calendarDay(deliveryAt)
  const currentDay = calendarDay(today)
  if (deliveryDay === undefined || currentDay === undefined) return undefined
  if (status === 'finished' || status === 'archived') return 'normal'
  const remaining = deliveryDay - currentDay
  return remaining < 0 ? 'overdue' : remaining <= 14 ? 'due-soon' : 'normal'
}
