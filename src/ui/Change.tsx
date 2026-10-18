import { useMemo, useState } from 'react'
import type { Household, Person, Recipe, Slot } from '../lib/types'
import { PEOPLE } from '../lib/types'
import {
  available,
  canEatLeftover,
  changeMeal,
  cookOf,
  expectedEaters,
  freezerAvailable,
  mealName,
  mealsAt,
  orderedInstead,
  rankRecipes,
  recipeOf,
  setEaters,
  setGuests,
  slotIsOffice,
  slotLabel,
  slotPhrase,
  type Choice,
  type Result,
} from '../lib/planner'
import { diffDays } from '../lib/dates'
import { isStaple } from '../lib/shopping'
import { Back, Chevron, Sheet, Stepper, back, type AppCtx } from './common'
import { resultToast } from './Plan'

function toBuy(h: Household, r: Recipe, date: string): string[] {
  const recent = h.bought.filter((b) => diffDays(b.at.slice(0, 10), date) <= 3).map((b) => b.name.toLowerCase())
  return r.ingredients
    .filter((i) => !isStaple(h, i.name))
    .filter((i) => !recent.some((n) => n.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(n)))
    .map((i) => i.name)
}

function recipeMeta(h: Household, r: Recipe, date: string): string {
  const need = toBuy(h, r, date)
  const buy = need.length === 0 ? 'nothing to buy' : need.length <= 2 ? `buy ${need.join(', ')}` : `buy ${need.length} things`
  return `${r.minutes} min · ${buy}${r.isIdea ? ' · new idea' : ''}`
}

