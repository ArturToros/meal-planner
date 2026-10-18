import { useCallback, useEffect, useRef, useState } from 'react'
import { backend } from './backend'
import { emptyHousehold, ideaPool } from './seed'
import { replan, uid } from './planner'
import { parseIngredient } from './ingredients'
import { weekStart, toDate } from './dates'
import { PEOPLE, type Household, type Person, type Recipe } from './types'

export type Action = (h: Household) => Household

export interface Toast {
  text: string
  undo?: Household
}

const ME_KEY = 'meal-planner-me'

export function getMe(): Person | null {
  try {
    return (localStorage.getItem(ME_KEY) as Person) || null
  } catch {
    return null
  }
}

export function setMe(p: Person) {
  try {
    localStorage.setItem(ME_KEY, p)
  } catch {
    /* private mode: ask again next time */
  }
}

/** Fill in fields added after the household was first saved. */
function upgrade(h: Household): Household {
  const base = emptyHousehold()
  return { ...base, ...h, who: h.who ?? {}, settings: { ...base.settings, ...h.settings } }
}

/** Two new recipe ideas each week, from the built-in pool when reading isn't available. */
export function addWeeklyIdeas(h: Household, now: Date, fresh?: Household['recipes']): Household {
  const week = weekStart(toDate(now))
  if (h.ideasWeek === week) return h
  const next = structuredClone(h)
  next.ideasWeek = week
  // Drop last week's ideas nobody kept.
  next.recipes = next.recipes.filter((r) => !r.isIdea || r.ideaWeek === week || next.cooks.some((c) => c.recipeId === r.id && c.status === 'cooked'))
  const have = new Set(next.recipes.map((r) => r.name.toLowerCase()))
  const pool = (fresh ?? ideaPool()).filter((r) => !have.has(r.name.toLowerCase()))
  const offset = Math.floor(new Date(week).getTime() / 6048e5) % Math.max(1, pool.length)
  const picks = [...pool.slice(offset), ...pool.slice(0, offset)].slice(0, 2)
  for (const r of picks) next.recipes.push({ ...r, isIdea: true, ideaWeek: week })
  return next
}

interface ReadIdea {
  name: string
  minutes: number
  portions: number
  ingredients: { name: string; qty: number | null; unit: string }[]
  steps: string
  boxable: boolean
}

/** Swap this week's built-in ideas for the ones Claude picked for this household. Ideas already planned stay. */
export function swapInIdeas(h: Household, week: string, ideas: ReadIdea[], now: Date): Household {
  if (h.ideasFrom === week) return h
  const next = structuredClone(h)
  next.ideasFrom = week
  const used = new Set(next.cooks.map((c) => c.recipeId))
  const have = new Set(next.recipes.map((r) => r.name.toLowerCase()))
  const replaceable = next.recipes.filter((r) => r.isIdea && r.ideaWeek === week && !used.has(r.id))
  const add = ideas.filter((x) => x.name && !have.has(x.name.toLowerCase())).slice(0, replaceable.length)
  const drop = new Set(replaceable.slice(0, add.length).map((r) => r.id))
  next.recipes = next.recipes.filter((r) => !drop.has(r.id))
  for (const x of add) {
    const r: Recipe = {
      id: uid(),
      name: x.name,
      minutes: x.minutes,
      portions: x.portions,
      ingredients: x.ingredients.map((i) => ({ ...parseIngredient(i.name)!, qty: i.qty ?? undefined, unit: i.unit || undefined })).filter((i) => i.name),
      steps: x.steps,
      eaters: [...PEOPLE],
      boxable: x.boxable,
      isIdea: true,
      ideaWeek: week,
      createdAt: now.toISOString(),
    }
    next.recipes.push(r)
  }
  replan(next, now, { keepIdeas: true })
  return next
}

export function useHousehold() {
  const [h, setH] = useState<Household | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const ref = useRef<Household | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())

  const apply = useCallback((next: Household) => {
    ref.current = next
    setH(next)
  }, [])

  const refresh = useCallback(async () => {
    try {
      let loaded = await backend.load()
      if (!loaded) {
        const fresh = emptyHousehold()
        replan(fresh, new Date())
        const res = await backend.save(fresh, 0)
        loaded = res === 'ok' ? { ...fresh, version: 1 } : await backend.load()
      }
      if (!loaded) return
      const up = upgrade(loaded)
      // Keep the rolling plan current without writing on every open.
      const view = addWeeklyIdeas(up, new Date())
      replan(view, new Date(), { keepIdeas: true })
      const changed = JSON.stringify(view) !== JSON.stringify(up)
      apply(view)
      setError(null)
      if (changed) {
        const res = await backend.save(view, up.version)
        if (res === 'ok') apply({ ...view, version: up.version + 1 })
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }, [apply])

  useEffect(() => {
    refresh()
    return backend.subscribe(() => {
      // Ignore our own echo; anything newer reloads.
      backend.load().then((x) => {
        if (x && (!ref.current || x.version > ref.current.version)) apply(upgrade(x))
      })
    })
  }, [refresh, apply])

  /** Apply a change now, then save it; if someone else saved first, redo it on top of theirs. */
  const dispatch = useCallback(
    (action: Action) => {
      const cur = ref.current
      if (!cur) return
      apply({ ...action(cur), version: cur.version })
      queue.current = queue.current.then(async () => {
        setSaving(true)
        try {
          for (let attempt = 0; attempt < 4; attempt++) {
            const base = attempt === 0 ? cur : upgrade((await backend.load())!)
            const next = action(base)
            const res = await backend.save(next, base.version)
            if (res === 'ok') {
              if (ref.current && ref.current.version <= base.version) apply({ ...next, version: base.version + 1 })
              setError(null)
              return
            }
          }
          setError('Could not save. Check the connection and try again.')
        } catch (e) {
          setError((e as Error).message)
        } finally {
          setSaving(false)
        }
      })
    },
    [apply],
  )

  // Once a week, ask Claude for two ideas that suit this household. Built-in ideas show until they arrive.
  const askedIdeas = useRef<string | null>(null)
  useEffect(() => {
    if (!h || !backend.online) return
    const week = weekStart(toDate(new Date()))
    if (h.ideasWeek !== week || h.ideasFrom === week || askedIdeas.current === week) return
    askedIdeas.current = week
    const recent = h.cooks.filter((c) => c.status === 'cooked').slice(-12).map((c) => h.recipes.find((r) => r.id === c.recipeId)?.name).filter(Boolean)
    backend
      .read<{ ideas: ReadIdea[] }>({ kind: 'ideas', context: { have: h.recipes.filter((r) => !r.isIdea).map((r) => r.name), recent } })
      .then((res) => dispatch((x) => swapInIdeas(x, week, res.ideas ?? [], new Date())))
      .catch(() => {
        /* the built-in ideas stay for this week */
      })
  }, [h, dispatch])

  return { h, dispatch, error, saving, refresh }
}
