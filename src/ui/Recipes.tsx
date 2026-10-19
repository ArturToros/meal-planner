import { useEffect, useState } from 'react'
import type { Household, Person, Recipe } from '../lib/types'
import { PEOPLE } from '../lib/types'
import { planRecipe, uid, type Result } from '../lib/planner'
import { formatQty, guessAisle, guessLactose, parseIngredient } from '../lib/ingredients'
import type { Ingredient } from '../lib/types'
import { L, getLang, ingredientName, plural, recipeName, recipeSteps, unitWord, word } from '../lib/i18n'
import { backend, compressImage, toBase64 } from '../lib/backend'
import { Back, Icon, PhotoInput, Stepper, back, go, type AppCtx } from './common'
import { resultToast } from './Plan'

type Filter = 'all' | 'quick' | 'A' | 'S'

function who(r: Recipe): string {
  return r.eaters.length === PEOPLE.length ? 'A S E' : r.eaters.length === 1 ? `${L('ONLY', 'САМО')} ${r.eaters[0]}` : r.eaters.join(' ')
}

/** "1.5 kg" with the unit in the phone's language. */
function qtyText(i: { qty?: number; unit?: string }, scale = 1): string {
  const q = formatQty(i, scale)
  const [num, ...unit] = q.split(' ')
  return unit.length ? `${num} ${unitWord(unit.join(' '))}` : num
}

/** One ingredient line as shown and as typed in the editor, in the phone's language. */
export function ingredientText(i: Ingredient, scale = 1): string {
  return [qtyText(i, scale), ingredientName(i)].filter(Boolean).join(' ')
}

// Bulgarian unit words typed in the editor, mapped back to the units the planner uses.
const UNIT_FROM_BG: Record<string, string> = {
  г: 'g', гр: 'g', кг: 'kg', мл: 'ml', л: 'l', 'с.л': 'tbsp', 'ч.л': 'tsp', 'ч.ч': 'cup', бр: 'pcs',
  пакет: 'pack', пакета: 'pack', консерва: 'can', консерви: 'can', скилидка: 'clove', скилидки: 'clove', връзка: 'bunch', филия: 'slice', филии: 'slice',
}

function parseLine(line: string): Ingredient | undefined {
  const m = line.trim().replace(/^[-•*]\s*/, '').match(/^(\d+(?:[.,]\d+)?|\d+\/\d+|½|¼)\s*([^\s\d]+?)\.?\s+(.*)$/)
  if (m && UNIT_FROM_BG[m[2].toLowerCase()]) return parseIngredient(`${m[1]} ${UNIT_FROM_BG[m[2].toLowerCase()]} ${m[3]}`)
  return parseIngredient(line)
}

interface Translated {
  name: string
  nameBg: string
  steps: string
  stepsBg: string
  ingredients: { name: string; bg: string }[]
}

/** Fill in the other language in the background; the recipe works in the meantime. */
function translateLater(ctx: AppCtx, recipe: Recipe) {
  backend
    .read<Translated>({ kind: 'translate', context: { recipe } })
    .then((t) =>
      ctx.dispatch((x: Household) => ({
        ...x,
        recipes: x.recipes.map((r) =>
          r.id !== recipe.id
            ? r
            : {
                ...r,
                name: t.name || r.name,
                nameBg: t.nameBg || r.nameBg,
                steps: r.steps ? t.steps || r.steps : r.steps,
                stepsBg: r.steps ? t.stepsBg || r.stepsBg : r.stepsBg,
                ingredients: r.ingredients.map((i, n) => {
                  const ti = t.ingredients?.[n]
                  if (!ti) return i
                  const name = ti.name || i.name
                  return { ...i, name, bg: ti.bg || i.bg, aisle: i.aisle === 'other' ? guessAisle(name) : i.aisle, lactose: i.lactose || guessLactose(name) || undefined }
                }),
              },
        ),
      })),
    )
    .catch(() => {
      /* stays in one language until the next edit */
    })
}

