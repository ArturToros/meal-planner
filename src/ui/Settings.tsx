import { useState } from 'react'
import type { Person, Settings as S, Slot } from '../lib/types'
import { PEOPLE } from '../lib/types'
import { recipeOf, replan } from '../lib/planner'
import { supabase } from '../lib/backend'
import { setMe } from '../lib/store'
import { Back, Icon, type AppCtx } from './common'
import { Reminders } from './Reminders'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ORDER = [1, 2, 3, 4, 5, 6, 0]

function ListEditor({ title, hint, items, onChange }: { title: string; hint?: string; items: string[]; onChange: (x: string[]) => void }) {
  const [add, setAdd] = useState('')
  return (
    <div className="field">
      <span>{title}</span>
      {hint && <p className="muted" style={{ margin: 0, fontSize: 14 }}>{hint}</p>}
      <div className="row-flex" style={{ flexWrap: 'wrap', gap: 6 }}>
        {items.map((s) => (
          <button key={s} className="chip x" onClick={() => onChange(items.filter((x) => x !== s))} aria-label={`Remove ${s}`}>
            {s} <Icon name="x" size={12} />
          </button>
        ))}
      </div>
      <form
        className="row-flex"
        onSubmit={(e) => {
          e.preventDefault()
          const v = add.trim()
          if (v && !items.includes(v)) onChange([...items, v])
          setAdd('')
        }}
      >
        <input className="input" placeholder="Add…" value={add} onChange={(e) => setAdd(e.target.value)} aria-label={`Add to ${title}`} />
        <button className="btn small" style={{ minHeight: 48 }}>
          Add
        </button>
      </form>
    </div>
  )
}

