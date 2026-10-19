import type { Slot } from './types'
import { L, capitalize, dayWord, monthWord, shortDayWord } from './i18n'

const pad = (n: number) => String(n).padStart(2, '0')

export function toDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: string, n: number): string {
  const d = parse(date)
  d.setDate(d.getDate() + n)
  return toDate(d)
}

export function diffDays(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000)
}

export function weekday(date: string): number {
  return parse(date).getDay()
}

/** Meal index: lunch and dinner of each day in order, so leftovers can be counted in meals. */
export function slotIndex(date: string, slot: Slot): number {
  return diffDays('2000-01-03', date) * 2 + (slot === 'dinner' ? 1 : 0)
}

export function slotKey(date: string, slot: Slot): string {
  return `${date}|${slot}`
}

export function compareSlot(a: { date: string; slot: Slot }, b: { date: string; slot: Slot }): number {
  return slotIndex(a.date, a.slot) - slotIndex(b.date, b.slot)
}

export function dayName(date: string): string {
  return capitalize(dayWord(weekday(date)))
}

export function shortDay(date: string): string {
  return shortDayWord(weekday(date)).toUpperCase()
}

export function longDate(date: string): string {
  const d = parse(date)
  return `${shortDayWord(d.getDay()).toUpperCase()} ${d.getDate()} ${monthWord(d.getMonth()).toUpperCase()}`
}

export function relativeDay(date: string, today: string): string {
  const n = diffDays(today, date)
  if (n === 0) return L('Today', 'Днес')
  if (n === 1) return L('Tomorrow', 'Утре')
  if (n === -1) return L('Yesterday', 'Вчера')
  return dayName(date)
}

/** Monday of the week containing date. */
export function weekStart(date: string): string {
  const wd = weekday(date)
  return addDays(date, wd === 0 ? -6 : 1 - wd)
}

/** The meal slot that is "now": lunch until 15:00, then dinner. */
export function currentSlot(now: Date): { date: string; slot: Slot } {
  return { date: toDate(now), slot: now.getHours() < 15 ? 'lunch' : 'dinner' }
}
