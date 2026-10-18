import { useState } from 'react'
import type { Household, Meal, Person } from '../lib/types'
import {
  available,
  confirmPast,
  cookOf,
  handleSpare,
  horizon,
  isIdeaDay,
  isOffice,
  lastChangeByOthers,
  lastGoodSlot,
  mealName,
  mealsAt,
  pendingConfirmation,
  recipeOf,
  slotLabel,
  slotPhrase,
  spareBoxes,
  type Result,
  type SlotRef,
} from '../lib/planner'
import { addDays, compareSlot, currentSlot, longDate, shortDay, toDate } from '../lib/dates'
import { shoppingList } from '../lib/shopping'
import { PEOPLE } from '../lib/types'
import { Icon, letters, type AppCtx } from './common'

export function resultToast(ctx: AppCtx, before: Household, res: Result, done = 'Done.') {
  const also = res.alsoChanged.map((s) => slotPhrase(s, ctx.now))
  const text = [done, res.message, also.length ? `Also changed: ${also.join(', ')}.` : ''].filter(Boolean).join(' ')
  ctx.toast({ text, undo: before })
}

/** The meal to show big at the top: now, or the next one late in the evening. */
function heroSlot(now: Date): SlotRef {
  const cur = currentSlot(now)
  if (cur.slot === 'dinner' && now.getHours() >= 21) return { date: addDays(cur.date, 1), slot: 'lunch' }
  return cur
}

function heroTitle(at: SlotRef, now: Date): string {
  const today = toDate(now)
  if (at.date === today) return at.slot === 'dinner' ? 'Tonight' : 'Lunch today'
  return at.slot === 'dinner' ? 'Tomorrow night' : 'Tomorrow lunch'
}

function mealText(h: Household, m: Meal, now: Date) {
  const name = mealName(h, m)
  if (m.kind === 'leftover') {
    const c = cookOf(h, m.cookId)
    return { name, extra: c ? `leftover from ${slotPhrase(c, now)}` : 'leftover' }
  }
  if (m.kind === 'freezer') return { name, extra: 'from the freezer' }
  return { name, extra: '' }
}

export function slotText(h: Household, at: SlotRef) {
  const meals = mealsAt(h, at.date, at.slot)
  const office = PEOPLE.some((p) => isOffice(h, at.date, at.slot, p) && meals.some((m) => m.eaters.includes(p)))
  return {
    meals,
    office,
    name: meals.map((m) => mealName(h, m) + (m.kind === 'leftover' ? ' (leftover)' : '')).join(' / '),
    who: meals.map((m) => letters(m.eaters) + (m.guests ? ` +${m.guests}` : '')).join(' / '),
  }
}

