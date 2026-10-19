import { useState } from 'react'
import type { Person, Settings as S, Slot } from '../lib/types'
import { PEOPLE } from '../lib/types'
import { labelWord, recipeOf, replan } from '../lib/planner'
import { L, getLang, plural, recipeName, setLang, shortDayWord, word, type Lang } from '../lib/i18n'
import { supabase } from '../lib/backend'
import { setMe } from '../lib/store'
import { Back, Icon, type AppCtx } from './common'
import { Reminders } from './Reminders'

const ORDER = [1, 2, 3, 4, 5, 6, 0]

function ListEditor({ title, hint, items, show, onChange }: { title: string; hint?: string; items: string[]; show: (s: string) => string; onChange: (x: string[]) => void }) {
  const [add, setAdd] = useState('')
  return (
    <div className="field">
      <span>{title}</span>
      {hint && <p className="muted" style={{ margin: 0, fontSize: 14 }}>{hint}</p>}
      <div className="row-flex" style={{ flexWrap: 'wrap', gap: 6 }}>
        {items.map((s) => (
          <button key={s} className="chip x" onClick={() => onChange(items.filter((x) => x !== s))} aria-label={L(`Remove ${show(s)}`, `Премахни ${show(s)}`)}>
            {show(s)} <Icon name="x" size={12} />
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
        <input className="input" placeholder={L('Add…', 'Добави…')} value={add} onChange={(e) => setAdd(e.target.value)} aria-label={L(`Add to ${title}`, `Добави в ${title}`)} />
        <button className="btn small" style={{ minHeight: 48 }}>
          {L('Add', 'Добави')}
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
    return n === 3
      ? L('Next day, plus lunch the day after', 'До следващия ден, плюс обяда на по-следващия')
      : n % 2
        ? L(`${plural(days, 'day', 'days', 'ден', 'дни')}, plus one meal`, `${plural(days, 'day', 'days', 'ден', 'дни')} и още едно хранене`)
        : plural(days, 'day', 'days', 'ден', 'дни')
  }

  return (
    <div className="screen no-nav">
      <Back />
      <div className="pad rule" style={{ paddingTop: 8, paddingBottom: 18 }}>
        <h1 className="h1">{L('Settings', 'Настройки')}</h1>
      </div>
      <div className="pad stack" style={{ paddingTop: 18, gap: 26 }}>
        <div className="field">
          <span>Language / Език</span>
          <div className="row-flex" style={{ flexWrap: 'wrap' }}>
            {(
              [
                ['en', 'English'],
                ['bg', 'Български'],
              ] as [Lang, string][]
            ).map(([l, label]) => (
              <button
                key={l}
                className={'chip' + (getLang() === l ? ' on' : '')}
                aria-pressed={getLang() === l}
                onClick={() => {
                  if (getLang() === l) return
                  setLang(l)
                  window.location.reload()
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>{L("Who's using this phone", 'Кой ползва този телефон')}</span>
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
                {word(s.names[p])}
              </button>
            ))}
          </div>
        </div>

        <Reminders ctx={ctx} />

        <div className="field">
          <span>{L('Who usually eats at home', 'Кой обикновено яде вкъщи')}</span>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            {L('The plan starts from this. Changing one meal is done on the meal itself.', 'Планът тръгва от това. Едно отделно хранене се променя от самото хранене.')}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 12 }}>
              <thead>
                <tr>
                  <th />
                  {ORDER.map((d) => (
                    <th key={d} style={{ padding: '4px 2px', fontWeight: 500 }}>
                      {shortDayWord(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PEOPLE.flatMap((p) =>
                  (['lunch', 'dinner'] as Slot[]).map((slot) => (
                    <tr key={p + slot}>
                      <th style={{ textAlign: 'left', padding: '2px 8px 2px 0', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {word(s.names[p])} {slot === 'lunch' ? L('lun', 'об.') : L('din', 'веч.')}
                      </th>
                      {ORDER.map((d) => {
                        const on = s.pattern[p][slot].includes(d)
                        return (
                          <td key={d} style={{ padding: 2 }}>
                            <button
                              aria-label={`${s.names[p]} ${slot === 'lunch' ? L('lunch', 'обяд') : L('dinner', 'вечеря')} ${shortDayWord(d)}`}
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
          <span>{L('Office lunches (boxes)', 'Обеди в офиса (кутии)')}</span>
          <div className="row-flex" style={{ flexWrap: 'wrap', gap: 6 }}>
            {ORDER.map((d) => (
              <button
                key={d}
                className={'chip' + (s.officeDays.includes(d) ? ' on' : '')}
                aria-pressed={s.officeDays.includes(d)}
                onClick={() => set({ officeDays: s.officeDays.includes(d) ? s.officeDays.filter((x) => x !== d) : [...s.officeDays, d] })}
              >
                {shortDayWord(d)}
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
                {word(s.names[p])}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>{L('How old can leftovers be', 'Колко стари може да са остатъците')}</span>
          {PEOPLE.map((p) => (
            <label key={p} className="row-flex" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>{word(s.names[p])}</span>
              <select className="select" style={{ width: 'auto', minWidth: 0, flex: '0 1 auto', maxWidth: '72%', paddingRight: 28, textOverflow: 'ellipsis' }} value={s.freshness[p]} onChange={(e) => set({ freshness: { ...s.freshness, [p]: Number(e.target.value) } })}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {freshnessLabel(n)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <ListEditor
          title={L('Always at home', 'Винаги вкъщи')}
          hint={L("Never put on the list, unless you say it's running out.", 'Никога не влизат в списъка, освен ако не кажете, че свършват.')}
          items={s.staples}
          show={word}
          onChange={(x) => set({ staples: x })}
        />
        <ListEditor
          title={L('Breakfast & basics', 'Закуска и основни')}
          hint={L("Shown as quick 'running out?' buttons on the list.", "Показват се като бързи бутони 'свършва ли?' в списъка.")}
          items={s.breakfast}
          show={word}
          onChange={(x) => set({ breakfast: x })}
        />
        <ListEditor
          title={L('Lazy-night meals', 'Ястия за мързелива вечер')}
          hint={L('Offered when you change a meal. The first one is the default.', 'Предлагат се, когато смените ястие. Първото е по подразбиране.')}
          items={s.quickMeals}
          show={labelWord}
          onChange={(x) => set({ quickMeals: x })}
        />

        {h.freezer.length > 0 && (
          <div className="field">
            <span>{L('In the freezer', 'Във фризера')}</span>
            {h.freezer.map((f) => (
              <div key={f.id} className="check">
                <span className="n">
                  {(() => {
                    const r = recipeOf(h, f.recipeId)
                    return r ? recipeName(r) : ''
                  })()}
                  <small>{L(`frozen ${f.frozenAt}`, `замразено ${f.frozenAt}`)}</small>
                </span>
                <span className="q">{f.portions}×</span>
                <button className="link" onClick={() => dispatch((x) => ({ ...x, freezer: x.freezer.filter((y) => y.id !== f.id), meals: x.meals.filter((m) => m.freezerId !== f.id) }))}>
                  {L('Used up', 'Изядено')}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="field">
          <span>{L('Names', 'Имена')}</span>
          {PEOPLE.map((p) => (
            <input key={p} className="input" value={s.names[p]} onChange={(e) => set({ names: { ...s.names, [p]: e.target.value } })} aria-label={L(`Name for ${p}`, `Име за ${p}`)} />
          ))}
        </div>

        {supabase && (
          <button className="btn ghost" onClick={() => supabase!.auth.signOut().then(() => location.reload())}>
            {L('Sign out on this phone', 'Изход от този телефон')}
          </button>
        )}
        <p className="mono muted" style={{ textTransform: 'none' }}>
          {supabase ? L('Shared between your phones.', 'Споделено между телефоните ви.') : L('Trial mode: saved on this device only.', 'Пробен режим: запазва се само на това устройство.')}
        </p>
      </div>
    </div>
  )
}