export function Change({ ctx, date, slot }: { ctx: AppCtx; date: string; slot: Slot }) {
  const { h, now, me, dispatch } = ctx
  const meals = mealsAt(h, date, slot)
  const [pick, setPick] = useState(0)
  const [more, setMore] = useState(false)
  const [search, setSearch] = useState('')
  const [ordering, setOrdering] = useState<string | null>(null)
  const meal = meals[Math.min(pick, meals.length - 1)]
  const expected = expectedEaters(h, date, slot)
  const eaters = meal?.eaters ?? expected
  const label = slotLabel({ date, slot }, now)
  const currentRecipe = meal?.kind === 'cook' ? cookOf(h, meal.cookId)?.recipeId : undefined

  const run = (fn: (x: Household) => Result, done = 'Done.', leave = true) => {
    const before = h
    let res: Result | undefined
    dispatch((x) => {
      res = fn(x)
      return res.h
    })
    if (res) resultToast(ctx, before, res, done)
    if (leave) back()
  }
  const choose = (choice: Choice) => {
    if (!meal) return
    run((x) => changeMeal(x, meal.id, choice, { now, by: me }))
  }

  const ranked = useMemo(() => rankRecipes(h, date, slot, eaters, now).filter((x) => x.recipe.id !== currentRecipe), [h, date, slot, eaters, now, currentRecipe])
  const all = useMemo(
    () =>
      rankRecipes(h, date, slot, eaters, now, { ignoreLimits: true })
        .filter((x) => x.recipe.id !== currentRecipe)
        .filter((x) => !search || x.recipe.name.toLowerCase().includes(search.toLowerCase())),
    [h, date, slot, eaters, now, currentRecipe, search],
  )
  const leftovers = h.cooks.filter(
    (c) => c.id !== meal?.cookId && available(h, c.id) >= eaters.length && eaters.length > 0 && eaters.every((p) => canEatLeftover(h, c, p, { date, slot })),
  )
  const freezer = h.freezer.filter((f) => freezerAvailable(h, f.id) >= Math.max(1, eaters.length))
  const office = slotIsOffice(h, date, slot, eaters)

  const togglePerson = (p: Person) => {
    const next = expected.includes(p) ? expected.filter((x) => x !== p) : [...expected, p]
    run((x) => setEaters(x, date, slot, next, { now, by: me }), 'Updated.', false)
  }

  return (
    <div className="screen no-nav">
      <Back />
      <div className="pad rule" style={{ paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 className="h1">{label}</h1>
        <div className="field">
          <span>Who's eating</span>
          <div className="row-flex" style={{ flexWrap: 'wrap' }}>
            {PEOPLE.map((p) => (
              <button key={p} className={'chip' + (expected.includes(p) ? ' on' : '')} aria-pressed={expected.includes(p)} onClick={() => togglePerson(p)}>
                {h.settings.names[p]}
              </button>
            ))}
          </div>
        </div>
        {meal && (meal.kind === 'cook' || meal.kind === 'simple' || meal.kind === 'order') && (
          <div className="field" style={{ maxWidth: 200 }}>
            <span>Guests</span>
            <Stepper label="guests" value={meal.guests ?? 0} max={10} onChange={(n) => run((x) => setGuests(x, meal.id, n, { now, by: me }), 'Updated.', false)} />
          </div>
        )}
        {meals.length > 1 && (
          <div className="field">
            <span>Which one to change</span>
            <div className="row-flex" style={{ flexWrap: 'wrap' }}>
              {meals.map((m, i) => (
                <button key={m.id} className={'chip' + (i === pick ? ' on' : '')} aria-pressed={i === pick} onClick={() => setPick(i)}>
                  {mealName(h, m)} · {m.eaters.join(' ')}
                </button>
              ))}
            </div>
          </div>
        )}
        {meal && (
          <p className="mono muted" style={{ margin: 0 }}>
            Now: {mealName(h, meal)}
            {meal.kind === 'leftover' ? ' (leftover)' : ''}
            {office ? ' · office box' : ''}
          </p>
        )}
      </div>

      {!meal && <p className="pad muted">Nobody is eating at home. Tap a name above if that changes.</p>}

      {meal && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {ranked.slice(0, 3).map(({ recipe }) => (
            <button key={recipe.id} className="option" onClick={() => choose({ type: 'recipe', recipeId: recipe.id })}>
              <span style={{ flex: 1 }}>
                <span className="t">{recipe.name}</span>
                <span className="m">{recipeMeta(h, recipe, date)}</span>
              </span>
              <Chevron />
            </button>
          ))}
          {leftovers.map((c) => (
            <button key={c.id} className="option" onClick={() => choose({ type: 'leftover', cookId: c.id })}>
              <span style={{ flex: 1 }}>
                <span className="t">Leftover {recipeOf(h, c.recipeId)?.name}</span>
                <span className="m">
                  {available(h, c.id)} boxes · from {slotPhrase(c, now)}
                </span>
              </span>
              <Chevron />
            </button>
          ))}
          {freezer.map((f) => (
            <button key={f.id} className="option" onClick={() => choose({ type: 'freezer', freezerId: f.id })}>
              <span style={{ flex: 1 }}>
                <span className="t">{recipeOf(h, f.recipeId)?.name} from the freezer</span>
                <span className="m">{freezerAvailable(h, f.id)} portions frozen</span>
              </span>
              <Chevron />
            </button>
          ))}
          <button className="option" onClick={() => choose({ type: 'simple', label: h.settings.quickMeals[0] ?? 'Sandwiches' })}>
            <span style={{ flex: 1 }}>
              <span className="t">{h.settings.quickMeals[0] ?? 'Sandwiches'}</span>
              <span className="m">10 min · lazy night</span>
            </span>
            <Chevron />
          </button>
          <button className="option yellow" onClick={() => setOrdering('')}>
            <span style={{ flex: 1 }}>
              <span className="t">Order in</span>
              <span className="m">{meal.kind === 'cook' ? 'fine sometimes · the dish moves to another day' : 'fine sometimes · goes into money'}</span>
            </span>
            <Chevron />
          </button>
          <div className="pad stack" style={{ paddingTop: 18 }}>
            {!more ? (
              <div className="grid2">
                <button className="btn ghost" onClick={() => setMore(true)}>
                  Other ideas
                </button>
                <button className="btn ghost" onClick={() => choose({ type: 'out' })}>
                  Eating out
                </button>
              </div>
            ) : (
              <>
                <label className="field">
                  <span>All recipes</span>
                  <input className="input" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
                </label>
                <div>
                  {h.settings.quickMeals.slice(1).map((q) => (
                    <button key={q} className="row-btn" onClick={() => choose({ type: 'simple', label: q })}>
                      <span className="what">{q}</span>
                      <span className="who">QUICK</span>
                    </button>
                  ))}
                  {all.map(({ recipe }) => (
                    <button key={recipe.id} className="row-btn" onClick={() => choose({ type: 'recipe', recipeId: recipe.id })}>
                      <span className="what">{recipe.name}</span>
                      <span className="who">{recipe.minutes} MIN</span>
                    </button>
                  ))}
                  {!all.length && <p className="muted">No recipe fits everyone here. Change who's eating, or add a recipe.</p>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {ordering !== null && meal && (
        <Sheet label="Order in" onClose={() => setOrdering(null)}>
          <h2 className="h2">Order in</h2>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              const amount = parseFloat(ordering.replace(',', '.')) || undefined
              if (meal.kind === 'cook') run((x) => orderedInstead(x, meal.id, amount, { now, by: me }))
              else choose({ type: 'order', amount })
              setOrdering(null)
            }}
          >
            <label className="field">
              <span>How much, in euros? You can add it later.</span>
              <input className="input" inputMode="decimal" placeholder="e.g. 24.50" value={ordering} onChange={(e) => setOrdering(e.target.value)} autoFocus />
            </label>
            <button className="btn wide">Order in</button>
          </form>
        </Sheet>
      )}
    </div>
  )
}
