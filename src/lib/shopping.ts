import type { Aisle, Household, Person } from './types'
import { cooksInPlan, mealsAt, recipeOf } from './planner'
import { diffDays, toDate } from './dates'
import { formatQty, guessAisle } from './ingredients'

export interface ListItem {
  key: string
  name: string
  qty: string
  aisle: Aisle
  soon: boolean
  forRecipes: string[]
  cookIds: string[]
  kind: 'recipe' | 'staple' | 'extra'
  extraId?: string
}

export const AISLE_ORDER: Aisle[] = ['veg', 'bakery', 'dry', 'meat', 'fridge', 'freezer', 'other']
export const AISLE_NAMES: Record<Aisle, string> = {
  veg: 'Veg & fruit, by the door',
  bakery: 'Bread',
  dry: 'Dry goods',
  meat: 'Meat & fish',
  fridge: 'Fridges',
  freezer: 'Freezers',
  other: 'Other',
}

const norm = (s: string) => s.toLowerCase().trim()

function toBase(qty?: number, unit?: string): { qty?: number; unit?: string } {
  if (qty == null) return { qty, unit }
  if (unit === 'kg') return { qty: qty * 1000, unit: 'g' }
  if (unit === 'l') return { qty: qty * 1000, unit: 'ml' }
  return { qty, unit }
}

export function isStaple(h: Household, name: string): boolean {
  const n = norm(name)
  return h.settings.staples.some((s) => {
    const x = norm(s)
    return n === x || n.split(/[ ,]+/).includes(x) || (x.length > 4 && n.includes(x))
  })
}

/** Ingredients for planned cooking minus what was already bought for it, plus anything running out. */
export function shoppingList(h: Household, now: Date): ListItem[] {
  const today = toDate(now)
  const map = new Map<string, ListItem & { q: number; unit?: string; mixed: boolean }>()
  for (const c of cooksInPlan(h, now)) {
    const r = recipeOf(h, c.recipeId)
    if (!r) continue
    const scale = c.portions / r.portions
    const eaters = new Set<Person>(mealsAt(h, c.date, c.slot).find((m) => m.cookId === c.id)?.eaters ?? [])
    h.meals.filter((m) => m.cookId === c.id).forEach((m) => m.eaters.forEach((p) => eaters.add(p)))
    for (const i of r.ingredients) {
      if (isStaple(h, i.name)) continue
      const lactoseFree = i.lactose && eaters.has('S')
      const name = lactoseFree ? `${i.name}, lactose-free` : i.name
      const covered = h.bought.some((b) => norm(b.name) === norm(name) && b.cookIds.includes(c.id))
      if (covered) continue
      // What's needed today and tomorrow is its own row, so a quick Lidl run buys only that.
      const soon = diffDays(today, c.date) <= 1
      const key = norm(name) + (soon ? '' : '|later')
      const ex = map.get(key)
      const base = toBase(i.qty, i.unit)
      if (ex) {
        if (ex.unit === base.unit && base.qty != null) ex.q += base.qty * scale
        else ex.mixed = true
        if (!ex.forRecipes.includes(r.name)) ex.forRecipes.push(r.name)
        ex.cookIds.push(c.id)
      } else {
        map.set(key, { key, name, qty: '', aisle: i.aisle, soon, forRecipes: [r.name], cookIds: [c.id], kind: 'recipe', q: (base.qty ?? 0) * scale, unit: base.unit, mixed: base.qty == null })
      }
    }
  }
  const items: ListItem[] = [...map.values()].map(({ q, unit, mixed, ...it }) => ({ ...it, qty: mixed || !q ? '' : formatQty({ qty: q, unit }) }))
  for (const s of h.settings.runningOut) {
    if (map.has(norm(s)) || map.has(norm(s) + '|later')) continue
    items.push({ key: 'staple:' + norm(s), name: s, qty: '', aisle: guessAisle(s), soon: true, forRecipes: [], cookIds: [], kind: 'staple' })
  }
  for (const e of h.extras) {
    items.push({ key: 'extra:' + e.id, name: e.name, qty: '', aisle: guessAisle(e.name), soon: true, forRecipes: [], cookIds: [], kind: 'extra', extraId: e.id })
  }
  return items.sort((a, b) => AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle) || a.name.localeCompare(b.name))
}

/** Tick an item: it counts as bought for every planned meal that needs it right now. */
export function tick(h: Household, item: ListItem, now: Date): Household {
  const next = structuredClone(h)
  if (item.kind === 'extra') next.extras = next.extras.filter((e) => e.id !== item.extraId)
  else if (item.kind === 'staple') next.settings.runningOut = next.settings.runningOut.filter((s) => norm(s) !== norm(item.name))
  else next.bought.push({ name: item.name, at: now.toISOString(), cookIds: item.cookIds })
  return next
}

/** Rough estimate in EUR, so the list shows what a shop will cost. */
const PRICE: [string, number][] = [
  ['salmon', 4.5], ['beef', 4.5], ['mince', 4], ['chicken', 6], ['bacon', 2], ['turkey', 5], ['cream', 1.2], ['cheese', 2.5], ['parmesan', 2.5],
  ['yoghurt', 1.2], ['egg', 2.5], ['pesto', 2], ['avocado', 1.6], ['edamame', 2], ['pastry', 1.5], ['pumpkin', 2], ['potato', 1.2], ['rice', 1.6],
]
export function estimate(items: ListItem[]): number {
  let total = 0
  for (const it of items) {
    const n = norm(it.name)
    total += PRICE.find(([w]) => n.includes(w))?.[1] ?? 1.1
  }
  return Math.round(total)
}

