import { describe, expect, it } from 'vitest'
import { emptyHousehold } from '../seed'
import type { Household, Person } from '../types'
import {
  available,
  canEatLeftover,
  changeMeal,
  confirmPast,
  cookOf,
  expectedEaters,
  handleSpare,
  horizon,
  markCooked,
  mealsAt,
  orderedInstead,
  pendingConfirmation,
  recipeOf,
  replan,
  setEaters,
  setGuests,
  spareBoxes,
} from '../planner'
import { slotKey } from '../dates'
import { shoppingList, tick } from '../shopping'

// Sunday 18 Oct 2026, 18:00: the plan starts with tonight's dinner.
const SUN = new Date(2026, 9, 18, 18, 0)
const ctx = (now = SUN, by: Person = 'A') => ({ now, by })

function fresh(now = SUN): Household {
  const h = emptyHousehold()
  replan(h, now)
  return h
}

/** Everything the plan must always get right, whatever happened before. */
function checkInvariants(h: Household, now: Date) {
  for (const at of horizon(now)) {
    const meals = mealsAt(h, at.date, at.slot)
    const eaters = meals.flatMap((m) => m.eaters)
    const expected = expectedEaters(h, at.date, at.slot)
    expect([...eaters].sort(), `${slotKey(at.date, at.slot)} covers everyone once`).toEqual([...expected].sort())
    for (const m of meals) {
      if (m.kind !== 'leftover') continue
      const c = cookOf(h, m.cookId)!
      for (const p of m.eaters) expect(canEatLeftover(h, c, p, at), `${p} can eat ${recipeOf(h, c.recipeId)?.name} at ${slotKey(at.date, at.slot)}`).toBe(true)
    }
  }
  for (const c of h.cooks) expect(available(h, c.id), `pot ${recipeOf(h, c.recipeId)?.name} not over-portioned`).toBeGreaterThanOrEqual(0)
}

describe('planner', () => {
  it('fills four days for everyone, within leftover limits', () => {
    const h = fresh()
    checkInvariants(h, SUN)
    expect(h.meals.length).toBeGreaterThan(6)
  })

  it('never sends soup to the office', () => {
    const h = fresh()
    for (const m of h.meals) {
      if (m.slot !== 'lunch' || ![3, 4, 5].includes(new Date(m.date).getDay())) continue
      const r = recipeOf(h, cookOf(h, m.cookId)?.recipeId)
      if (r && m.eaters.some((p) => p === 'A' || p === 'S')) expect(r.boxable).toBe(true)
    }
  })

  it('is stable: planning again changes nothing', () => {
    const h = fresh()
    const again = structuredClone(h)
    replan(again, SUN)
    const names = (x: Household) => x.meals.map((m) => `${m.date}${m.slot}${m.kind}${recipeOf(x, cookOf(x, m.cookId)?.recipeId)?.name}${m.eaters.join('')}`).sort()
    expect(names(again)).toEqual(names(h))
  })

  it('changing a dish also changes the meal that was its leftover', () => {
    let h = fresh()
    // Find a cook whose leftovers are planned for a later meal.
    const pot = h.cooks.find((c) => h.meals.some((m) => m.cookId === c.id && m.kind === 'leftover'))!
    expect(pot).toBeTruthy()
    const own = h.meals.find((m) => m.cookId === pot.id && m.kind === 'cook')!
    const leftoverMeal = h.meals.find((m) => m.cookId === pot.id && m.kind === 'leftover')!
    const other = h.recipes.find((r) => r.id !== pot.recipeId && r.eaters.length === 3 && !r.never)!
    const res = changeMeal(h, own.id, { type: 'recipe', recipeId: other.id }, ctx())
    h = res.h
    checkInvariants(h, SUN)
    expect(h.meals.some((m) => m.cookId === pot.id)).toBe(false)
    const nowThere = mealsAt(h, leftoverMeal.date, leftoverMeal.slot)
    expect(nowThere.every((m) => m.cookId !== pot.id)).toBe(true)
    expect(res.alsoChanged.some((s) => s.date === leftoverMeal.date && s.slot === leftoverMeal.slot)).toBe(true)
  })

  it('refusing a leftover moves the boxes on instead of losing them', () => {
    let h = fresh()
    const left = h.meals.find((m) => m.kind === 'leftover')!
    const potId = left.cookId!
    h = changeMeal(h, left.id, { type: 'simple', label: 'Sandwiches' }, ctx()).h
    checkInvariants(h, SUN)
    expect(mealsAt(h, left.date, left.slot).some((m) => m.label === 'Sandwiches')).toBe(true)
    expect(h.cooks.some((c) => c.id === potId)).toBe(true)
  })

  it('ordering in moves the dish to a free day', () => {
    let h = fresh()
    const tonight = mealsAt(h, '2026-10-18', 'dinner').find((m) => m.kind === 'cook')!
    const recipeId = cookOf(h, tonight.cookId)!.recipeId
    const res = orderedInstead(h, tonight.id, 21.5, ctx())
    h = res.h
    checkInvariants(h, SUN)
    expect(mealsAt(h, '2026-10-18', 'dinner')[0].kind).toBe('order')
    expect(h.spending[0].amount).toBe(21.5)
    expect(h.cooks.some((c) => c.recipeId === recipeId && c.date >= '2026-10-20')).toBe(true)
    expect(res.message).toMatch(/moved to/)
  })

  it('someone away shrinks the meal; someone joining cooks more', () => {
    let h = fresh()
    h = setEaters(h, '2026-10-19', 'dinner', ['A', 'E'], ctx()).h
    checkInvariants(h, SUN)
    expect(mealsAt(h, '2026-10-19', 'dinner').flatMap((m) => m.eaters)).not.toContain('S')
    h = setEaters(h, '2026-10-19', 'dinner', ['A', 'S', 'E'], ctx()).h
    checkInvariants(h, SUN)
  })

  it('nobody home: the pot is not cooked', () => {
    let h = fresh()
    h = setEaters(h, '2026-10-19', 'dinner', [], ctx()).h
    checkInvariants(h, SUN)
    expect(mealsAt(h, '2026-10-19', 'dinner')).toHaveLength(0)
  })

  it('guests make the pot bigger without stealing leftovers', () => {
    let h = fresh()
    const tonight = mealsAt(h, '2026-10-18', 'dinner').find((m) => m.kind === 'cook')!
    const before = available(h, tonight.cookId!)
    h = setGuests(h, tonight.id, 2, ctx()).h
    checkInvariants(h, SUN)
    expect(available(h, tonight.cookId!)).toBe(before)
  })

  it('fewer boxes than planned: later meals are re-planned', () => {
    let h = fresh()
    const pot = h.cooks.find((c) => h.meals.some((m) => m.cookId === c.id && m.kind === 'leftover'))!
    h = markCooked(h, pot.id, 0, ctx()).h
    checkInvariants(h, SUN)
    expect(h.meals.some((m) => m.cookId === pot.id && m.kind === 'leftover')).toBe(false)
  })

  it('extra boxes become spare and can be frozen for Artur', () => {
    let h = fresh()
    const tonight = mealsAt(h, '2026-10-18', 'dinner').find((m) => m.kind === 'cook')!
    h = markCooked(h, tonight.cookId!, 12, ctx()).h
    checkInvariants(h, SUN)
    const spare = spareBoxes(h, SUN)
    expect(spare.length).toBe(1)
    h = handleSpare(h, tonight.cookId!, 'freeze', ctx()).h
    expect(h.freezer[0].portions).toBe(spare[0].boxes)
    checkInvariants(h, SUN)
  })

  it('asks the next morning about last night, and handles "ordered"', () => {
    let h = fresh()
    const mon = new Date(2026, 9, 19, 9, 0)
    replan(h, mon)
    const pending = pendingConfirmation(h, mon)!
    expect(pending.date).toBe('2026-10-18')
    h = confirmPast(h, pending.id, 'ordered', 18, ctx(mon)).h
    checkInvariants(h, mon)
    expect(pendingConfirmation(h, mon)).toBeUndefined()
  })

  it('a long random week of changes never breaks the plan', () => {
    // Ids are random too, so run many seeds of everything to catch rare orderings.
    const real = Math.random
    try {
      for (let run = 1; run <= 100; run++) {
        let r = run * 7919
        Math.random = () => {
          r = (r * 16807) % 2147483647
          return r / 2147483647
        }
        fuzz(run)
      }
    } finally {
      Math.random = real
    }
  }, 120_000)
})

