import type { Cook, Household, Meal, Person, Recipe, Slot } from './types'
import { PEOPLE } from './types'
import { addDays, compareSlot, currentSlot, diffDays, slotIndex, slotKey, toDate, weekday } from './dates'

export const HORIZON_DAYS = 4
export const DECIDED_DAYS = 2

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export interface SlotRef {
  date: string
  slot: Slot
}

// ---------- reading the plan ----------

export function recipeOf(h: Household, id?: string): Recipe | undefined {
  return id ? h.recipes.find((r) => r.id === id) : undefined
}

export function cookOf(h: Household, id?: string): Cook | undefined {
  return id ? h.cooks.find((c) => c.id === id) : undefined
}

export function mealsAt(h: Household, date: string, slot: Slot): Meal[] {
  return h.meals.filter((m) => m.date === date && m.slot === slot)
}

export function defaultEaters(h: Household, date: string, slot: Slot): Person[] {
  const wd = weekday(date)
  return PEOPLE.filter((p) => h.settings.pattern[p][slot].includes(wd))
}

/** Who should eat at this meal: an explicit choice for that meal, else the usual weekly pattern. */
export function expectedEaters(h: Household, date: string, slot: Slot): Person[] {
  return h.who[slotKey(date, slot)] ?? defaultEaters(h, date, slot)
}

export function isOffice(h: Household, date: string, slot: Slot, p: Person): boolean {
  return slot === 'lunch' && h.settings.officeDays.includes(weekday(date)) && h.settings.officePeople.includes(p)
}

export function slotIsOffice(h: Household, date: string, slot: Slot, eaters: Person[]): boolean {
  return eaters.some((p) => isOffice(h, date, slot, p))
}

export function horizon(now: Date): SlotRef[] {
  const start = currentSlot(now)
  const today = toDate(now)
  const out: SlotRef[] = []
  for (let d = 0; d < HORIZON_DAYS; d++) {
    const date = addDays(today, d)
    for (const slot of ['lunch', 'dinner'] as Slot[]) {
      if (compareSlot({ date, slot }, start) >= 0) out.push({ date, slot })
    }
  }
  return out
}

export function isIdeaDay(date: string, now: Date): boolean {
  return diffDays(toDate(now), date) >= DECIDED_DAYS
}

export function portionsUsed(h: Household, cookId: string): number {
  return h.meals
    .filter((m) => m.cookId === cookId)
    .reduce((n, m) => n + m.eaters.length + (m.guests ?? 0), 0)
}

export function available(h: Household, cookId: string): number {
  const c = cookOf(h, cookId)
  if (!c || c.status === 'skipped') return 0
  return c.portions - portionsUsed(h, cookId)
}

export function freezerAvailable(h: Household, freezerId: string): number {
  const f = h.freezer.find((x) => x.id === freezerId)
  if (!f) return 0
  const used = h.meals.filter((m) => m.freezerId === freezerId).reduce((n, m) => n + m.eaters.length + (m.guests ?? 0), 0)
  return f.portions - used
}

/** Meals between cooking and eating, e.g. Sunday dinner to Tuesday lunch is 3. */
export function age(c: { date: string; slot: Slot }, at: SlotRef): number {
  return slotIndex(at.date, at.slot) - slotIndex(c.date, c.slot)
}

export function canEatLeftover(h: Household, cook: Cook, p: Person, at: SlotRef): boolean {
  if (cook.status === 'skipped') return false
  const a = age(cook, at)
  if (a <= 0 || a > h.settings.freshness[p]) return false
  const r = recipeOf(h, cook.recipeId)
  if (!r) return false
  if (!r.eaters.includes(p)) return false
  if (isOffice(h, at.date, at.slot, p) && !r.boxable) return false
  return true
}

/** The last meal at which anyone could still eat this cook's leftovers. */
export function lastGoodSlot(h: Household, cook: Cook, p: Person): SlotRef {
  const idx = slotIndex(cook.date, cook.slot) + h.settings.freshness[p]
  const day = Math.floor(idx / 2)
  return { date: addDays('2000-01-03', day), slot: idx % 2 ? 'dinner' : 'lunch' }
}

