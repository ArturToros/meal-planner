import { useState } from 'react'
import { AISLE_NAMES, AISLE_ORDER, estimate, shoppingList, tick, type ListItem } from '../lib/shopping'
import { cooksInPlan, uid } from '../lib/planner'
import type { AppCtx } from './common'
import { L, plural, word } from '../lib/i18n'

export function List({ ctx }: { ctx: AppCtx }) {
  const { h, now, dispatch } = ctx
  const [add, setAdd] = useState('')
  const [menu, setMenu] = useState<ListItem | null>(null)
  const items = shoppingList(h, now)
  const soon = items.filter((i) => i.soon)
  const later = items.filter((i) => !i.soon)
  const notRunning = h.settings.breakfast.filter((b) => !h.settings.runningOut.includes(b))

  const onTick = (it: ListItem) => {
    const before = h
    dispatch((x) => tick(x, it, new Date()))
    ctx.toast({ text: L(`${it.label} ticked off.`, `${it.label}: отметнато.`), undo: before })
  }

  const couldntGet = (it: ListItem) => {
    const cook = cooksInPlan(h, now).filter((c) => it.cookIds.includes(c.id)).sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot))[0]
    setMenu(null)
    if (cook) location.hash = `#/change/${cook.date}/${cook.slot}`
  }

  const Group = ({ list }: { list: ListItem[] }) => (
    <>
      {AISLE_ORDER.filter((a) => list.some((i) => i.aisle === a)).map((a) => (
        <div key={a}>
          <div className="section-label">{AISLE_NAMES[a]}</div>
          {list
            .filter((i) => i.aisle === a)
            .map((it) => (
              <div key={it.key} className="check">
                <input type="checkbox" checked={false} onChange={() => onTick(it)} aria-label={L(`Got ${it.label}`, `Взето: ${it.label}`)} />
                <button style={{ flex: 1, background: 'none', border: 0, padding: 0, textAlign: 'left', minHeight: 44 }} onClick={() => setMenu(it)}>
                  <span className="n" style={{ display: 'block' }}>
                    {it.label[0].toUpperCase() + it.label.slice(1)}
                    <small>{it.kind === 'recipe' ? it.forRecipes.join(', ') : it.kind === 'staple' ? L('running out', 'свършва') : L('added by hand', 'добавено ръчно')}</small>
                  </span>
                </button>
                <span className="q">{it.qty}</span>
              </div>
            ))}
        </div>
      ))}
    </>
  )

  return (
    <div className="screen">
      <div className="pad rule" style={{ paddingTop: 'calc(24px + var(--safe-t))', paddingBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <h1 className="h1">{L('List', 'Списък')}</h1>
        <div className="mono" style={{ textAlign: 'right', lineHeight: 1.5 }}>
          {plural(items.length, 'thing', 'things', 'неща', 'неща')}
          <br />
          {items.length ? L(`about €${estimate(items)}`, `около €${estimate(items)}`) : L('all done', 'всичко е взето')}
        </div>
      </div>
      <div className="pad">
        {soon.length > 0 && (
          <h2 className="h2" style={{ paddingTop: 18 }}>
            <span className="hl">{L('Today & tomorrow', 'Днес и утре')}</span>
          </h2>
        )}
        <Group list={soon} />
        {later.length > 0 && (
          <h2 className="h2" style={{ paddingTop: 26 }}>
            {L('Later this week', 'По-късно тази седмица')}
          </h2>
        )}
        <Group list={later} />
        {!items.length && <p style={{ paddingTop: 16, fontSize: 17 }}>{L('Nothing to buy for the next four days.', 'Няма какво да се купува за следващите четири дни.')}</p>}

        <form
          className="row-flex"
          style={{ paddingTop: 22 }}
          onSubmit={(e) => {
            e.preventDefault()
            const name = add.trim()
            if (!name) return
            dispatch((x) => ({ ...x, extras: [...x.extras, { id: uid(), name, addedAt: new Date().toISOString() }] }))
            setAdd('')
          }}
        >
          <label style={{ flex: 1 }}>
            <span className="sr">{L('Add something to the list', 'Добави нещо в списъка')}</span>
            <input className="input" placeholder={L('Add something…', 'Добави нещо…')} value={add} onChange={(e) => setAdd(e.target.value)} />
          </label>
          <button className="btn small" style={{ minHeight: 48 }}>
            {L('Add', 'Добави')}
          </button>
        </form>

        {notRunning.length > 0 && (
          <>
            <div className="section-label">{L('Running out of something?', 'Свършва ли нещо?')}</div>
            <div className="row-flex" style={{ flexWrap: 'wrap', gap: 8 }}>
              {notRunning.map((b) => (
                <button key={b} className="chip x" onClick={() => dispatch((x) => ({ ...x, settings: { ...x.settings, runningOut: [...x.settings.runningOut, b] } }))}>
                  + {word(b)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {menu && (
        <div className="overlay" onClick={() => setMenu(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={menu.label} onClick={(e) => e.stopPropagation()}>
            <h2 className="h2">{menu.label[0].toUpperCase() + menu.label.slice(1)}</h2>
            {menu.kind === 'recipe' && <p className="muted" style={{ margin: 0 }}>{L('For', 'За')} {menu.forRecipes.join(', ')}</p>}
            <button
              className="btn wide"
              onClick={() => {
                onTick(menu)
                setMenu(null)
              }}
            >
              {menu.kind === 'recipe' ? L('Got it / have it at home', 'Взето / имаме го вкъщи') : L('Got it', 'Взето')}
            </button>
            {menu.kind === 'recipe' && (
              <button className="btn ghost wide" onClick={() => couldntGet(menu)}>
                {L("Couldn't get it: change the meal", 'Нямаше го: смени ястието')}
              </button>
            )}
            {menu.kind === 'recipe' && (
              <button
                className="btn ghost wide"
                onClick={() => {
                  dispatch((x) => ({ ...x, settings: { ...x.settings, staples: [...x.settings.staples, menu.name.replace(/, lactose-free$/, '')] } }))
                  setMenu(null)
                  ctx.toast({ text: L(`${menu.label} won't show up again unless you say it's running out.`, `${menu.label} няма да се появява, освен ако не кажете, че свършва.`) })
                }}
              >
                {L('We always have this', 'Винаги го имаме')}
              </button>
            )}
            <button className="btn ghost wide" onClick={() => setMenu(null)}>
              {L('Close', 'Затвори')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
