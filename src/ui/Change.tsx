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
  labelWord,
  type Choice,
  type Result,
} from '../lib/planner'
import { diffDays } from '../lib/dates'
import { isStaple } from '../lib/shopping'
import { Back, Chevron, Sheet, Stepper, back, type AppCtx } from './common'
import { resultToast } from './Plan'
import { L, ingredientName, plural, recipeName, word } from '../lib/i18n'

function toBuy(h: Household, r: Recipe, date: string): string[] {
  const recent = h.bought.filter((b) => diffDays(b.at.slice(0, 10), date) <= 3).map((b) => b.name.toLowerCase())
  return r.ingredients
    .filter((i) => !isStaple(h, i.name))
    .filter((i) => !recent.some((n) => n.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(n)))
    .map((i) => ingredientName({ name: word(i.name), bg: i.bg }))
}

function recipeMeta(h: Household, r: Recipe, date: string): string {
  const need = toBuy(h, r, date)
  const buy =
    need.length === 0
      ? L('nothing to buy', 'нищо за купуване')
      : need.length <= 2
        ? L(`buy ${need.join(', ')}`, `купи ${need.join(', ')}`)
        : L(`buy ${need.length} things`, `купи ${plural(need.length, 'thing', 'things', 'нещо', 'неща')}`)
  return `${r.minutes} ${L('min', 'мин')} · ${buy}${r.isIdea ? L(' · new idea', ' · нова идея') : ''}`
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

  const run = (fn: (x: Household) => Result, done = L('Done.', 'Готово.'), leave = true) => {
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
    run((x) => setEaters(x, date, slot, next, { now, by: me }), L('Updated.', 'Обновено.'), false)
  }

  return (
    <div className="screen no-nav">
      <Back />
      <div className="pad rule" style={{ paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 className="h1">{label}</h1>
        <div className="field">
          <span>{L("Who's eating", 'Кой яде')}</span>
          <div className="row-flex" style={{ flexWrap: 'wrap' }}>
            {PEOPLE.map((p) => (
              <button key={p} className={'chip' + (expected.includes(p) ? ' on' : '')} aria-pressed={expected.includes(p)} onClick={() => togglePerson(p)}>
                {word(h.settings.names[p])}
              </button>
            ))}
          </div>
        </div>
        {meal && (meal.kind === 'cook' || meal.kind === 'simple' || meal.kind === 'order') && (
          <div className="field" style={{ maxWidth: 200 }}>
            <span>{L('Guests', 'Гости')}</span>
            <Stepper label={L('guests', 'гости')} value={meal.guests ?? 0} max={10} onChange={(n) => run((x) => setGuests(x, meal.id, n, { now, by: me }), L('Updated.', 'Обновено.'), false)} />
          </div>
        )}
        {meals.length > 1 && (
          <div className="field">
            <span>{L('Which one to change', 'Кое да сменим')}</span>
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
            {L('Now: ', 'Сега: ')}
            {mealName(h, meal)}
            {meal.kind === 'leftover' ? L(' (leftover)', ' (остатък)') : ''}
            {office ? L(' · office box', ' · кутия за офиса') : ''}
          </p>
        )}
      </div>

      {!meal && <p className="pad muted">{L('Nobody is eating at home. Tap a name above if that changes.', 'Никой не яде вкъщи. Докосни име горе, ако това се промени.')}</p>}

      {meal && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {ranked.slice(0, 3).map(({ recipe }) => (
            <button key={recipe.id} className="option" onClick={() => choose({ type: 'recipe', recipeId: recipe.id })}>
              <span style={{ flex: 1 }}>
                <span className="t">{recipeName(recipe)}</span>
                <span className="m">{recipeMeta(h, recipe, date)}</span>
              </span>
              <Chevron />
            </button>
          ))}
          {leftovers.map((c) => (
            <button key={c.id} className="option" onClick={() => choose({ type: 'leftover', cookId: c.id })}>
              <span style={{ flex: 1 }}>
                <span className="t">
                  {L('Leftover ', 'Остатък ')}
                  {(() => {
                    const lr = recipeOf(h, c.recipeId)
                    return lr ? recipeName(lr) : ''
                  })()}
                </span>
                <span className="m">
                  {plural(available(h, c.id), 'box', 'boxes', 'кутия', 'кутии')} · {L('from', 'от')} {slotPhrase(c, now)}
                </span>
              </span>
              <Chevron />
            </button>
          ))}
          {freezer.map((f) => (
            <button key={f.id} className="option" onClick={() => choose({ type: 'freezer', freezerId: f.id })}>
              <span style={{ flex: 1 }}>
                <span className="t">
                  {(() => {
                    const fr = recipeOf(h, f.recipeId)
                    return fr ? recipeName(fr) : ''
                  })()}
                  {L(' from the freezer', ' от фризера')}
                </span>
                <span className="m">{L(`${freezerAvailable(h, f.id)} portions frozen`, `${freezerAvailable(h, f.id)} замразени порции`)}</span>
              </span>
              <Chevron />
            </button>
          ))}
          <button className="option" onClick={() => choose({ type: 'simple', label: h.settings.quickMeals[0] ?? 'Sandwiches' })}>
            <span style={{ flex: 1 }}>
              <span className="t">{labelWord(h.settings.quickMeals[0] ?? 'Sandwiches')}</span>
              <span className="m">{L('10 min · lazy night', '10 мин · мързелива вечер')}</span>
            </span>
            <Chevron />
          </button>
          <button className="option yellow" onClick={() => setOrdering('')}>
            <span style={{ flex: 1 }}>
              <span className="t">{L('Order in', 'Поръчваме')}</span>
              <span className="m">
                {meal.kind === 'cook'
                  ? L('fine sometimes · the dish moves to another day', 'понякога е ок · ястието се мести за друг ден')
                  : L('fine sometimes · goes into money', 'понякога е ок · отива в разходите')}
              </span>
            </span>
            <Chevron />
          </button>
          <div className="pad stack" style={{ paddingTop: 18 }}>
            {!more ? (
              <div className="grid2">
                <button className="btn ghost" onClick={() => setMore(true)}>
                  {L('Other ideas', 'Други идеи')}
                </button>
                <button className="btn ghost" onClick={() => choose({ type: 'out' })}>
                  {L('Eating out', 'Навън')}
                </button>
              </div>
            ) : (
              <>
                <label className="field">
                  <span>{L('All recipes', 'Всички рецепти')}</span>
                  <input className="input" placeholder={L('Search', 'Търси')} value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
                </label>
                <div>
                  {h.settings.quickMeals.slice(1).map((q) => (
                    <button key={q} className="row-btn" onClick={() => choose({ type: 'simple', label: q })}>
                      <span className="what">{labelWord(q)}</span>
                      <span className="who">{L('QUICK', 'БЪРЗО')}</span>
                    </button>
                  ))}
                  {all.map(({ recipe }) => (
                    <button key={recipe.id} className="row-btn" onClick={() => choose({ type: 'recipe', recipeId: recipe.id })}>
                      <span className="what">{recipeName(recipe)}</span>
                      <span className="who">
                        {recipe.minutes} {L('MIN', 'МИН')}
                      </span>
                    </button>
                  ))}
                  {!all.length && <p className="muted">{L("No recipe fits everyone here. Change who's eating, or add a recipe.", 'Няма рецепта за всички тук. Смени кой яде или добави рецепта.')}</p>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {ordering !== null && meal && (
        <Sheet label={L('Order in', 'Поръчваме')} onClose={() => setOrdering(null)}>
          <h2 className="h2">{L('Order in', 'Поръчваме')}</h2>
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
              <span>{L('How much, in euros? You can add it later.', 'Колко, в евро? Може да го добавиш и по-късно.')}</span>
              <input className="input" inputMode="decimal" placeholder={L('e.g. 24.50', 'напр. 24.50')} value={ordering} onChange={(e) => setOrdering(e.target.value)} autoFocus />
            </label>
            <button className="btn wide">{L('Order in', 'Поръчваме')}</button>
          </form>
        </Sheet>
      )}
    </div>
  )
}