export function mealName(h: Household, m: Meal): string {
  if (m.kind === 'cook' || m.kind === 'leftover') {
    const c = cookOf(h, m.cookId)
    const r = recipeOf(h, c?.recipeId)
    return r?.name ?? 'Meal'
  }
  if (m.kind === 'freezer') {
    const f = h.freezer.find((x) => x.id === m.freezerId)
    return recipeOf(h, f?.recipeId)?.name ?? 'From the freezer'
  }
  if (m.kind === 'order') return m.label ?? 'Ordering in'
  if (m.kind === 'out') return 'Eating out'
  return m.label ?? 'Something quick'
}

function describeSlot(h: Household, date: string, slot: Slot): string {
  return mealsAt(h, date, slot)
    .map((m) => `${m.kind}:${mealName(h, m)}:${[...m.eaters].sort().join('')}`)
    .sort()
    .join(' / ')
}

// ---------- choosing recipes ----------

function hash(s: string): number {
  let x = 2166136261
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619)
  return (x >>> 0) % 1000
}

export function minuteLimit(h: Household, date: string, slot: Slot, eaters: Person[]): number {
  const weekend = [0, 6].includes(weekday(date))
  if (slot === 'dinner') return weekend ? 90 : 60
  if (slotIsOffice(h, date, slot, eaters)) return 30
  return weekend ? 60 : 40
}

export function fits(h: Household, r: Recipe, date: string, slot: Slot, eaters: Person[], now: Date): boolean {
  if (r.never) return false
  if (r.isIdea && !isIdeaDay(date, now)) return false
  if (!eaters.every((p) => r.eaters.includes(p))) return false
  if (slotIsOffice(h, date, slot, eaters) && !r.boxable) return false
  if (r.minutes > minuteLimit(h, date, slot, eaters)) return false
  return true
}

const PERISHABLE = new Set(['veg', 'meat', 'fridge'])

export function score(h: Household, r: Recipe, date: string, slot: Slot, eaters: Person[]): number {
  let s = 100
  const at = slotIndex(date, slot)
  for (const c of h.cooks) {
    if (c.recipeId !== r.id || c.status === 'skipped') continue
    const d = Math.abs(at - slotIndex(c.date, c.slot)) / 2
    if (d < 3) s -= 70
    else if (d < 7) s -= 30
    else if (d < 14) s -= 10
  }
  s -= Math.min(40, 10 * (r.swapCount ?? 0))
  if (slot === 'dinner' && r.portions > eaters.length) s += 10
  const recent = h.bought.filter((b) => diffDays(b.at.slice(0, 10), date) <= 3).map((b) => b.name.toLowerCase())
  for (const i of r.ingredients) {
    if (PERISHABLE.has(i.aisle) && recent.some((n) => n.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(n))) s += 6
  }
  if (r.isIdea) s -= 5
  s += hash(r.id + date + slot) % 25
  return s
}

export function rankRecipes(h: Household, date: string, slot: Slot, eaters: Person[], now: Date, opts: { ignoreLimits?: boolean } = {}) {
  return h.recipes
    .filter((r) => (opts.ignoreLimits ? !r.never && eaters.every((p) => r.eaters.includes(p)) : fits(h, r, date, slot, eaters, now)))
    .map((r) => ({ recipe: r, score: score(h, r, date, slot, eaters) }))
    .sort((a, b) => b.score - a.score)
}

function newCook(h: Household, r: Recipe, date: string, slot: Slot, eaters: Person[], guests = 0, pinned = false): Meal {
  const cook: Cook = { id: uid(), recipeId: r.id, date, slot, portions: Math.max(r.portions, eaters.length + guests), status: 'planned' }
  h.cooks.push(cook)
  const meal: Meal = { id: uid(), date, slot, eaters: [...eaters], kind: 'cook', cookId: cook.id, pinned, guests: guests || undefined }
  h.meals.push(meal)
  return meal
}

/** Two different dishes cooked for one dinner within the last 4 days means no new split yet. */
function splitDue(h: Household, date: string): boolean {
  const recent = h.meals.filter((m) => m.kind === 'cook' && m.slot === 'dinner' && m.date !== date && Math.abs(diffDays(m.date, date)) < 4)
  const perSlot = new Map<string, number>()
  for (const m of recent) perSlot.set(m.date, (perSlot.get(m.date) ?? 0) + 1)
  return ![...perSlot.values()].some((n) => n >= 2)
}