function fuzz(run: number) {
    let h = fresh()
    let now = new Date(SUN)
    let seed = run
    const rnd = (n: number) => {
      seed = (seed * 9301 + 49297) % 233280
      return Math.floor((seed / 233280) * n)
    }
    for (let step = 0; step < 120; step++) {
      if (step % 10 === 9) {
        now = new Date(now.getTime() + 12 * 3600 * 1000)
        replan(h, now, { keepIdeas: true })
      }
      const future = horizon(now)
      const at = future[rnd(future.length)]
      const meals = mealsAt(h, at.date, at.slot)
      const m = meals[rnd(Math.max(1, meals.length))]
      const action = rnd(6)
      if (action === 0 && m) h = changeMeal(h, m.id, { type: 'recipe', recipeId: h.recipes[rnd(h.recipes.length)].id }, ctx(now)).h
      else if (action === 1 && m) h = changeMeal(h, m.id, { type: 'simple', label: 'Sandwiches' }, ctx(now)).h
      else if (action === 2) h = setEaters(h, at.date, at.slot, (['A', 'S', 'E'] as Person[]).filter(() => rnd(3) > 0), ctx(now)).h
      else if (action === 3 && m?.kind === 'cook') h = markCooked(h, m.cookId!, rnd(5), ctx(now)).h
      else if (action === 4 && m?.kind === 'cook') h = orderedInstead(h, m.id, 15, ctx(now)).h
      else if (action === 5 && m) h = setGuests(h, m.id, rnd(3), ctx(now)).h
      try {
        checkInvariants(h, now)
      } catch (e) {
        throw new Error(`run ${run} step ${step} action ${action}: ${(e as Error).message}`)
      }
    }
}

describe('shopping', () => {
  it('lists what planned dishes need, minus staples, and ticking removes it', () => {
    let h = fresh()
    const list = shoppingList(h, SUN)
    expect(list.length).toBeGreaterThan(3)
    expect(list.some((i) => i.name === 'salt')).toBe(false)
    const first = list[0]
    h = tick(h, first, SUN)
    expect(shoppingList(h, SUN).some((i) => i.key === first.key)).toBe(false)
  })

  it('a new dish needing the same thing brings it back', () => {
    let h = fresh()
    const list = shoppingList(h, SUN)
    for (const it of list) h = tick(h, it, SUN)
    expect(shoppingList(h, SUN)).toHaveLength(0)
    const tonight = mealsAt(h, '2026-10-18', 'dinner')[0]
    const other = h.recipes.find((r) => r.name === 'Moussaka')!
    h = changeMeal(h, tonight.id, { type: 'recipe', recipeId: other.id }, ctx()).h
    expect(shoppingList(h, SUN).length).toBeGreaterThan(0)
  })
})