export function Recipes({ ctx }: { ctx: AppCtx }) {
  const { h } = ctx
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const has = (t: string | undefined) => !!t && t.toLowerCase().includes(q.toLowerCase())
  const match = (r: Recipe) =>
    (!q || has(r.name) || has(r.nameBg) || r.ingredients.some((i) => has(i.name) || has(i.bg))) &&
    (filter === 'all' || (filter === 'quick' && r.minutes <= 25) || ((filter === 'A' || filter === 'S') && r.eaters.length === 1 && r.eaters[0] === filter))
  const ideas = h.recipes.filter((r) => r.isIdea && !r.never && match(r))
  const mine = h.recipes.filter((r) => !r.isIdea && match(r)).sort((a, b) => Number(!!a.never) - Number(!!b.never) || recipeName(a).localeCompare(recipeName(b)))
  const filters: [Filter, string][] = [
    ['all', `${L('All', 'Всички')} ${h.recipes.filter((r) => !r.isIdea).length}`],
    ['quick', L('Quick', 'Бързи')],
    ['A', `${L('Only', 'Само')} ${word(h.settings.names.A)}`],
    ['S', `${L('Only', 'Само')} ${word(h.settings.names.S)}`],
  ]
  const Row = ({ r }: { r: Recipe }) => (
    <a className="row-btn" href={`#/recipe/${r.id}`} style={{ textDecoration: 'none', alignItems: 'center' }}>
      {r.photo && <img src={r.photo} alt="" className="thumb" style={{ width: 40, height: 40 }} />}
      <span className="what" style={r.never ? { color: 'var(--muted)', textDecoration: 'line-through' } : undefined}>
        {r.isIdea ? <span className="hl">{recipeName(r)}</span> : recipeName(r)}
      </span>
      <span className="who">
        {r.minutes} {L('MIN', 'МИН')} · {who(r)}
      </span>
    </a>
  )
  return (
    <div className="screen">
      <div className="pad rule" style={{ paddingTop: 'calc(24px + var(--safe-t))', paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h1 className="h1">{L('Recipes', 'Рецепти')}</h1>
          <a className="btn small" href="#/new-recipe">
            <Icon name="plus" size={16} /> {L('Add', 'Добави')}
          </a>
        </div>
        <label className="field">
          <span className="sr">{L('Search recipes', 'Търси рецепти')}</span>
          <input className="input" placeholder={L('Search: chicken, soup…', 'Търси: пиле, супа…')} value={q} onChange={(e) => setQ(e.target.value)} />
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
        {ideas.length > 0 && <div className="section-label" style={{ color: 'var(--ink)' }}>{L('New ideas this week', 'Нови идеи тази седмица')}</div>}
        {ideas.map((r) => (
          <Row key={r.id} r={r} />
        ))}
        <div className="section-label">{L('Yours', 'Вашите')}</div>
        {mine.map((r) => (
          <Row key={r.id} r={r} />
        ))}
        {!mine.length && <p className="muted">{L('Nothing matches.', 'Няма съвпадения.')}</p>}
      </div>
    </div>
  )
}

export function RecipeView({ ctx, id }: { ctx: AppCtx; id: string }) {
  const { h, dispatch, now, me } = ctx
  const r = h.recipes.find((x) => x.id === id)
  if (!r) return <div className="screen no-nav"><Back /><p className="pad">{L('This recipe was deleted.', 'Тази рецепта е изтрита.')}</p></div>
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
      <Back fallback="recipes" label={L('Recipes', 'Рецепти')} />
      {r.photo && <img src={r.photo} alt="" className="photo" />}
      <div className="pad rule" style={{ paddingTop: 12, paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {r.isIdea && <div className="mono">{L('New idea this week', 'Нова идея тази седмица')}</div>}
        <h1 className="h1">{recipeName(r)}</h1>
        <p className="mono muted" style={{ margin: 0 }}>
          {r.minutes} {L('min', 'мин')} · {plural(r.portions, 'portion', 'portions', 'порция', 'порции')} · {r.eaters.map((p) => word(h.settings.names[p])).join(', ')}
          {r.boxable ? L(' · good for boxes', ' · става за кутии') : ''}
        </p>
        <div className="grid2">
          <button className="btn" onClick={plan}>
            {L('Plan it', 'Планирай')}
          </button>
          <a className="btn ghost" href={`#/recipe/${r.id}/edit`}>
            {L('Edit', 'Редактирай')}
          </a>
        </div>
        {r.isIdea && (
          <div className="grid2">
            <button className="btn yellow" onClick={() => update({ isIdea: false, ideaWeek: undefined }, L('Kept in your recipes.', 'Запазена в рецептите ви.'))}>
              {L('Keep it', 'Запази я')}
            </button>
            <button className="btn ghost" onClick={() => update({ never: true }, L('Won’t suggest it again.', 'Няма да я предлагам повече.'))}>
              {L('Never again', 'Никога повече')}
            </button>
          </div>
        )}
      </div>
      <div className="pad">
        <div className="section-label">{L('Ingredients', 'Продукти')}</div>
        {r.ingredients.map((i, n) => (
          <div key={n} className="check" style={{ minHeight: 40 }}>
            <span className="n">{ingredientText(i)}</span>
            {i.lactose && <span className="q">{L('LACTOSE', 'ЛАКТОЗА')}</span>}
          </div>
        ))}
        {r.steps && (
          <>
            <div className="section-label">{L('How', 'Приготвяне')}</div>
            <p style={{ whiteSpace: 'pre-line', margin: '4px 0 0', lineHeight: 1.5 }}>{recipeSteps(r)}</p>
          </>
        )}
        {r.sourceUrl && (
          <p>
            <a href={r.sourceUrl} target="_blank" rel="noreferrer">
              {L('Original recipe', 'Оригиналната рецепта')}
            </a>
          </p>
        )}
        {r.starter && <p className="muted" style={{ fontSize: 14 }}>{L('This is a starter recipe. Edit it to match how you make it.', 'Това е примерна рецепта. Редактирайте я така, както я правите вие.')}</p>}
        <div className="stack" style={{ paddingTop: 24 }}>
          {!r.isIdea && (
            <button className="btn ghost" onClick={() => update({ never: !r.never }, r.never ? L('It can be suggested again.', 'Пак може да се предлага.') : L('Won’t suggest it any more.', 'Няма да я предлагам повече.'))}>
              {r.never ? L('Suggest it again', 'Предлагай я пак') : L('Never suggest this', 'Не я предлагай')}
            </button>
          )}
          <button
            className="btn ghost"
            style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
            onClick={() => {
              if (!confirm(L(`Delete ${recipeName(r)}?`, `Да изтрия ли ${recipeName(r)}?`))) return
              const before = h
              dispatch((x) => ({ ...x, recipes: x.recipes.filter((y) => y.id !== id) }))
              ctx.toast({ text: L('Recipe deleted.', 'Рецептата е изтрита.'), undo: before })
              go('recipes')
            }}
          >
            {L('Delete recipe', 'Изтрий рецептата')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** The editor shows and edits one language (the phone's); `other*` keep the other language while it still matches. */
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
  /** The name/steps as first shown, and their other-language versions. */
  nameFrom?: string
  nameOther?: string
  stepsFrom?: string
  stepsOther?: string
  /** Ingredients as first shown, by line, with both languages. */
  refs?: { name: string; bg?: string; aisle?: Ingredient['aisle']; lactose?: boolean }[]
}

interface ReadRecipe {
  name?: string
  nameBg?: string
  minutes?: number
  portions?: number
  ingredients?: { name: string; bg?: string; qty?: number | null; unit?: string }[]
  steps?: string
  stepsBg?: string
  boxable?: boolean
}

const DRAFT_KEY = 'meal-planner-recipe-draft'

function emptyDraft(): Draft {
  return { name: '', portions: 4, minutes: '30', eaters: [...PEOPLE], boxable: true, ingredients: '', steps: '' }
}

export function RecipeEdit({ ctx, id }: { ctx: AppCtx; id?: string }) {
  const { h, dispatch } = ctx
  const bgMode = getLang() === 'bg'
  const existing = id ? h.recipes.find((r) => r.id === id) : undefined
  const [d, setD] = useState<Draft>(() => {
    if (existing) {
      const name = recipeName(existing)
      const steps = recipeSteps(existing)
      return {
        name,
        portions: existing.portions,
        minutes: String(existing.minutes),
        eaters: existing.eaters,
        boxable: existing.boxable,
        ingredients: existing.ingredients.map((i) => ingredientText(i)).join('\n'),
        steps,
        photo: existing.photo,
        sourceUrl: existing.sourceUrl,
        nameFrom: name,
        nameOther: bgMode ? existing.name : existing.nameBg,
        stepsFrom: steps,
        stepsOther: bgMode ? existing.steps : existing.stepsBg,
        refs: existing.ingredients.map((i) => ({ name: i.name, bg: i.bg, aisle: i.aisle, lactose: i.lactose })),
      }
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
    const name = (bgMode ? x.nameBg || x.name : x.name) ?? d.name
    const steps = (bgMode ? x.stepsBg || x.steps : x.steps) ?? d.steps
    const ings = x.ingredients?.length
      ? x.ingredients.map((i) => ({ ...parseIngredient(i.name)!, name: i.name, bg: i.bg || undefined, qty: i.qty ?? undefined, unit: i.unit || undefined }))
      : undefined
    set({
      name,
      minutes: x.minutes ? String(x.minutes) : d.minutes,
      portions: x.portions ?? d.portions,
      ingredients: ings ? ings.map((i) => ingredientText(i)).join('\n') : d.ingredients,
      steps,
      boxable: x.boxable ?? d.boxable,
      sourceUrl: sourceUrl ?? d.sourceUrl,
      nameFrom: name,
      nameOther: bgMode ? x.name : x.nameBg,
      stepsFrom: steps,
      stepsOther: bgMode ? x.steps : x.stepsBg,
      refs: ings ? ings.map((i) => ({ name: i.name, bg: i.bg, aisle: i.aisle, lactose: i.lactose })) : d.refs,
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
    let incomplete = false
    // Each line keeps its other-language name only while it still reads as first shown.
    const ingredients = d.ingredients
      .split('\n')
      .map(parseLine)
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map((p, n): Ingredient => {
        const ref = d.refs?.[n]
        const shown = ref ? (bgMode ? ref.bg || ref.name : ref.name) : undefined
        const same = !!ref && shown!.toLowerCase() === p.name.toLowerCase()
        if (bgMode) {
          if (!same || !ref.bg) incomplete = true
          return same ? { ...p, name: ref.name, bg: p.name, aisle: ref.aisle ?? guessAisle(ref.name), lactose: ref.lactose } : { ...p, bg: p.name }
        }
        if (!same || !ref.bg) incomplete = true
        return { ...p, bg: same ? ref.bg : undefined }
      })
    const name = d.name.trim()
    const steps = d.steps.trim()
    const nameOther = name === d.nameFrom?.trim() ? d.nameOther : undefined
    const stepsOther = steps === (d.stepsFrom ?? '').trim() ? d.stepsOther : undefined
    if (!nameOther || (steps && !stepsOther)) incomplete = true
    const base: Recipe = {
      id: existing?.id ?? (nameOther && bgMode ? nameOther : name).toLowerCase().replace(/[^a-z0-9а-я]+/g, '-').slice(0, 30) + '-' + uid().slice(0, 4),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      ...existing,
      // English stays the planner's reference; until it's translated, the Bulgarian text stands in.
      name: bgMode ? nameOther || name : name,
      nameBg: bgMode ? name : nameOther,
      portions: d.portions,
      minutes: Math.max(5, parseInt(d.minutes) || 30),
      eaters: d.eaters.length ? d.eaters : [...PEOPLE],
      boxable: d.boxable,
      ingredients,
      steps: bgMode ? stepsOther || steps : steps,
      stepsBg: bgMode ? steps || undefined : stepsOther,
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
    if (incomplete) translateLater(ctx, base)
    ctx.toast({ text: existing ? L('Saved.', 'Запазено.') : L(`${name} added. The plan can use it now.`, `${name} е добавена. Планът вече може да я използва.`) })
    if (existing) back()
    else go(`recipe/${base.id}`)
  }

  return (
    <div className="screen no-nav">
      <Back fallback="recipes" label={L('Recipes', 'Рецепти')} />
      <div className="pad rule" style={{ paddingTop: 10, paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 className="h1">{existing ? L('Edit recipe', 'Редактирай рецептата') : L('New recipe', 'Нова рецепта')}</h1>
        <label className="field">
          <span>{L('Got a link? Paste it and it fills in the rest.', 'Имате линк? Поставете го и останалото ще се попълни само.')}</span>
          <span style={{ display: 'flex' }}>
            <input className="input" type="url" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} style={{ borderRight: 0, minWidth: 0 }} />
            <button className="btn yellow" style={{ outline: '2px solid var(--ink)', outlineOffset: -2, whiteSpace: 'nowrap', minHeight: 48 }} onClick={readLink} disabled={!!busy || !link.trim()}>
              {busy === 'link' ? <span className="spinner" /> : L('Read it', 'Прочети')}
            </button>
          </span>
        </label>
        <div className="field">
          <span>{L('Or add photos', 'Или добавете снимки')}</span>
          <div className="grid2">
            <PhotoInput className="photo-btn yellow" multiple onFiles={readScreens}>
              {busy === 'screens' ? <span className="spinner" /> : <Icon name="doc" />}
              <span>
                {L('Screenshots of a recipe', 'Снимки на рецепта')}
                <br />
                <small>{busy === 'screens' ? L('Reading…', 'Чета…') : L('Reads it for you', 'Прочита я вместо вас')}</small>
              </span>
            </PhotoInput>
            <PhotoInput className="photo-btn" onFiles={addPhoto}>
              {d.photo ? <img src={d.photo} alt={L('Dish photo', 'Снимка на ястието')} className="thumb" /> : busy === 'photo' ? <span className="spinner" /> : <Icon name="camera" />}
              <span>
                {d.photo ? L('Change the photo', 'Смени снимката') : L('Photo of the dish', 'Снимка на ястието')}
                <br />
                <small>{L('Shows on the plan', 'Показва се в плана')}</small>
              </span>
            </PhotoInput>
          </div>
        </div>
        {err && <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 600 }}>{err}</p>}
      </div>
      <div className="pad stack" style={{ paddingTop: 16 }}>
        <div className="mono muted">{existing ? L('Details', 'Подробности') : L('Or write it yourself', 'Или я напишете сами')}</div>
        <label className="field">
          <span>{L('Name', 'Име')}</span>
          <input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder={L('Our chicken & rice', 'Нашето пиле с ориз')} />
        </label>
        <div className="grid2">
          <div className="field">
            <span>{L('Portions', 'Порции')}</span>
            <Stepper label="portions" value={d.portions} min={1} max={20} onChange={(n) => set({ portions: n })} />
          </div>
          <label className="field">
            <span>{L('Minutes', 'Минути')}</span>
            <input className="input" inputMode="numeric" value={d.minutes} onChange={(e) => set({ minutes: e.target.value.replace(/\D/g, '') })} style={{ fontFamily: 'var(--mono)' }} />
          </label>
        </div>
        <div className="field">
          <span>{L('Who eats it', 'Кой я яде')}</span>
          <div className="row-flex" style={{ flexWrap: 'wrap' }}>
            {PEOPLE.map((p) => (
              <button
                key={p}
                type="button"
                className={'chip' + (d.eaters.includes(p) ? ' on' : '')}
                aria-pressed={d.eaters.includes(p)}
                onClick={() => set({ eaters: d.eaters.includes(p) ? d.eaters.filter((x) => x !== p) : PEOPLE.filter((y) => y === p || d.eaters.includes(y)) })}
              >
                {word(h.settings.names[p])}
              </button>
            ))}
          </div>
        </div>
        <label className="check" style={{ borderBottom: 0 }}>
          <input type="checkbox" checked={d.boxable} onChange={(e) => set({ boxable: e.target.checked })} />
          <span className="n">
            {L('Good for office boxes', 'Става за кутия за офиса')}
            <small>{L("Off for soups and anything that doesn't travel", 'Изключете за супи и всичко, което не се пренася добре')}</small>
          </span>
        </label>
        <label className="field">
          <span>{L('Ingredients, one per line', 'Продукти, по един на ред')}</span>
          <textarea className="textarea" rows={7} value={d.ingredients} onChange={(e) => set({ ingredients: e.target.value })} placeholder={L('1 kg chicken breast\n400 g rice\n3 carrots', '1 кг пилешко филе\n400 г ориз\n3 моркова')} />
        </label>
        <label className="field">
          <span>
            {L('How to cook it', 'Как се приготвя')} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>{L('(optional)', '(по желание)')}</span>
          </span>
          <textarea className="textarea plain" rows={4} value={d.steps} onChange={(e) => set({ steps: e.target.value })} placeholder={L('Short notes are enough', 'Кратки бележки са достатъчни')} />
        </label>
        <button className="btn wide" onClick={save} disabled={!d.name.trim()}>
          {L('Save recipe', 'Запази рецептата')}
        </button>
        {!existing && (d.name || d.ingredients) && (
          <button className="link" style={{ alignSelf: 'center' }} onClick={() => setD(emptyDraft())}>
            {L('Clear and start over', 'Изчисти и започни отначало')}
          </button>
        )}
      </div>
    </div>
  )
}