/** Plan new cooking for the people at this meal who have nothing yet. */
function planNew(h: Household, date: string, slot: Slot, eaters: Person[], now: Date, allowSplit = true) {
  if (!eaters.length) return
  if (allowSplit && slot === 'dinner' && eaters.length >= 2 && isIdeaDay(date, now) && splitDue(h, date)) {
    const solo = h.recipes
      .filter((r) => !r.never && r.eaters.length < PEOPLE.length && eaters.some((p) => r.eaters.includes(p)) && !eaters.every((p) => r.eaters.includes(p)))
      .map((r) => {
        const group = eaters.filter((p) => r.eaters.includes(p))
        return { r, group, s: fits(h, r, date, slot, group, now) ? score(h, r, date, slot, group) : -1 }
      })
      .filter((x) => x.s >= 80)
      .sort((a, b) => b.s - a.s)[0]
    if (solo) {
      newCook(h, solo.r, date, slot, solo.group)
      planNew(h, date, slot, eaters.filter((p) => !solo.group.includes(p)), now, false)
      return
    }
  }
  const best = rankRecipes(h, date, slot, eaters, now)[0]
  if (best) {
    newCook(h, best.recipe, date, slot, eaters)
    return
  }
  // Nobody can share one dish: give the largest group their best dish, then the rest.
  let bestGroup: { r: Recipe; group: Person[]; s: number } | undefined
  for (const r of h.recipes) {
    const group = eaters.filter((p) => r.eaters.includes(p))
    if (!group.length || group.length === eaters.length || !fits(h, r, date, slot, group, now)) continue
    const s = group.length * 1000 + score(h, r, date, slot, group)
    if (!bestGroup || s > bestGroup.s) bestGroup = { r, group, s }
  }
  if (bestGroup) {
    newCook(h, bestGroup.r, date, slot, bestGroup.group)
    planNew(h, date, slot, eaters.filter((p) => !bestGroup!.group.includes(p)), now, false)
    return
  }
  h.meals.push({ id: uid(), date, slot, eaters: [...eaters], kind: 'simple', label: h.settings.quickMeals[0] ?? 'Sandwiches' })
}

// ---------- keeping the plan consistent ----------

export function removeCookChain(h: Household, cookId: string) {
  h.meals = h.meals.filter((m) => m.cookId !== cookId)
  h.cooks = h.cooks.filter((c) => c.id !== cookId)
}

function removeMeal(h: Household, meal: Meal) {
  if (meal.kind === 'cook' && meal.cookId) removeCookChain(h, meal.cookId)
  else h.meals = h.meals.filter((m) => m.id !== meal.id)
}

/** Drop suggestions on the idea days so they can be re-suggested around whatever changed. */
function clearIdeas(h: Household, now: Date) {
  const start = currentSlot(now)
  for (const m of [...h.meals]) {
    if (!h.meals.includes(m) || m.pinned) continue
    if (compareSlot(m, start) < 0 || !isIdeaDay(m.date, now)) continue
    if (m.kind === 'cook') {
      const c = cookOf(h, m.cookId)
      if (c?.status === 'cooked') continue
    }
    if (m.kind === 'cook' || m.kind === 'leftover' || m.kind === 'simple') removeMeal(h, m)
  }
}

