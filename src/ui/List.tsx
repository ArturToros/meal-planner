import { useState } from 'react'
import { AISLE_NAMES, AISLE_ORDER, estimate, shoppingList, tick, type ListItem } from '../lib/shopping'
import { cooksInPlan, uid } from '../lib/planner'
import type { AppCtx } from './common'

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
    ctx.toast({ text: `${it.name} ticked off.`, undo: before })
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
                <input type="checkbox" checked={false} onChange={() => onTick(it)} aria-label={`Got ${it.name}`} />
                <button style={{ flex: 1, background: 'none', border: 0, padding: 0, textAlign: 'left', minHeight: 44 }} onClick={() => setMenu(it)}>
                  <span className="n" style={{ display: 'block' }}>
                    {it.name[0].toUpperCase() + it.name.slice(1)}
                    <small>{it.kind === 'recipe' ? it.forRecipes.join(', ') : it.kind === 'staple' ? 'running out' : 'added by hand'}</small>
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
        <h1 className="h1">List</h1>
        <div className="mono" style={{ textAlign: 'right', lineHeight: 1.5 }}>
          {items.length} things
          <br />
          {items.length ? `about €${estimate(items)}` : 'all done'}
        </div>
      </div>
      <div className="pad">
        {soon.length > 0 && (
          <h2 className="h2" style={{ paddingTop: 18 }}>
            <span className="hl">Today &amp; tomorrow</span>
          </h2>
        )}
        <Group list={soon} />
        {later.length > 0 && (
          <h2 className="h2" style={{ paddingTop: 26 }}>
            Later this week
          </h2>
        )}
        <Group list={later} />
        {!items.length && <p style={{ paddingTop: 16, fontSize: 17 }}>Nothing to buy for the next four days.</p>}

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
            <span className="sr">Add something to the list</span>
            <input className="input" placeholder="Add something…" value={add} onChange={(e) => setAdd(e.target.value)} />
          </label>
          <button className="btn small" style={{ minHeight: 48 }}>
            Add
          </button>
        </form>

        {notRunning.length > 0 && (
          <>
            <div className="section-label">Running out of something?</div>
            <div className="row-flex" style={{ flexWrap: 'wrap', gap: 8 }}>
              {notRunning.map((b) => (
                <button key={b} className="chip x" onClick={() => dispatch((x) => ({ ...x, settings: { ...x.settings, runningOut: [...x.settings.runningOut, b] } }))}>
                  + {b}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {menu && (
        <div className="overlay" onClick={() => setMenu(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={menu.name} onClick={(e) => e.stopPropagation()}>
            <h2 className="h2">{menu.name}</h2>
            {menu.kind === 'recipe' && <p className="muted" style={{ margin: 0 }}>For {menu.forRecipes.join(', ')}</p>}
            <button
              className="btn wide"
              onClick={() => {
                onTick(menu)
                setMenu(null)
              }}
            >
              {menu.kind === 'recipe' ? 'Got it / have it at home' : 'Got it'}
            </button>
            {menu.kind === 'recipe' && (
              <button className="btn ghost wide" onClick={() => couldntGet(menu)}>
                Couldn't get it: change the meal
              </button>
            )}
            {menu.kind === 'recipe' && (
              <button
                className="btn ghost wide"
                onClick={() => {
                  dispatch((x) => ({ ...x, settings: { ...x.settings, staples: [...x.settings.staples, menu.name.replace(/, lactose-free$/, '')] } }))
                  setMenu(null)
                  ctx.toast({ text: `${menu.name} won't show up again unless you say it's running out.` })
                }}
              >
                We always have this
              </button>
            )}
            <button className="btn ghost wide" onClick={() => setMenu(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