function Hero({ ctx, at }: { ctx: AppCtx; at: SlotRef }) {
  const { h, now } = ctx
  const meals = mealsAt(h, at.date, at.slot)
  const list = shoppingList(h, now)
  const changeHref = `#/change/${at.date}/${at.slot}`
  if (!meals.length) {
    return (
      <div className="pad rule" style={{ padding: '28px 22px 22px' }}>
        <div className="mono">{heroTitle(at, now)}</div>
        <h1 className="h1 xl" style={{ margin: '12px 0' }}>
          Nobody home
        </h1>
        <a className="btn ghost small" href={changeHref}>
          Someone is eating
        </a>
      </div>
    )
  }
  return (
    <div className="rule" style={{ padding: '24px 22px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="mono">{heroTitle(at, now)}</div>
      {meals.map((m) => {
        const t = mealText(h, m, now)
        const c = cookOf(h, m.cookId)
        const r = recipeOf(h, c?.recipeId ?? h.freezer.find((f) => f.id === m.freezerId)?.recipeId)
        let line = ''
        if (m.kind === 'cook' && c && r) {
          const later = h.meals.filter((x) => x.cookId === c.id && x.kind === 'leftover').sort(compareSlot)
          const eatNow = m.eaters.length + (m.guests ?? 0)
          const laterText = later.map((x) => `${x.eaters.length} for ${slotPhrase(x, now)}`).join(', ')
          const spare = available(h, c.id)
          const toBuy = list.filter((i) => i.cookIds.includes(c.id)).length
          line = [
            `Cook ${c.portions} portions: ${eatNow} now${laterText ? `, ${laterText}` : ''}${spare > 0 ? `, ${spare} spare` : ''}.`,
            c.status === 'cooked' ? 'Already cooked.' : `About ${r.minutes} minutes.`,
            c.status === 'cooked' ? '' : toBuy ? `${toBuy} thing${toBuy > 1 ? 's' : ''} still to buy.` : 'Everything is bought or at home.',
          ]
            .filter(Boolean)
            .join(' ')
        } else if (m.kind === 'leftover') line = `Reheat the ${t.extra}.`
        else if (m.kind === 'freezer') line = 'Take it out of the freezer in the morning.'
        else if (m.kind === 'order') line = 'Ordering in is fine sometimes.'
        else if (m.kind === 'out') line = 'Eating out.'
        else line = 'Quick and easy.'
        return (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {r?.photo && meals.length === 1 && <img src={r.photo} alt="" className="photo" style={{ border: '2px solid var(--ink)', aspectRatio: '16 / 9' }} />}
            <h1 className={'h1' + (meals.length === 1 ? ' xl' : '')}>
              <span className="hl">{t.name}</span>
            </h1>
            <p style={{ margin: 0, fontSize: 17 }}>
              {meals.length > 1 && <strong>{m.eaters.map((p) => h.settings.names[p]).join(' & ')}: </strong>}
              {line}
            </p>
            {m.kind === 'cook' && c?.status === 'planned' && (
              <a className="btn" href={`#/cook/${c.id}`} style={{ alignSelf: meals.length > 1 ? 'flex-start' : 'stretch' }}>
                Cooking it
              </a>
            )}
          </div>
        )
      })}
      <a className="btn ghost" href={changeHref}>
        Change
      </a>
    </div>
  )
}

function Notices({ ctx }: { ctx: AppCtx }) {
  const { h, now, dispatch, me } = ctx
  const [orderAmount, setOrderAmount] = useState<string | null>(null)
  const pending = pendingConfirmation(h, now)
  const spare = spareBoxes(h, now)
  const today = toDate(now)
  const tomorrow = addDays(today, 1)
  const evening = now.getHours() >= 18 && h.eveningOk !== today
  const defrost = mealsAt(h, tomorrow, 'lunch').concat(mealsAt(h, tomorrow, 'dinner')).filter((m) => m.kind === 'freezer')
  const other = lastChangeByOthers(h, me, now)
  const run = (fn: (x: Household) => Result, done?: string) => {
    const before = h
    let res: Result | undefined
    dispatch((x) => {
      res = fn(x)
      return res.h
    })
    if (res) resultToast(ctx, before, res, done)
  }

  return (
    <>
      {pending && (
        <div className="notice yellow">
          <p>
            <strong>{slotLabel(pending, now)}:</strong> {recipeOf(h, pending.recipeId)?.name}. What happened?
          </p>
          {orderAmount === null ? (
            <div className="actions">
              <button className="btn small" onClick={() => run((x) => confirmPast(x, pending.id, 'cooked', undefined, { now, by: me }), 'Noted.')}>
                Cooked it
              </button>
              <button className="btn small ghost" onClick={() => setOrderAmount('')}>
                Ordered
              </button>
              <button className="btn small ghost" onClick={() => run((x) => confirmPast(x, pending.id, 'other', undefined, { now, by: me }), 'Noted.')}>
                Something else
              </button>
            </div>
          ) : (
            <form
              className="actions"
              onSubmit={(e) => {
                e.preventDefault()
                const amount = parseFloat(orderAmount.replace(',', '.')) || undefined
                run((x) => confirmPast(x, pending.id, 'ordered', amount, { now, by: me }), 'Noted.')
                setOrderAmount(null)
              }}
            >
              <label className="field" style={{ flex: 1 }}>
                <span className="sr">How much was it, in euros</span>
                <input className="input" inputMode="decimal" placeholder="€ how much? (optional)" value={orderAmount} onChange={(e) => setOrderAmount(e.target.value)} autoFocus />
              </label>
              <button className="btn small">Save</button>
            </form>
          )}
        </div>
      )}
      {spare.map(({ cook, boxes }) => {
        const r = recipeOf(h, cook.recipeId)
        const until = PEOPLE.filter((p) => r?.eaters.includes(p) && compareSlot(lastGoodSlot(h, cook, p), currentSlot(now)) >= 0).map(
          (p) => `${h.settings.names[p]} until ${slotPhrase(lastGoodSlot(h, cook, p), now)}`,
        )
        return (
          <div className="notice" key={cook.id}>
            <p>
              <strong>
                {boxes} spare box{boxes > 1 ? 'es' : ''} of {r?.name}.
              </strong>{' '}
              Good for {until.join(', ')}.
            </p>
            <div className="actions">
              {r?.eaters.includes('A') && compareSlot(lastGoodSlot(h, cook, 'A'), currentSlot(now)) >= 0 && (
                <button className="btn small" onClick={() => run((x) => handleSpare(x, cook.id, 'artur', { now, by: me }), 'Planned for Artur.')}>
                  {h.settings.names.A} takes them
                </button>
              )}
              <button className="btn small ghost" onClick={() => run((x) => handleSpare(x, cook.id, 'freeze', { now, by: me }), 'In the freezer.')}>
                Freeze
              </button>
              <button className="btn small ghost" onClick={() => run((x) => handleSpare(x, cook.id, 'bin', { now, by: me }), 'Gone.')}>
                Bin
              </button>
            </div>
          </div>
        )
      })}
      {defrost.map((m) => (
        <div className="notice yellow" key={m.id}>
          <p>
            <strong>Tonight:</strong> take {mealName(h, m)} out of the freezer for tomorrow's {m.slot}.
          </p>
        </div>
      ))}
      {evening && <EveningCheck ctx={ctx} />}
      {other && (
        <p className="pad mono muted" style={{ margin: '14px 0 0', textTransform: 'none', letterSpacing: 0 }}>
          {h.settings.names[other.by]} {other.text}
        </p>
      )}
      {h.spending.length === 0 && h.log.length === 0 && (
        <div className="notice">
          <p>
            <strong>Welcome.</strong> Your five recipes are in, plus a few starters so the plan has variety. Add more in Recipes, or hide any you don't want.
          </p>
        </div>
      )}
    </>
  )
}

function EveningCheck({ ctx }: { ctx: AppCtx }) {
  const { h, now, dispatch } = ctx
  const tomorrow = addDays(toDate(now), 1)
  const lunch = slotText(h, { date: tomorrow, slot: 'lunch' })
  const dinner = slotText(h, { date: tomorrow, slot: 'dinner' })
  const toBuy = shoppingList(h, now).filter((i) => i.soon).length
  return (
    <div className="notice">
      <p>
        <strong>Tomorrow:</strong> {lunch.name || 'no lunch at home'} for lunch, {dinner.name || 'nothing'} for dinner.
        {toBuy ? ` ${toBuy} thing${toBuy > 1 ? 's' : ''} to buy.` : ' Nothing to buy.'}
      </p>
      <div className="actions">
        <button className="btn small" onClick={() => dispatch((x) => ({ ...x, eveningOk: toDate(now) }))}>
          Looks good
        </button>
        <a className="btn small ghost" href={`#/change/${tomorrow}/dinner`}>
          Change
        </a>
        {toBuy > 0 && (
          <a className="btn small ghost" href="#/list">
            List
          </a>
        )}
      </div>
    </div>
  )
}

export function Plan({ ctx }: { ctx: AppCtx }) {
  const { h, now, me } = ctx
  const hero = heroSlot(now)
  const rest = horizon(now).filter((s) => compareSlot(s, hero) > 0)
  const decided = rest.filter((s) => !isIdeaDay(s.date, now))
  const ideas = rest.filter((s) => isIdeaDay(s.date, now))
  const Row = ({ at }: { at: SlotRef }) => {
    const t = slotText(h, at)
    return (
      <a className={'row-btn' + (isIdeaDay(at.date, now) ? ' idea' : '')} href={`#/change/${at.date}/${at.slot}`} style={{ textDecoration: 'none' }}>
        <span className="when">
          {shortDay(at.date)} {at.slot === 'lunch' ? 'lun' : 'din'}
        </span>
        <span className="what">
          {t.name || <span className="muted">Nobody home</span>}
          {t.office && <small> · office box</small>}
        </span>
        <span className="who">{t.who}</span>
      </a>
    )
  }
  return (
    <div className="screen">
      <div className="top">
        <span>{longDate(toDate(now))}</span>
        <a href="#/settings" className="link" aria-label="Settings" style={{ gap: 8 }}>
          {h.settings.names[me as Person]}
          <Icon name="gear" size={18} />
        </a>
      </div>
      <Hero ctx={ctx} at={hero} />
      <Notices ctx={ctx} />
      <div className="pad" style={{ paddingTop: 6 }}>
        {decided.length > 0 && <div className="section-label">Decided</div>}
        {decided.map((s) => (
          <Row key={s.date + s.slot} at={s} />
        ))}
        {ideas.length > 0 && <div className="section-label">Ideas, change freely</div>}
        {ideas.map((s) => (
          <Row key={s.date + s.slot} at={s} />
        ))}
      </div>
    </div>
  )
}