/** Fix anything that no longer adds up: too many people on one pot, stale leftovers, people who are away. */
export function validate(h: Household, now: Date) {
  const start = currentSlot(now)
  // People no longer expected at a future meal.
  for (const m of [...h.meals]) {
    if (!h.meals.includes(m) || compareSlot(m, start) < 0) continue
    const want = expectedEaters(h, m.date, m.slot)
    const kept = m.eaters.filter((p) => want.includes(p))
    if (kept.length === m.eaters.length) continue
    if (!kept.length && !(m.guests ?? 0)) removeMeal(h, m)
    else m.eaters = kept
  }
  // The same person covered twice at one meal: keep the first.
  const seen = new Map<string, Set<Person>>()
  for (const m of [...h.meals].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))) {
    const k = slotKey(m.date, m.slot)
    const set = seen.get(k) ?? new Set()
    const dupes = m.eaters.filter((p) => set.has(p))
    if (dupes.length && m.kind !== 'cook') m.eaters = m.eaters.filter((p) => !set.has(p))
    m.eaters.forEach((p) => set.add(p))
    seen.set(k, set)
  }
  // Leftovers someone can no longer eat.
  for (const m of h.meals) {
    if (m.kind !== 'leftover' || compareSlot(m, start) < 0) continue
    const c = cookOf(h, m.cookId)
    if (!c) {
      m.eaters = []
      continue
    }
    m.eaters = m.eaters.filter((p) => canEatLeftover(h, c, p, m))
  }
  // More people than portions: trim the latest leftover meals first.
  for (const c of h.cooks) {
    let over = -available(h, c.id)
    if (over <= 0 || c.status === 'skipped') continue
    const lefts = h.meals.filter((m) => m.cookId === c.id && m.kind === 'leftover' && compareSlot(m, start) >= 0).sort(compareSlot).reverse()
    for (const m of lefts) {
      while (over > 0 && (m.guests ?? 0) > 0) {
        m.guests = m.guests! - 1 || undefined
        over--
      }
      while (over > 0 && m.eaters.length) {
        m.eaters.pop()
        over--
      }
    }
    if (over > 0 && c.status === 'planned') c.portions += over
    // A pot already cooked can't grow: whoever doesn't fit gets something else from fill.
    const own = h.meals.find((m) => m.cookId === c.id && m.kind === 'cook' && compareSlot(m, start) >= 0)
    while (over > 0 && own && (own.guests ?? 0) > 0) {
      own.guests = own.guests! - 1 || undefined
      over--
    }
    while (over > 0 && own && own.eaters.length > 1) {
      own.eaters.pop()
      over--
    }
  }
  h.meals = h.meals.filter((m) => m.eaters.length || (m.guests ?? 0) || m.kind === 'cook')
  // A planned pot nobody eats from is not worth cooking.
  for (const c of [...h.cooks]) {
    const own = h.meals.find((m) => m.cookId === c.id && m.kind === 'cook')
    if (c.status === 'planned' && own && !own.eaters.length && !(own.guests ?? 0)) removeCookChain(h, c.id)
    else if (!own && c.status === 'planned') removeCookChain(h, c.id)
  }
}

/** Give everyone something to eat at every meal in the next four days. */
export function fill(h: Household, now: Date) {
  for (const at of horizon(now)) {
    const expected = expectedEaters(h, at.date, at.slot)
    const covered = new Set(mealsAt(h, at.date, at.slot).flatMap((m) => m.eaters))
    let missing = expected.filter((p) => !covered.has(p))
    if (!missing.length) continue
    // Leftovers first, oldest pot first.
    const pots = h.cooks
      .filter((c) => c.status !== 'skipped' && age(c, at) > 0 && available(h, c.id) > 0)
      .sort(compareSlot)
    for (const pot of pots) {
      for (const p of [...missing]) {
        if (available(h, pot.id) <= 0) break
        if (!canEatLeftover(h, pot, p, at)) continue
        let meal = h.meals.find((m) => m.cookId === pot.id && m.kind === 'leftover' && m.date === at.date && m.slot === at.slot)
        if (!meal) {
          meal = { id: uid(), date: at.date, slot: at.slot, eaters: [], kind: 'leftover', cookId: pot.id }
          h.meals.push(meal)
        }
        meal.eaters.push(p)
        missing = missing.filter((x) => x !== p)
      }
    }
    // If someone still needs a fresh dish, cook it for everyone and keep the leftovers
    // for a later meal, unless this is the last meal they are still good for.
    if (missing.length) {
      const next = at.slot === 'lunch' ? { date: at.date, slot: 'dinner' as Slot } : { date: addDays(at.date, 1), slot: 'lunch' as Slot }
      for (const m of mealsAt(h, at.date, at.slot).filter((x) => x.kind === 'leftover' && !x.pinned)) {
        const pot = cookOf(h, m.cookId)!
        const keep = m.eaters.filter((p) => !canEatLeftover(h, pot, p, next) || !fits(h, recipeOf(h, pot.recipeId)!, at.date, at.slot, [...missing, p], now) && !rankRecipes(h, at.date, at.slot, [...missing, p], now).length)
        missing.push(...m.eaters.filter((p) => !keep.includes(p)))
        m.eaters = keep
      }
      h.meals = h.meals.filter((m) => m.kind !== 'leftover' || m.eaters.length || m.pinned)
      missing = expected.filter((p) => !mealsAt(h, at.date, at.slot).some((m) => m.eaters.includes(p)))
    }
    planNew(h, at.date, at.slot, missing, now)
  }
}

