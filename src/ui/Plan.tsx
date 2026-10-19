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
import { L, plural, recipeName, slotWord, word } from '../lib/i18n'

export function resultToast(ctx: AppCtx, before: Household, res: Result, done = L('Done.', 'Готово.')) {
  const also = res.alsoChanged.map((s) => slotPhrase(s, ctx.now))
  const text = [done, res.message, also.length ? L(`Also changed: ${also.join(', ')}.`, `Променено е и: ${also.join(', ')}.`) : ''].filter(Boolean).join(' ')
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
  if (at.date === today) return at.slot === 'dinner' ? L('Tonight', 'Довечера') : L('Lunch today', 'Днес на обяд')
  return at.slot === 'dinner' ? L('Tomorrow night', 'Утре вечер') : L('Tomorrow lunch', 'Утре на обяд')
}

function mealText(h: Household, m: Meal, now: Date) {
  const name = mealName(h, m)
  if (m.kind === 'leftover') {
    const c = cookOf(h, m.cookId)
    return { name, extra: c ? L(`leftover from ${slotPhrase(c, now)}`, `остатък от ${slotPhrase(c, now)}`) : L('leftover', 'остатък') }
  }
  if (m.kind === 'freezer') return { name, extra: L('from the freezer', 'от фризера') }
  return { name, extra: '' }
}