export function Settings({ ctx, onMe }: { ctx: AppCtx; onMe: (p: Person) => void }) {
  const { h, me, dispatch, now } = ctx
  const s = h.settings
  const set = (patch: Partial<S>) =>
    dispatch((x) => {
      const next = { ...structuredClone(x), settings: { ...x.settings, ...patch } }
      replan(next, now)
      return next
    })
  const togglePattern = (p: Person, slot: Slot, d: number) => {
    const days = s.pattern[p][slot]
    set({ pattern: { ...s.pattern, [p]: { ...s.pattern[p], [slot]: days.includes(d) ? days.filter((x) => x !== d) : [...days, d] } } })
  }
  const freshnessLabel = (n: number) => {
    const days = Math.floor(n / 2)
    return n === 3 ? 'Next day, plus lunch the day after' : n % 2 ? `${days} days, plus one meal` : `${days} day${days === 1 ? '' : 's'}`
  }

  return (
    <div className="screen no-nav">
      <Back />
      <div className="pad rule" style={{ paddingTop: 8, paddingBottom: 18 }}>
        <h1 className="h1">Settings</h1>
      </div>
      <div className="pad stack" style={{ paddingTop: 18, gap: 26 }}>
        <div className="field">
          <span>Who's using this phone</span>
          <div className="row-flex" style={{ flexWrap: 'wrap' }}>
            {PEOPLE.map((p) => (
              <button
                key={p}
                className={'chip' + (me === p ? ' on' : '')}
                aria-pressed={me === p}
                onClick={() => {
                  setMe(p)
                  onMe(p)
                }}
              >
                {s.names[p]}
              </button>
            ))}
          </div>
        </div>

        <Reminders ctx={ctx} />

        <div className="field">
          <span>Who usually eats at home</span>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            The plan starts from this. Changing one meal is done on the meal itself.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 12 }}>
              <thead>
                <tr>
                  <th />
                  {ORDER.map((d) => (
                    <th key={d} style={{ padding: '4px 2px', fontWeight: 500 }}>
                      {DAYS[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PEOPLE.flatMap((p) =>
                  (['lunch', 'dinner'] as Slot[]).map((slot) => (
                    <tr key={p + slot}>
                      <th style={{ textAlign: 'left', padding: '2px 8px 2px 0', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {s.names[p]} {slot === 'lunch' ? 'lun' : 'din'}
                      </th>
                      {ORDER.map((d) => {
                        const on = s.pattern[p][slot].includes(d)
                        return (
                          <td key={d} style={{ padding: 2 }}>
                            <button
                              aria-label={`${s.names[p]} ${slot} ${DAYS[d]}`}
                              aria-pressed={on}
                              onClick={() => togglePattern(p, slot, d)}
                              style={{ width: 36, height: 36, border: '2px solid var(--ink)', background: on ? 'var(--ink)' : 'var(--paper)', color: on ? '#fff' : 'var(--ink)' }}
                            >
                              {on ? '✓' : ''}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="field">
          <span>Office lunches (boxes)</span>
          <div className="row-flex" style={{ flexWrap: 'wrap', gap: 6 }}>
            {ORDER.map((d) => (
              <button
                key={d}
                className={'chip' + (s.officeDays.includes(d) ? ' on' : '')}
                aria-pressed={s.officeDays.includes(d)}
                onClick={() => set({ officeDays: s.officeDays.includes(d) ? s.officeDays.filter((x) => x !== d) : [...s.officeDays, d] })}
              >
                {DAYS[d]}
              </button>
            ))}
          </div>
          <div className="row-flex" style={{ flexWrap: 'wrap', gap: 6 }}>
            {PEOPLE.map((p) => (
              <button
                key={p}
                className={'chip x' + (s.officePeople.includes(p) ? ' on' : '')}
                aria-pressed={s.officePeople.includes(p)}
                onClick={() => set({ officePeople: s.officePeople.includes(p) ? s.officePeople.filter((x) => x !== p) : [...s.officePeople, p] })}
              >
                {s.names[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>How old can leftovers be</span>
          {PEOPLE.map((p) => (
            <label key={p} className="row-flex" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>{s.names[p]}</span>
              <select className="select" style={{ width: 'auto', paddingRight: 28 }} value={s.freshness[p]} onChange={(e) => set({ freshness: { ...s.freshness, [p]: Number(e.target.value) } })}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {freshnessLabel(n)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <ListEditor title="Always at home" hint="Never put on the list, unless you say it's running out." items={s.staples} onChange={(x) => set({ staples: x })} />
        <ListEditor title="Breakfast & basics" hint="Shown as quick 'running out?' buttons on the list." items={s.breakfast} onChange={(x) => set({ breakfast: x })} />
        <ListEditor title="Lazy-night meals" hint="Offered when you change a meal. The first one is the default." items={s.quickMeals} onChange={(x) => set({ quickMeals: x })} />

        {h.freezer.length > 0 && (
          <div className="field">
            <span>In the freezer</span>
            {h.freezer.map((f) => (
              <div key={f.id} className="check">
                <span className="n">
                  {recipeOf(h, f.recipeId)?.name}
                  <small>frozen {f.frozenAt}</small>
                </span>
                <span className="q">{f.portions}×</span>
                <button className="link" onClick={() => dispatch((x) => ({ ...x, freezer: x.freezer.filter((y) => y.id !== f.id), meals: x.meals.filter((m) => m.freezerId !== f.id) }))}>
                  Used up
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="field">
          <span>Names</span>
          {PEOPLE.map((p) => (
            <input key={p} className="input" value={s.names[p]} onChange={(e) => set({ names: { ...s.names, [p]: e.target.value } })} aria-label={`Name for ${p}`} />
          ))}
        </div>

        {supabase && (
          <button className="btn ghost" onClick={() => supabase!.auth.signOut().then(() => location.reload())}>
            Sign out on this phone
          </button>
        )}
        <p className="mono muted" style={{ textTransform: 'none' }}>
          {supabase ? 'Shared between your phones.' : 'Trial mode: saved on this device only.'}
        </p>
      </div>
    </div>
  )
}