export function prune(h: Household, now: Date) {
  const cutoff = addDays(toDate(now), -60)
  const oldCooks = new Set(h.cooks.filter((c) => c.date < cutoff).map((c) => c.id))
  h.cooks = h.cooks.filter((c) => !oldCooks.has(c.id))
  h.meals = h.meals.filter((m) => m.date >= cutoff)
  h.bought = h.bought.filter((b) => b.at.slice(0, 10) >= addDays(toDate(now), -21))
  h.freezer = h.freezer.filter((f) => f.portions > 0)
  h.log = h.log.slice(-50)
  for (const k of Object.keys(h.who)) if (k.slice(0, 10) < addDays(toDate(now), -2)) delete h.who[k]
}

/** Bring the plan up to date: called on every open and after every change. */
export function replan(h: Household, now: Date, opts: { keepIdeas?: boolean } = {}) {
  if (!opts.keepIdeas) clearIdeas(h, now)
  validate(h, now)
  fill(h, now)
  prune(h, now)
}

// ---------- changes people make ----------

export type Choice =
  | { type: 'recipe'; recipeId: string }
  | { type: 'leftover'; cookId: string }
  | { type: 'freezer'; freezerId: string }
  | { type: 'simple'; label: string }
  | { type: 'order'; amount?: number }
  | { type: 'out' }

export interface Ctx {
  now: Date
  by: Person
}

export interface Result {
  h: Household
  /** Other meals that changed because of this one, e.g. "Tuesday lunch". */
  alsoChanged: SlotRef[]
  message?: string
}

function clone(h: Household): Household {
  return structuredClone(h)
}

function snapshot(h: Household, now: Date): Map<string, string> {
  const out = new Map<string, string>()
  for (const at of horizon(now)) out.set(slotKey(at.date, at.slot), describeSlot(h, at.date, at.slot))
  return out
}

function diffSlots(before: Map<string, string>, h: Household, now: Date, except: SlotRef, chainSlots: Set<string>): SlotRef[] {
  const out: SlotRef[] = []
  for (const at of horizon(now)) {
    const k = slotKey(at.date, at.slot)
    if (at.date === except.date && at.slot === except.slot) continue
    if (before.get(k) === describeSlot(h, at.date, at.slot)) continue
    if (isIdeaDay(at.date, now) && !chainSlots.has(k)) continue
    out.push(at)
  }
  return out
}

function log(h: Household, ctx: Ctx, text: string) {
  h.log.push({ at: ctx.now.toISOString(), by: ctx.by, text })
}