export function slotText(h: Household, at: SlotRef) {
  const meals = mealsAt(h, at.date, at.slot)
  const office = PEOPLE.some((p) => isOffice(h, at.date, at.slot, p) && meals.some((m) => m.eaters.includes(p)))
  return {
    meals,
    office,
    name: meals.map((m) => mealName(h, m) + (m.kind === 'leftover' ? L(' (leftover)', ' (остатък)') : '')).join(' / '),
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
          {L('Nobody home', 'Никой не е вкъщи')}
        </h1>
        <a className="btn ghost small" href={changeHref}>
          {L('Someone is eating', 'Някой ще яде')}
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
          const laterText = later.map((x) => L(`${x.eaters.length} for ${slotPhrase(x, now)}`, `${x.eaters.length} за ${slotPhrase(x, now)}`)).join(', ')
          const spare = available(h, c.id)
          const toBuy = list.filter((i) => i.cookIds.includes(c.id)).length
          line = [
            L(
              `Cook ${c.portions} portions: ${eatNow} now${laterText ? `, ${laterText}` : ''}${spare > 0 ? `, ${spare} spare` : ''}.`,
              `Сготви ${c.portions} порции: ${eatNow} сега${laterText ? `, ${laterText}` : ''}${spare > 0 ? `, ${spare} в повече` : ''}.`,
            ),
            c.status === 'cooked' ? L('Already cooked.', 'Вече е сготвено.') : L(`About ${r.minutes} minutes.`, `Около ${r.minutes} минути.`),
            c.status === 'cooked'
              ? ''
              : toBuy
                ? L(`${plural(toBuy, 'thing', 'things', 'нещо', 'неща')} still to buy.`, `Остава да се купят ${plural(toBuy, 'thing', 'things', 'нещо', 'неща')}.`)
                : L('Everything is bought or at home.', 'Всичко е купено или го има вкъщи.'),
          ]
            .filter(Boolean)
            .join(' ')
        } else if (m.kind === 'leftover') line = L(`Reheat the ${t.extra}.`, `Затопли ${t.extra}.`)
        else if (m.kind === 'freezer') line = L('Take it out of the freezer in the morning.', 'Извади го от фризера сутринта.')
        else if (m.kind === 'order') line = L('Ordering in is fine sometimes.', 'Понякога е ок да поръчаме.')
        else if (m.kind === 'out') line = L('Eating out.', 'Ядем навън.')
        else line = L('Quick and easy.', 'Бързо и лесно.')
        return (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {r?.photo && meals.length === 1 && <img src={r.photo} alt="" className="photo" style={{ border: '2px solid var(--ink)', aspectRatio: '16 / 9' }} />}
            <h1 className={'h1' + (meals.length === 1 ? ' xl' : '')}>
              <span className="hl">{t.name}</span>
            </h1>
            <p style={{ margin: 0, fontSize: 17 }}>
              {meals.length > 1 && <strong>{m.eaters.map((p) => word(h.settings.names[p])).join(' & ')}: </strong>}
              {line}
            </p>
            {m.kind === 'cook' && c?.status === 'planned' && (
              <a className="btn" href={`#/cook/${c.id}`} style={{ alignSelf: meals.length > 1 ? 'flex-start' : 'stretch' }}>
                {L('Cooking it', 'Готвя го')}
              </a>
            )}
          </div>
        )
      })}
      <a className="btn ghost" href={changeHref}>
        {L('Change', 'Промени')}
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
            <strong>{slotLabel(pending, now)}:</strong> {(() => { const pr = recipeOf(h, pending.recipeId); return pr ? recipeName(pr) : '' })()}. {L('What happened?', 'Какво стана?')}
          </p>
          {orderAmount === null ? (
            <div className="actions">
              <button className="btn small" onClick={() => run((x) => confirmPast(x, pending.id, 'cooked', undefined, { now, by: me }), L('Noted.', 'Записано.'))}>
                {L('Cooked it', 'Сготвихме')}
              </button>
              <button className="btn small ghost" onClick={() => setOrderAmount('')}>
                {L('Ordered', 'Поръчахме')}
              </button>
              <button className="btn small ghost" onClick={() => run((x) => confirmPast(x, pending.id, 'other', undefined, { now, by: me }), L('Noted.', 'Записано.'))}>
                {L('Something else', 'Друго')}
              </button>
            </div>
          ) : (
            <form
              className="actions"
              onSubmit={(e) => {
                e.preventDefault()
                const amount = parseFloat(orderAmount.replace(',', '.')) || undefined
                run((x) => confirmPast(x, pending.id, 'ordered', amount, { now, by: me }), L('Noted.', 'Записано.'))
                setOrderAmount(null)
              }}
            >
              <label className="field" style={{ flex: 1 }}>
                <span className="sr">{L('How much was it, in euros', 'Колко струваше, в евро')}</span>
                <input className="input" inputMode="decimal" placeholder={L('€ how much? (optional)', '€ колко? (по желание)')} value={orderAmount} onChange={(e) => setOrderAmount(e.target.value)} autoFocus />
              </label>
              <button className="btn small">{L('Save', 'Запази')}</button>
            </form>
          )}
        </div>
      )}
      {spare.map(({ cook, boxes }) => {
        const r = recipeOf(h, cook.recipeId)
        const until = PEOPLE.filter((p) => r?.eaters.includes(p) && compareSlot(lastGoodSlot(h, cook, p), currentSlot(now)) >= 0).map(
          (p) => L(`${word(h.settings.names[p])} until ${slotPhrase(lastGoodSlot(h, cook, p), now)}`, `${word(h.settings.names[p])} до ${slotPhrase(lastGoodSlot(h, cook, p), now)}`),
        )
        return (
          <div className="notice" key={cook.id}>
            <p>
              <strong>
                {L(
                  `${boxes} spare box${boxes > 1 ? 'es' : ''} of ${r ? recipeName(r) : ''}.`,
                  `${boxes} ${boxes > 1 ? 'кутии' : 'кутия'} ${r ? recipeName(r) : ''} в повече.`,
                )}
              </strong>{' '}
              {L(`Good for ${until.join(', ')}.`, `Става за ${until.join(', ')}.`)}
            </p>
            <div className="actions">
              {r?.eaters.includes('A') && compareSlot(lastGoodSlot(h, cook, 'A'), currentSlot(now)) >= 0 && (
                <button className="btn small" onClick={() => run((x) => handleSpare(x, cook.id, 'artur', { now, by: me }), L(`Planned for ${h.settings.names.A}.`, `Планирано за ${h.settings.names.A}.`))}>
                  {L(`${h.settings.names.A} takes them`, `${h.settings.names.A} ги взима`)}
                </button>
              )}
              <button className="btn small ghost" onClick={() => run((x) => handleSpare(x, cook.id, 'freeze', { now, by: me }), L('In the freezer.', 'Във фризера.'))}>
                {L('Freeze', 'Замрази')}
              </button>
              <button className="btn small ghost" onClick={() => run((x) => handleSpare(x, cook.id, 'bin', { now, by: me }), L('Gone.', 'Изхвърлено.'))}>
                {L('Bin', 'Изхвърли')}
              </button>
            </div>
          </div>
        )
      })}
      {defrost.map((m) => (
        <div className="notice yellow" key={m.id}>
          <p>
            <strong>{L('Tonight:', 'Довечера:')}</strong>{' '}
            {L(`take ${mealName(h, m)} out of the freezer for tomorrow's ${m.slot}.`, `извади ${mealName(h, m)} от фризера за утре на ${slotWord(m.slot)}.`)}
          </p>
        </div>
      ))}
      {evening && <EveningCheck ctx={ctx} />}
      {other && (
        <p className="pad mono muted" style={{ margin: '14px 0 0', textTransform: 'none', letterSpacing: 0 }}>
          {word(h.settings.names[other.by])} {other.text}
        </p>
      )}
      {h.spending.length === 0 && h.log.length === 0 && (
        <div className="notice">
          <p>
            <strong>{L('Welcome.', 'Добре дошли.')}</strong>{' '}
            {L(
              "Your five recipes are in, plus a few starters so the plan has variety. Add more in Recipes, or hide any you don't want.",
              'Петте ви рецепти са вътре, плюс няколко начални за разнообразие. Добавяйте още в Рецепти или скрийте тези, които не искате.',
            )}
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
        <strong>{L('Tomorrow:', 'Утре:')}</strong>{' '}
        {L(
          `${lunch.name || 'no lunch at home'} for lunch, ${dinner.name || 'nothing'} for dinner.`,
          `на обяд ${lunch.name || 'нищо вкъщи'}, на вечеря ${dinner.name || 'нищо'}.`,
        )}
        {toBuy ? L(` ${plural(toBuy, 'thing', 'things', 'нещо', 'неща')} to buy.`, ` За купуване: ${plural(toBuy, 'thing', 'things', 'нещо', 'неща')}.`) : L(' Nothing to buy.', ' Няма нищо за купуване.')}
      </p>
      <div className="actions">
        <button className="btn small" onClick={() => dispatch((x) => ({ ...x, eveningOk: toDate(now) }))}>
          {L('Looks good', 'Добре е')}
        </button>
        <a className="btn small ghost" href={`#/change/${tomorrow}/dinner`}>
          {L('Change', 'Промени')}
        </a>
        {toBuy > 0 && (
          <a className="btn small ghost" href="#/list">
            {L('List', 'Списък')}
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
          {shortDay(at.date)} {at.slot === 'lunch' ? L('lun', 'об.') : L('din', 'веч.')}
        </span>
        <span className="what">
          {t.name || <span className="muted">{L('Nobody home', 'Никой не е вкъщи')}</span>}
          {t.office && <small>{L(' · office box', ' · кутия за офиса')}</small>}
        </span>
        <span className="who">{t.who}</span>
      </a>
    )
  }
  return (
    <div className="screen">
      <div className="top">
        <span>{longDate(toDate(now))}</span>
        <a href="#/settings" className="link" aria-label={L('Settings', 'Настройки')} style={{ gap: 8 }}>
          {word(h.settings.names[me as Person])}
          <Icon name="gear" size={18} />
        </a>
      </div>
      <Hero ctx={ctx} at={hero} />
      <Notices ctx={ctx} />
      <div className="pad" style={{ paddingTop: 6 }}>
        {decided.length > 0 && <div className="section-label">{L('Decided', 'Решено')}</div>}
        {decided.map((s) => (
          <Row key={s.date + s.slot} at={s} />
        ))}
        {ideas.length > 0 && <div className="section-label">{L('Ideas, change freely', 'Идеи, сменяй свободно')}</div>}
        {ideas.map((s) => (
          <Row key={s.date + s.slot} at={s} />
        ))}
      </div>
    </div>
  )
}
