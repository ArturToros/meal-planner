import { useState } from 'react'
import type { Household, SpendEntry, SpendKind } from '../lib/types'
import { uid } from '../lib/planner'
import { addDays, longDate, toDate, weekStart } from '../lib/dates'
import { shoppingList } from '../lib/shopping'
import { backend, compressImage, toBase64 } from '../lib/backend'
import { Icon, PhotoInput, Sheet, eur, type AppCtx } from './common'

interface ReadReceipt {
  store?: string
  date?: string
  total?: number
  items?: { name: string; english?: string; amount: number; food: boolean }[]
}

const KIND_LABEL: Record<SpendKind, string> = { grocery: 'Groceries', takeaway: 'Takeaway', lunch: 'Lunch out', nonfood: 'Non-food' }

function sum(list: SpendEntry[], kinds: SpendKind[]) {
  return list.filter((e) => kinds.includes(e.kind)).reduce((n, e) => n + e.amount, 0)
}

export function Money({ ctx }: { ctx: AppCtx }) {
  const { h, now, me, dispatch } = ctx
  const [receipt, setReceipt] = useState<(ReadReceipt & { items: NonNullable<ReadReceipt['items']> }) | null>(null)
  const [reading, setReading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ordered, setOrdered] = useState<{ amount: string; kind: SpendKind; note: string } | null>(null)
  const [manual, setManual] = useState<string | null>(null)
  const thisWeek = weekStart(toDate(now))
  const lastWeek = addDays(thisWeek, -7)
  const inWeek = (w: string) => h.spending.filter((e) => e.date >= w && e.date < addDays(w, 7))
  const week = inWeek(thisWeek)
  const prev = inWeek(lastWeek)
  const food = sum(week, ['grocery', 'takeaway', 'lunch'])
  const prevFood = sum(prev, ['grocery', 'takeaway', 'lunch'])
  const showNonFood = me === 'A'
  const recent = [...h.spending].filter((e) => e.date >= lastWeek && (showNonFood || e.kind !== 'nonfood')).sort((a, b) => b.date.localeCompare(a.date))

  const snap = async (files: File[]) => {
    setReading(true)
    setErr(null)
    try {
      const images = await Promise.all(files.slice(0, 3).map(async (f) => toBase64(await compressImage(f, 2000, 0.85))))
      const listNames = shoppingList(h, now).map((i) => i.name)
      const res = await backend.read<ReadReceipt>({ kind: 'receipt', images, context: { listNames } })
      setReceipt({ ...res, items: res.items ?? [] })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setReading(false)
    }
  }

  const saveReceipt = () => {
    if (!receipt) return
    const date = receipt.date && /^\d{4}-\d{2}-\d{2}$/.test(receipt.date) ? receipt.date : toDate(now)
    const foodItems = receipt.items.filter((i) => i.food)
    const nonFood = receipt.items.filter((i) => !i.food)
    const nonFoodSum = nonFood.reduce((n, i) => n + i.amount, 0)
    const total = receipt.total ?? receipt.items.reduce((n, i) => n + i.amount, 0)
    const key = `${date}|${total.toFixed(2)}`
    if (h.spending.some((e) => e.receiptKey === key) && !confirm('This receipt looks like one you already added. Add it again?')) return
    const list = shoppingList(h, now)
    dispatch((x: Household) => {
      const next = structuredClone(x)
      next.spending.push({ id: uid(), date, kind: 'grocery', amount: Math.round((total - nonFoodSum) * 100) / 100, store: receipt.store, items: foodItems, receiptKey: key, by: me })
      if (nonFood.length) next.spending.push({ id: uid(), date, kind: 'nonfood', amount: Math.round(nonFoodSum * 100) / 100, store: receipt.store, items: nonFood, by: me })
      // Bought items count as at home, so they leave the list.
      for (const i of foodItems) {
        const n = (i.english ?? i.name).toLowerCase()
        for (const it of list) {
          const m = it.name.toLowerCase().replace(/, lactose-free$/, '')
          if (it.kind === 'recipe' && n && (n.includes(m) || m.includes(n))) next.bought.push({ name: it.name, at: new Date().toISOString(), cookIds: it.cookIds })
        }
        next.bought.push({ name: i.english ?? i.name, at: new Date().toISOString(), cookIds: [] })
      }
      return next
    })
    ctx.toast({ text: `Receipt saved: ${eur(total - nonFoodSum)} food${nonFood.length ? `, ${eur(nonFoodSum)} non-food` : ''}.` })
    setReceipt(null)
  }

  return (
    <div className="screen">
      <div className="rule" style={{ padding: 'calc(24px + var(--safe-t)) 22px 22px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }} className="mono">
          <span>This week, food</span>
          <span className="muted">{prev.length ? `Last week ${eur(prevFood)}` : ''}</span>
        </div>
        <div className="big-number">{eur(food)}</div>
        <div className="row-flex" style={{ gap: 20, fontWeight: 600, flexWrap: 'wrap' }}>
          <span>Groceries {eur(sum(week, ['grocery']))}</span>
          <span className="hl">Takeaway {eur(sum(week, ['takeaway']))}</span>
          {sum(week, ['lunch']) > 0 && <span>Lunch out {eur(sum(week, ['lunch']))}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--ink)' }}>
        <PhotoInput camera multiple className="btn yellow" style={{ flex: 1, padding: 0 }} onFiles={snap}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center', minHeight: 64 }}>
            {reading ? <span className="spinner" /> : <Icon name="camera" />}
            {reading ? 'Reading…' : 'Snap receipt'}
          </span>
        </PhotoInput>
        <button className="btn ghost" style={{ flex: 1, minHeight: 64, border: 0, borderLeft: '1px solid var(--ink)' }} onClick={() => setOrdered({ amount: '', kind: 'takeaway', note: '' })}>
          We ordered
        </button>
      </div>
      {err && (
        <div className="notice yellow">
          <p>{err}</p>
          <div className="actions">
            <button className="btn small ghost" onClick={() => setManual('')}>
              Type the total instead
            </button>
          </div>
        </div>
      )}
      <div className="pad">
        {recent.length === 0 && <p className="muted" style={{ paddingTop: 16 }}>Snap your first Lidl receipt, or add an order. Nothing to set up; just watch it for two weeks.</p>}
        {recent.map((e, i) => (
          <div key={e.id}>
            {(i === 0 || (recent[i - 1].date >= thisWeek) !== (e.date >= thisWeek)) && <div className="section-label">{e.date >= thisWeek ? 'This week' : 'Last week'}</div>}
            <div className="check" style={{ minHeight: 52 }}>
              <span className="mono muted" style={{ width: 52 }}>
                {longDate(e.date).split(' ').slice(0, 2).join(' ')}
              </span>
              <span className="n">
                {e.store || KIND_LABEL[e.kind]}
                <small>
                  {KIND_LABEL[e.kind]}
                  {e.items?.length ? ` · ${e.items.length} items` : ''}
                  {e.note ? ` · ${e.note}` : ''}
                </small>
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{eur(e.amount)}</span>
              <button
                aria-label="Delete"
                className="link"
                style={{ minWidth: 36, justifyContent: 'center' }}
                onClick={() => {
                  const before = h
                  dispatch((x) => ({ ...x, spending: x.spending.filter((y) => y.id !== e.id) }))
                  ctx.toast({ text: 'Removed.', undo: before })
                }}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          </div>
        ))}
        {showNonFood && (
          <p style={{ marginTop: 18, fontSize: 14, color: 'var(--muted)' }}>
            Non-food items (dish tabs, kitchen roll…) are split out of receipts automatically and only show when {h.settings.names.A} is using the app. This week: {eur(sum(week, ['nonfood']))}.
          </p>
        )}
        <button className="link" style={{ marginTop: 6 }} onClick={() => setManual('')}>
          + Add a receipt total by hand
        </button>
      </div>

      {ordered && (
        <Sheet label="We ordered" onClose={() => setOrdered(null)}>
          <h2 className="h2">We ordered</h2>
          <form
            className="stack"
            onSubmit={(ev) => {
              ev.preventDefault()
              const amount = parseFloat(ordered.amount.replace(',', '.'))
              if (!amount) return
              dispatch((x) => ({ ...x, spending: [...x.spending, { id: uid(), date: toDate(now), kind: ordered.kind, amount, note: ordered.note || undefined, by: me }] }))
              ctx.toast({ text: `${eur(amount)} added.` })
              setOrdered(null)
            }}
          >
            <div className="row-flex">
              {(['takeaway', 'lunch'] as SpendKind[]).map((k) => (
                <button type="button" key={k} className={'chip' + (ordered.kind === k ? ' on' : '')} aria-pressed={ordered.kind === k} onClick={() => setOrdered({ ...ordered, kind: k })}>
                  {k === 'takeaway' ? 'Takeaway' : 'Lunch at the office'}
                </button>
              ))}
            </div>
            <label className="field">
              <span>How much, in euros</span>
              <input className="input" inputMode="decimal" autoFocus value={ordered.amount} onChange={(e) => setOrdered({ ...ordered, amount: e.target.value })} placeholder="24.50" />
            </label>
            <label className="field">
              <span>Where from (optional)</span>
              <input className="input" value={ordered.note} onChange={(e) => setOrdered({ ...ordered, note: e.target.value })} />
            </label>
            <button className="btn wide">Add</button>
          </form>
        </Sheet>
      )}

      {manual !== null && (
        <Sheet label="Receipt total" onClose={() => setManual(null)}>
          <h2 className="h2">Receipt total</h2>
          <form
            className="stack"
            onSubmit={(ev) => {
              ev.preventDefault()
              const amount = parseFloat(manual.replace(',', '.'))
              if (!amount) return
              dispatch((x) => ({ ...x, spending: [...x.spending, { id: uid(), date: toDate(now), kind: 'grocery', amount, store: 'Lidl', by: me }] }))
              setManual(null)
              setErr(null)
            }}
          >
            <label className="field">
              <span>Food total, in euros</span>
              <input className="input" inputMode="decimal" autoFocus value={manual} onChange={(e) => setManual(e.target.value)} />
            </label>
            <button className="btn wide">Add</button>
          </form>
        </Sheet>
      )}

      {receipt && (
        <Sheet label="Check the receipt" onClose={() => setReceipt(null)}>
          <h2 className="h2">Check the receipt</h2>
          <div className="grid2">
            <label className="field">
              <span>Shop</span>
              <input className="input" value={receipt.store ?? ''} onChange={(e) => setReceipt({ ...receipt, store: e.target.value })} />
            </label>
            <label className="field">
              <span>Total €</span>
              <input
                className="input"
                inputMode="decimal"
                value={receipt.total ?? ''}
                onChange={(e) => setReceipt({ ...receipt, total: parseFloat(e.target.value.replace(',', '.')) || undefined })}
              />
            </label>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Untick anything that isn't food. It goes to {h.settings.names.A}'s non-food list.
          </p>
          <div>
            {receipt.items.map((it, i) => (
              <label key={i} className="check">
                <input
                  type="checkbox"
                  checked={it.food}
                  onChange={() => setReceipt({ ...receipt, items: receipt.items.map((x, j) => (j === i ? { ...x, food: !x.food } : x)) })}
                />
                <span className="n">
                  {it.english || it.name}
                  {it.english && it.english !== it.name && <small>{it.name}</small>}
                </span>
                <span className="q">{eur(it.amount)}</span>
              </label>
            ))}
          </div>
          <button className="btn wide" onClick={saveReceipt}>
            Save
          </button>
        </Sheet>
      )}
    </div>
  )
}