export function slotLabel(at: SlotRef, now: Date): string {
  const n = diffDays(toDate(now), at.date)
  if (n === 0) return at.slot === 'dinner' ? 'Tonight' : 'Lunch today'
  if (n === 1) return `Tomorrow ${at.slot}`
  if (n === -1) return at.slot === 'dinner' ? 'Last night' : 'Yesterday lunch'
  return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday(at.date)]} ${at.slot}`
}

/** The same label inside a sentence: "tonight", "tomorrow lunch", "Tuesday lunch". */
export function slotPhrase(at: SlotRef, now: Date): string {
  const l = slotLabel(at, now)
  return /^(Tonight|Lunch|Tomorrow|Last|Yesterday)/.test(l) ? l[0].toLowerCase() + l.slice(1) : l
}

/** Put a recipe on the first idea-day dinner, replacing the suggestion there. */
function moveToNextFree(h: Household, recipeId: string, eaters: Person[], now: Date): SlotRef | undefined {
  const r = recipeOf(h, recipeId)
  if (!r) return
  for (const at of horizon(now)) {
    if (at.slot !== 'dinner' || !isIdeaDay(at.date, now)) continue
    const here = mealsAt(h, at.date, at.slot)
    if (here.some((m) => m.pinned)) continue
    here.forEach((m) => removeMeal(h, m))
    const who = expectedEaters(h, at.date, at.slot).filter((p) => r.eaters.includes(p))
    newCook(h, r, at.date, at.slot, who.length ? who : eaters, 0, true)
    return at
  }
}

export function changeMeal(h0: Household, mealId: string, choice: Choice, ctx: Ctx): Result {
  const h = clone(h0)
  const m = h.meals.find((x) => x.id === mealId)
  if (!m) return { h: h0, alsoChanged: [] }
  const at = { date: m.date, slot: m.slot }
  const before = snapshot(h, ctx.now)
  const chainSlots = new Set<string>()
  const oldName = mealName(h, m)
  if (m.kind === 'cook' && m.cookId) {
    h.meals.filter((x) => x.cookId === m.cookId).forEach((x) => chainSlots.add(slotKey(x.date, x.slot)))
    const c = cookOf(h, m.cookId)
    const r = recipeOf(h, c?.recipeId)
    if (r && !m.pinned) r.swapCount = (r.swapCount ?? 0) + 1
  }
  const eaters = [...m.eaters]
  const guests = m.guests ?? 0
  removeMeal(h, m)
  let message: string | undefined
  switch (choice.type) {
    case 'recipe': {
      const r = recipeOf(h, choice.recipeId)
      if (r) newCook(h, r, at.date, at.slot, eaters, guests, true)
      break
    }
    case 'leftover': {
      const c = cookOf(h, choice.cookId)
      if (c) h.meals.push({ id: uid(), ...at, eaters, kind: 'leftover', cookId: c.id, pinned: true })
      break
    }
    case 'freezer':
      h.meals.push({ id: uid(), ...at, eaters, kind: 'freezer', freezerId: choice.freezerId, pinned: true })
      break
    case 'simple':
      h.meals.push({ id: uid(), ...at, eaters, guests: guests || undefined, kind: 'simple', label: choice.label, pinned: true })
      break
    case 'order':
      h.meals.push({ id: uid(), ...at, eaters, guests: guests || undefined, kind: 'order', label: 'Ordering in', pinned: true })
      if (choice.amount) h.spending.push({ id: uid(), date: at.date, kind: 'takeaway', amount: choice.amount, by: ctx.by })
      break
    case 'out':
      h.meals.push({ id: uid(), ...at, eaters, kind: 'out', pinned: true })
      break
  }
  const newMeal = h.meals[h.meals.length - 1]
  replan(h, ctx.now)
  log(h, ctx, `changed ${slotPhrase(at, ctx.now)} from ${oldName} to ${newMeal ? mealName(h, newMeal) : 'nothing'}`)
  return { h, alsoChanged: diffSlots(before, h, ctx.now, at, chainSlots), message }
}

/** Ordered in instead of cooking: the dish moves to the next free day, with its leftovers. */
export function orderedInstead(h0: Household, mealId: string, amount: number | undefined, ctx: Ctx): Result {
  const m = h0.meals.find((x) => x.id === mealId)
  const recipeId = m?.kind === 'cook' ? cookOf(h0, m.cookId)?.recipeId : undefined
  const res = changeMeal(h0, mealId, { type: 'order', amount }, ctx)
  if (!recipeId || !m) return res
  const r = recipeOf(res.h, recipeId)
  if (r) r.swapCount = Math.max(0, (r.swapCount ?? 1) - 1)
  const moved = moveToNextFree(res.h, recipeId, m.eaters, ctx.now)
  replan(res.h, ctx.now, { keepIdeas: true })
  if (moved) res.message = `${r?.name} moved to ${slotPhrase(moved, ctx.now)}`
  return res
}

/** Choose who eats at one meal (someone away, or joining). */
export function setEaters(h0: Household, date: string, slot: Slot, eaters: Person[], ctx: Ctx): Result {
  const h = clone(h0)
  const before = snapshot(h, ctx.now)
  const prev = expectedEaters(h, date, slot)
  h.who[slotKey(date, slot)] = PEOPLE.filter((p) => eaters.includes(p))
  const added = eaters.filter((p) => !prev.includes(p))
  const removed = prev.filter((p) => !eaters.includes(p))
  const chainSlots = new Set<string>()
  // Someone joining eats from the pot that is cooked at this meal, so cook a bit more.
  const pot = mealsAt(h, date, slot).find((m) => m.kind === 'cook')
  if (pot && added.length) {
    const c = cookOf(h, pot.cookId)
    const r = recipeOf(h, c?.recipeId)
    let canJoin = added.filter((p) => r?.eaters.includes(p) && !pot.eaters.includes(p))
    if (c?.status === 'cooked') canJoin = canJoin.slice(0, Math.max(0, available(h, c.id)))
    pot.eaters.push(...canJoin)
    if (c?.status === 'planned') c.portions = Math.max(c.portions, portionsUsed(h, c.id))
  }
  for (const m of mealsAt(h, date, slot)) if (m.cookId) h.meals.filter((x) => x.cookId === m.cookId).forEach((x) => chainSlots.add(slotKey(x.date, x.slot)))
  replan(h, ctx.now)
  const name = (p: Person) => h.settings.names[p]
  const bits = [...added.map((p) => `${name(p)} joins`), ...removed.map((p) => `${name(p)} is away`)]
  if (bits.length) log(h, ctx, `${slotPhrase({ date, slot }, ctx.now)}: ${bits.join(', ')}`)
  return { h, alsoChanged: diffSlots(before, h, ctx.now, { date, slot }, chainSlots) }
}

export function setGuests(h0: Household, mealId: string, guests: number, ctx: Ctx): Result {
  const h = clone(h0)
  const m = h.meals.find((x) => x.id === mealId)
  if (!m) return { h: h0, alsoChanged: [] }
  const c = cookOf(h, m.cookId)
  const growable = m.kind === 'cook' && c?.status === 'planned'
  // A pot that's already cooked, a leftover or the freezer can only feed as many guests as there are portions left.
  let cap = Infinity
  if (c && !growable) cap = (m.guests ?? 0) + Math.max(0, available(h, c.id))
  else if (m.kind === 'freezer' && m.freezerId) cap = (m.guests ?? 0) + Math.max(0, freezerAvailable(h, m.freezerId))
  m.guests = Math.min(cap, Math.max(0, guests)) || undefined
  if (growable) c.portions = Math.max(c.portions, portionsUsed(h, c.id))
  replan(h, ctx.now, { keepIdeas: true })
  return { h, alsoChanged: [] }
}

/** Finished cooking: record how many boxes are left so the leftover meals match reality. */
export function markCooked(h0: Household, cookId: string, boxesLeft: number, ctx: Ctx): Result {
  const h = clone(h0)
  const c = cookOf(h, cookId)
  if (!c) return { h: h0, alsoChanged: [] }
  const before = snapshot(h, ctx.now)
  const own = h.meals.find((m) => m.cookId === cookId && m.kind === 'cook')
  const eatenNow = own ? own.eaters.length + (own.guests ?? 0) : 0
  const pastLeftovers = h.meals
    .filter((m) => m.cookId === cookId && m.kind === 'leftover' && compareSlot(m, currentSlot(ctx.now)) < 0)
    .reduce((n, m) => n + m.eaters.length, 0)
  c.status = 'cooked'
  c.confirmed = true
  c.portions = eatenNow + pastLeftovers + Math.max(0, boxesLeft)
  const chainSlots = new Set(h.meals.filter((m) => m.cookId === cookId).map((m) => slotKey(m.date, m.slot)))
  replan(h, ctx.now, { keepIdeas: true })
  log(h, ctx, `cooked ${recipeOf(h, c.recipeId)?.name}, ${boxesLeft} boxes left`)
  return { h, alsoChanged: diffSlots(before, h, ctx.now, c, chainSlots) }
}

/** Morning catch-up for a past meal nobody confirmed. */
export function confirmPast(h0: Household, cookId: string, outcome: 'cooked' | 'ordered' | 'other', amount: number | undefined, ctx: Ctx): Result {
  const h = clone(h0)
  const c = cookOf(h, cookId)
  if (!c) return { h: h0, alsoChanged: [] }
  if (outcome === 'cooked') {
    c.status = 'cooked'
    c.confirmed = true
    replan(h, ctx.now, { keepIdeas: true })
    return { h, alsoChanged: [] }
  }
  const before = snapshot(h, ctx.now)
  const own = h.meals.find((m) => m.cookId === cookId && m.kind === 'cook')
  const eaters = own?.eaters ?? []
  const chainSlots = new Set(h.meals.filter((m) => m.cookId === cookId).map((m) => slotKey(m.date, m.slot)))
  removeCookChain(h, cookId)
  h.meals.push({ id: uid(), date: c.date, slot: c.slot, eaters, kind: outcome === 'ordered' ? 'order' : 'simple', label: outcome === 'ordered' ? 'Ordered in' : 'Something else', pinned: true })
  if (outcome === 'ordered' && amount) h.spending.push({ id: uid(), date: c.date, kind: 'takeaway', amount, by: ctx.by })
  replan(h, ctx.now)
  let message: string | undefined
  if (outcome === 'ordered' && diffDays(c.date, toDate(ctx.now)) <= 2) {
    const moved = moveToNextFree(h, c.recipeId, eaters, ctx.now)
    replan(h, ctx.now, { keepIdeas: true })
    if (moved) message = `${recipeOf(h, c.recipeId)?.name} moved to ${slotPhrase(moved, ctx.now)}`
  }
  return { h, alsoChanged: diffSlots(before, h, ctx.now, c, chainSlots), message }
}

/** Past cooking that still needs a yes/no: the most recent unconfirmed one. */
export function pendingConfirmation(h: Household, now: Date): Cook | undefined {
  const start = currentSlot(now)
  return h.cooks
    .filter((c) => c.status === 'planned' && !c.confirmed && compareSlot(c, start) < 0 && diffDays(c.date, toDate(now)) <= 2)
    .sort(compareSlot)
    .pop()
}

/** Cooked boxes nobody is planned to eat. */
export function spareBoxes(h: Household, now: Date): { cook: Cook; boxes: number; until: SlotRef }[] {
  const start = currentSlot(now)
  const out: { cook: Cook; boxes: number; until: SlotRef }[] = []
  for (const c of h.cooks) {
    if (c.status !== 'cooked') continue
    const boxes = available(h, c.id)
    if (boxes <= 0) continue
    const until = PEOPLE.map((p) => lastGoodSlot(h, c, p)).sort(compareSlot).pop()!
    if (compareSlot(until, start) < 0) continue
    out.push({ cook: c, boxes, until })
  }
  return out
}

export function handleSpare(h0: Household, cookId: string, action: 'artur' | 'freeze' | 'bin', ctx: Ctx): Result {
  const h = clone(h0)
  const c = cookOf(h, cookId)
  if (!c) return { h: h0, alsoChanged: [] }
  let boxes = available(h, cookId)
  if (action === 'freeze') {
    h.freezer.push({ id: uid(), recipeId: c.recipeId, portions: boxes, frozenAt: toDate(ctx.now) })
    c.portions -= boxes
  } else if (action === 'bin') {
    c.portions -= boxes
  } else {
    for (const at of horizon(ctx.now)) {
      if (boxes <= 0) break
      if (!expectedEaters(h, at.date, at.slot).includes('A') || !canEatLeftover(h, c, 'A', at)) continue
      for (const m of mealsAt(h, at.date, at.slot)) {
        if (!m.eaters.includes('A') || m.pinned) continue
        m.eaters = m.eaters.filter((p) => p !== 'A')
        if (!m.eaters.length && !(m.guests ?? 0)) removeMeal(h, m)
      }
      if (mealsAt(h, at.date, at.slot).some((m) => m.eaters.includes('A'))) continue
      h.meals.push({ id: uid(), ...at, eaters: ['A'], kind: 'leftover', cookId, pinned: true })
      boxes--
    }
  }
  replan(h, ctx.now)
  return { h, alsoChanged: [] }
}

/** "Plan it" from a recipe page. */
export function planRecipe(h0: Household, recipeId: string, ctx: Ctx): Result {
  const h = clone(h0)
  const moved = moveToNextFree(h, recipeId, expectedEaters(h, toDate(ctx.now), 'dinner'), ctx.now)
  replan(h, ctx.now, { keepIdeas: true })
  return { h, alsoChanged: [], message: moved ? `Planned for ${slotPhrase(moved, ctx.now)}` : 'No free day in the next four days' }
}

export function lastChangeByOthers(h: Household, me: Person, now: Date) {
  const recent = [...h.log].reverse().find((l) => l.by !== me)
  if (!recent || now.getTime() - new Date(recent.at).getTime() > 24 * 3600 * 1000) return undefined
  return recent
}

export function cooksInPlan(h: Household, now: Date): Cook[] {
  const start = currentSlot(now)
  const end = addDays(toDate(now), HORIZON_DAYS - 1)
  return h.cooks.filter((c) => c.status === 'planned' && compareSlot(c, start) >= 0 && c.date <= end)
}
