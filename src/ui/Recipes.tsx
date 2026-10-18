import { useEffect, useState } from 'react'
import type { Person, Recipe } from '../lib/types'
import { PEOPLE } from '../lib/types'
import { planRecipe, uid, type Result } from '../lib/planner'
import { formatIngredient, ingredientsToText, parseIngredient } from '../lib/ingredients'
import { backend, compressImage, toBase64 } from '../lib/backend'
import { Back, Icon, PhotoInput, Stepper, back, go, type AppCtx } from './common'
import { resultToast } from './Plan'

type Filter = 'all' | 'quick' | 'A' | 'S'

function who(r: Recipe): string {
  return r.eaters.length === PEOPLE.length ? 'A S E' : r.eaters.length === 1 ? `ONLY ${r.eaters[0]}` : r.eaters.join(' ')
}

export function Recipes({ ctx }: { ctx: AppCtx }) {
  const { h } = ctx
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const match = (r: Recipe) =>
    (!q || r.name.toLowerCase().includes(q.toLowerCase()) || r.ingredients.some((i) => i.name.toLowerCase().includes(q.toLowerCase()))) &&
    (filter === 'all' || (filter === 'quick' && r.minutes <= 25) || ((filter === 'A' || filter === 'S') && r.eaters.length === 1 && r.eaters[0] === filter))
  const ideas = h.recipes.filter((r) => r.isIdea && !r.never && match(r))
  const mine = h.recipes.filter((r) => !r.isIdea && match(r)).sort((a, b) => Number(!!a.never) - Number(!!b.never) || a.name.localeCompare(b.name))
  const filters: [Filter, string][] = [
    ['all', `All ${h.recipes.filter((r) => !r.isIdea).length}`],
    ['quick', 'Quick'],
    ['A', `Only ${h.settings.names.A}`],
    ['S', `Only ${h.settings.names.S}`],
  ]
  const Row = ({ r }: { r: Recipe }) => (
    <a className="row-btn" href={`#/recipe/${r.id}`} style={{ textDecoration: 'none', alignItems: 'center' }}>
      {r.photo && <img src={r.photo} alt="" className="thumb" style={{ width: 40, height: 40 }} />}
      <span className="what" style={r.never ? { color: 'var(--muted)', textDecoration: 'line-through' } : undefined}>
        {r.isIdea ? <span className="hl">{r.name}</span> : r.name}
      </span>
      <span className="who">
        {r.minutes} MIN · {who(r)}
      </span>
    </a>
  )
  return (
    <div className="screen">
      <div className="pad rule" style={{ paddingTop: 'calc(24px + var(--safe-t))', paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h1 className="h1">Recipes</h1>
          <a className="btn small" href="#/new-recipe">
            <Icon name="plus" size={16} /> Add
          </a>
        </div>
        <label className="field">
          <span className="sr">Search recipes</span>
          <input className="input" placeholder="Search: chicken, soup…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="row-flex" style={{ gap: 18, flexWrap: 'wrap' }}>
          {filters.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              style={{
                minHeight: 36,
                padding: 0,
                border: 0,
                background: 'none',
                fontWeight: filter === id ? 800 : 500,
                textDecoration: filter === id ? 'underline' : 'none',
                textDecorationThickness: 3,
                textDecorationColor: 'var(--hi)',
                textUnderlineOffset: 5,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="pad">
        {ideas.length > 0 && <div className="section-label" style={{ color: 'var(--ink)' }}>New ideas this week</div>}
        {ideas.map((r) => (
          <Row key={r.id} r={r} />
        ))}
        <div className="section-label">Yours</div>
        {mine.map((r) => (
          <Row key={r.id} r={r} />
        ))}
        {!mine.length && <p className="muted">Nothing matches.</p>}
      </div>
    </div>
  )
}

export function RecipeView({ ctx, id }: { ctx: AppCtx; id: string }) {
  const { h, dispatch, now, me } = ctx
  const r = h.recipes.find((x) => x.id === id)
  if (!r) return <div className="screen no-nav"><Back /><p className="pad">This recipe was deleted.</p></div>
  const update = (patch: Partial<Recipe>, text: string) => {
    dispatch((x) => ({ ...x, recipes: x.recipes.map((y) => (y.id === id ? { ...y, ...patch } : y)) }))
    ctx.toast({ text })
  }
  const plan = () => {
    const before = h
    let res: Result | undefined
    dispatch((x) => {
      res = planRecipe(x, id, { now, by: me })
      return res.h
    })
    if (res) resultToast(ctx, before, res, '')
  }
  return (
    <div className="screen no-nav">
      <Back fallback="recipes" label="Recipes" />
      {r.photo && <img src={r.photo} alt="" className="photo" />}
      <div className="pad rule" style={{ paddingTop: 12, paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {r.isIdea && <div className="mono">New idea this week</div>}
        <h1 className="h1">{r.name}</h1>
        <p className="mono muted" style={{ margin: 0 }}>
          {r.minutes} min · {r.portions} portions · {r.eaters.map((p) => h.settings.names[p]).join(', ')}
          {r.boxable ? ' · good for boxes' : ''}
        </p>
        <div className="grid2">
          <button className="btn" onClick={plan}>
            Plan it
          </button>
          <a className="btn ghost" href={`#/recipe/${r.id}/edit`}>
            Edit
          </a>
        </div>
        {r.isIdea && (
          <div className="grid2">
            <button className="btn yellow" onClick={() => update({ isIdea: false, ideaWeek: undefined }, 'Kept in your recipes.')}>
              Keep it
            </button>
            <button className="btn ghost" onClick={() => update({ never: true }, 'Won’t suggest it again.')}>
              Never again
            </button>
          </div>
        )}
      </div>
      <div className="pad">
        <div className="section-label">Ingredients</div>
        {r.ingredients.map((i, n) => (
          <div key={n} className="check" style={{ minHeight: 40 }}>
            <span className="n">{formatIngredient(i)}</span>
            {i.lactose && <span className="q">LACTOSE</span>}
          </div>
        ))}
        {r.steps && (
          <>
            <div className="section-label">How</div>
            <p style={{ whiteSpace: 'pre-line', margin: '4px 0 0', lineHeight: 1.5 }}>{r.steps}</p>
          </>
        )}
        {r.sourceUrl && (
          <p>
            <a href={r.sourceUrl} target="_blank" rel="noreferrer">
              Original recipe
            </a>
          </p>
        )}
        {r.starter && <p className="muted" style={{ fontSize: 14 }}>This is a starter recipe. Edit it to match how you make it.</p>}
        <div className="stack" style={{ paddingTop: 24 }}>
          {!r.isIdea && (
            <button className="btn ghost" onClick={() => update({ never: !r.never }, r.never ? 'It can be suggested again.' : 'Won’t suggest it any more.')}>
              {r.never ? 'Suggest it again' : 'Never suggest this'}
            </button>
          )}
          <button
            className="btn ghost"
            style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
            onClick={() => {
              if (!confirm(`Delete ${r.name}?`)) return
              const before = h
              dispatch((x) => ({ ...x, recipes: x.recipes.filter((y) => y.id !== id) }))
              ctx.toast({ text: 'Recipe deleted.', undo: before })
              go('recipes')
            }}
          >
            Delete recipe
          </button>
        </div>
      </div>
    </div>
  )
}

interface Draft {
  name: string
  portions: number
  minutes: string
  eaters: Person[]
  boxable: boolean
  ingredients: string
  steps: string
  photo?: string
  sourceUrl?: string
}

interface ReadRecipe {
  name?: string
  minutes?: number
  portions?: number
  ingredients?: { name: string; qty?: number | null; unit?: string }[]
  steps?: string
  boxable?: boolean
}

const DRAFT_KEY = 'meal-planner-recipe-draft'

function emptyDraft(): Draft {
  return { name: '', portions: 4, minutes: '30', eaters: [...PEOPLE], boxable: true, ingredients: '', steps: '' }
}

export function RecipeEdit({ ctx, id }: { ctx: AppCtx; id?: string }) {
  const { h, dispatch } = ctx
  const existing = id ? h.recipes.find((r) => r.id === id) : undefined
  const [d, setD] = useState<Draft>(() => {
    if (existing)
      return {
        name: existing.name,
        portions: existing.portions,
        minutes: String(existing.minutes),
        eaters: existing.eaters,
        boxable: existing.boxable,
        ingredients: ingredientsToText(existing.ingredients),
        steps: existing.steps,
        photo: existing.photo,
        sourceUrl: existing.sourceUrl,
      }
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) return JSON.parse(saved) as Draft
    } catch {
      /* no saved draft */
    }
    return emptyDraft()
  })
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))

  useEffect(() => {
    if (existing) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    } catch {
      /* draft only lives in memory */
    }
  }, [d, existing])

  const applyRead = (x: ReadRecipe, sourceUrl?: string) => {
    set({
      name: x.name ?? d.name,
      minutes: x.minutes ? String(x.minutes) : d.minutes,
      portions: x.portions ?? d.portions,
      ingredients: x.ingredients?.length ? ingredientsToText(x.ingredients.map((i) => ({ ...parseIngredient(i.name)!, qty: i.qty ?? undefined, unit: i.unit || undefined }))) : d.ingredients,
      steps: x.steps ?? d.steps,
      boxable: x.boxable ?? d.boxable,
      sourceUrl: sourceUrl ?? d.sourceUrl,
    })
  }

  const readLink = async () => {
    if (!link.trim()) return
    setBusy('link')
    setErr(null)
    try {
      applyRead(await backend.read<ReadRecipe>({ kind: 'recipe', url: link.trim() }), link.trim())
      setLink('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const readScreens = async (files: File[]) => {
    setBusy('screens')
    setErr(null)
    try {
      const images = await Promise.all(files.slice(0, 4).map(async (f) => toBase64(await compressImage(f, 1600, 0.85))))
      applyRead(await backend.read<ReadRecipe>({ kind: 'recipe', images }))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const addPhoto = async ([f]: File[]) => {
    setBusy('photo')
    setErr(null)
    try {
      set({ photo: await backend.uploadPhoto(await compressImage(f)) })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const save = () => {
    const ingredients = d.ingredients.split('\n').map(parseIngredient).filter((x): x is NonNullable<typeof x> => !!x)
    const base: Recipe = {
      id: existing?.id ?? d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '-' + uid().slice(0, 4),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      ...existing,
      name: d.name.trim(),
      portions: d.portions,
      minutes: Math.max(5, parseInt(d.minutes) || 30),
      eaters: d.eaters.length ? d.eaters : [...PEOPLE],
      boxable: d.boxable,
      ingredients,
      steps: d.steps.trim(),
      photo: d.photo,
      sourceUrl: d.sourceUrl,
      starter: false,
    }
    dispatch((x) => ({ ...x, recipes: existing ? x.recipes.map((r) => (r.id === base.id ? base : r)) : [...x.recipes, base] }))
    if (!existing) {
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* nothing to clear */
      }
    }
    ctx.toast({ text: existing ? 'Saved.' : `${base.name} added. The plan can use it now.` })
    if (existing) back()
    else go(`recipe/${base.id}`)
  }

  return (
    <div className="screen no-nav">
      <Back fallback="recipes" label="Recipes" />
      <div className="pad rule" style={{ paddingTop: 10, paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 className="h1">{existing ? 'Edit recipe' : 'New recipe'}</h1>
        <label className="field">
          <span>Got a link? Paste it and it fills in the rest.</span>
          <span style={{ display: 'flex' }}>
            <input className="input" type="url" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} style={{ borderRight: 0, minWidth: 0 }} />
            <button className="btn yellow" style={{ outline: '2px solid var(--ink)', outlineOffset: -2, whiteSpace: 'nowrap', minHeight: 48 }} onClick={readLink} disabled={!!busy || !link.trim()}>
              {busy === 'link' ? <span className="spinner" /> : 'Read it'}
            </button>
          </span>
        </label>
        <div className="field">
          <span>Or add photos</span>
          <div className="grid2">
            <PhotoInput className="photo-btn yellow" multiple onFiles={readScreens}>
              {busy === 'screens' ? <span className="spinner" /> : <Icon name="doc" />}
              <span>
                Screenshots of a recipe
                <br />
                <small>{busy === 'screens' ? 'Reading…' : 'Reads it for you'}</small>
              </span>
            </PhotoInput>
            <PhotoInput className="photo-btn" onFiles={addPhoto}>
              {d.photo ? <img src={d.photo} alt="Dish photo" className="thumb" /> : busy === 'photo' ? <span className="spinner" /> : <Icon name="camera" />}
              <span>
                {d.photo ? 'Change the photo' : 'Photo of the dish'}
                <br />
                <small>Shows on the plan</small>
              </span>
            </PhotoInput>
          </div>
        </div>
        {err && <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 600 }}>{err}</p>}
      </div>
      <div className="pad stack" style={{ paddingTop: 16 }}>
        <div className="mono muted">{existing ? 'Details' : 'Or write it yourself'}</div>
        <label className="field">
          <span>Name</span>
          <input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Our chicken & rice" />
        </label>
        <div className="grid2">
          <div className="field">
            <span>Portions</span>
            <Stepper label="portions" value={d.portions} min={1} max={20} onChange={(n) => set({ portions: n })} />
          </div>
          <label className="field">
            <span>Minutes</span>
            <input className="input" inputMode="numeric" value={d.minutes} onChange={(e) => set({ minutes: e.target.value.replace(/\D/g, '') })} style={{ fontFamily: 'var(--mono)' }} />
          </label>
        </div>
        <div className="field">
          <span>Who eats it</span>
          <div className="row-flex" style={{ flexWrap: 'wrap' }}>
            {PEOPLE.map((p) => (
              <button
                key={p}
                type="button"
                className={'chip' + (d.eaters.includes(p) ? ' on' : '')}
                aria-pressed={d.eaters.includes(p)}
                onClick={() => set({ eaters: d.eaters.includes(p) ? d.eaters.filter((x) => x !== p) : PEOPLE.filter((y) => y === p || d.eaters.includes(y)) })}
              >
                {h.settings.names[p]}
              </button>
            ))}
          </div>
        </div>
        <label className="check" style={{ borderBottom: 0 }}>
          <input type="checkbox" checked={d.boxable} onChange={(e) => set({ boxable: e.target.checked })} />
          <span className="n">
            Good for office boxes
            <small>Off for soups and anything that doesn't travel</small>
          </span>
        </label>
        <label className="field">
          <span>Ingredients, one per line</span>
          <textarea className="textarea" rows={7} value={d.ingredients} onChange={(e) => set({ ingredients: e.target.value })} placeholder={'1 kg chicken breast\n400 g rice\n3 carrots'} />
        </label>
        <label className="field">
          <span>
            How to cook it <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
          </span>
          <textarea className="textarea plain" rows={4} value={d.steps} onChange={(e) => set({ steps: e.target.value })} placeholder="Short notes are enough" />
        </label>
        <button className="btn wide" onClick={save} disabled={!d.name.trim()}>
          Save recipe
        </button>
        {!existing && (d.name || d.ingredients) && (
          <button className="link" style={{ alignSelf: 'center' }} onClick={() => setD(emptyDraft())}>
            Clear and start over
          </button>
        )}
      </div>
    </div>
  )
}
