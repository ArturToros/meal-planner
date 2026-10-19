import { useState } from 'react'
import type { Household, SpendEntry, SpendKind } from '../lib/types'
import { uid } from '../lib/planner'
import { addDays, longDate, toDate, weekStart } from '../lib/dates'
import { shoppingList } from '../lib/shopping'
import { backend, compressImage, toBase64 } from '../lib/backend'
import { Icon, PhotoInput, Sheet, eur, type AppCtx } from './common'
import { L, getLang, plural, word } from '../lib/i18n'

interface ReadReceipt {
  store?: string
  date?: string
  total?: number
  items?: { name: string; english?: string; amount: number; food: boolean }[]
}

const KIND_LABEL: Record<SpendKind, () => string> = {
  grocery: () => L('Groceries', 'Храна от магазина'),
  takeaway: () => L('Takeaway', 'Поръчки'),
  lunch: () => L('Lunch out', 'Обяд навън'),
  nonfood: () => L('Non-food', 'Нехранителни'),
}

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
    if (h.spending.some((e) => e.receiptKey === key) && !confirm(L('This receipt looks like one you already added. Add it again?', 'Тази бележка изглежда вече е добавена. Да я добавя ли пак?'))) return
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
    ctx.toast({
      text: L(
        `Receipt saved: ${eur(total - nonFoodSum)} food${nonFood.length ? `, ${eur(nonFoodSum)} non-food` : ''}.`,
        `Бележката е запазена: ${eur(total - nonFoodSum)} храна${nonFood.length ? `, ${eur(nonFoodSum)} нехранителни` : ''}.`,
      ),
    })
    setReceipt(null)
  }

  return (
    <div className="screen">
      <div className="rule" style={{ padding: 'calc(24px + var(--safe-t)) 22px 22px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }} className="mono">
          <span>{L('This week, food', 'Тази седмица, храна')}</span>
          <span className="muted">{prev.length ? L(`Last week ${eur(prevFood)}`, `Миналата седмица ${eur(prevFood)}`) : ''}</span>
        </div>
        <div className="big-number">{eur(food)}</div>
        <div className="row-flex" style={{ gap: 20, fontWeight: 600, flexWrap: 'wrap' }}>
          <span>
            {KIND_LABEL.grocery()} {eur(sum(week, ['grocery']))}
          </span>
          <span className="hl">
            {KIND_LABEL.takeaway()} {eur(sum(week, ['takeaway']))}
          </span>
          {sum(week, ['lunch']) > 0 && (
            <span>
              {KIND_LABEL.lunch()} {eur(sum(week, ['lunch']))}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--ink)' }}>
        <PhotoInput camera multiple className="btn yellow" style={{ flex: 1, padding: 0 }} onFiles={snap}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center', minHeight: 64 }}>
            {reading ? <span className="spinner" /> : <Icon name="camera" />}
            {reading ? L('Reading…', 'Чета…') : L('Snap receipt', 'Снимай бележка')}
          </span>
        </PhotoInput>
        <button className="btn ghost" style={{ flex: 1, minHeight: 64, border: 0, borderLeft: '1px solid var(--ink)' }} onClick={() => setOrdered({ amount: '', kind: 'takeaway', note: '' })}>
          {L('We ordered', 'Поръчахме')}
        </button>
      </div>
      {err && (
        <div className="notice yellow">
          <p>{err}</p>
          <div className="actions">
            <button className="btn small ghost" onClick={() => setManual('')}>
              {L('Type the total instead', 'Въведи сумата ръчно')}
            </button>
          </div>
        </div>
      )}
      <div className="pad">
        {recent.length === 0 && <p className="muted" style={{ paddingTop: 16 }}>{L(
              'Snap your first Lidl receipt, or add an order. Nothing to set up; just watch it for two weeks.',
              'Снимайте първата си бележка от Lidl или добавете поръчка. Нищо не трябва да се настройва; просто следете две седмици.',
            )}</p>}
        {recent.map((e, i) => (
          <div key={e.id}>
            {(i === 0 || (recent[i - 1].date >= thisWeek) !== (e.date >= thisWeek)) && <div className="section-label">{e.date >= thisWeek ? L('This week', 'Тази седмица') : L('Last week', 'Миналата седмица')}</div>}
            <div className="check" style={{ minHeight: 52 }}>
              <span className="mono muted" style={{ width: 52 }}>
                {longDate(e.date).split(' ').slice(0, 2).join(' ')}
              </span>
              <span className="n">
                {e.store || KIND_LABEL[e.kind]()}
                <small>
                  {KIND_LABEL[e.kind]()}
                  {e.items?.length ? ` · ${plural(e.items.length, 'item', 'items', 'продукт', 'продукта')}` : ''}
                  {e.note ? ` · ${e.note}` : ''}
                </small>
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{eur(e.amount)}</span>
              <button
                aria-label={L('Delete', 'Изтрий')}
                className="link"
                style={{ minWidth: 36, justifyContent: 'center' }}
                onClick={() => {
                  const before = h
                  dispatch((x) => ({ ...x, spending: x.spending.filter((y) => y.id !== e.id) }))
                  ctx.toast({ text: L('Removed.', 'Премахнато.'), undo: before })
                }}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          </div>
        ))}
        {showNonFood && (
          <p style={{ marginTop: 18, fontSize: 14, color: 'var(--muted)' }}>
            {L(
              `Non-food items (dish tabs, kitchen roll…) are split out of receipts automatically and only show when ${word(h.settings.names.A)} is using the app. This week: ${eur(sum(week, ['nonfood']))}.`,
              `Нехранителните продукти (таблетки за съдомиялна, кухненска ролка…) се отделят от бележките автоматично и се виждат само когато ${word(h.settings.names.A)} ползва приложението. Тази седмица: ${eur(sum(week, ['nonfood']))}.`,
            )}
          </p>
        )}
        <button className="link" style={{ marginTop: 6 }} onClick={() => setManual('')}>
          + {L('Add a receipt total by hand', 'Добави сума от бележка ръчно')}
        </button>
      </div>

      {ordered && (
        <Sheet label={L('We ordered', 'Поръчахме')} onClose={() => setOrdered(null)}>
          <h2 className="h2">{L('We ordered', 'Поръчахме')}</h2>
          <form
            className="stack"
            onSubmit={(ev) => {
              ev.preventDefault()
              const amount = parseFloat(ordered.amount.replace(',', '.'))
              if (!amount) return
              dispatch((x) => ({ ...x, spending: [...x.spending, { id: uid(), date: toDate(now), kind: ordered.kind, amount, note: ordered.note || undefined, by: me }] }))
              ctx.toast({ text: L(`${eur(amount)} added.`, `${eur(amount)} добавени.`) })
              setOrdered(null)
            }}
          >
            <div className="row-flex">
              {(['takeaway', 'lunch'] as SpendKind[]).map((k) => (
                <button type="button" key={k} className={'chip' + (ordered.kind === k ? ' on' : '')} aria-pressed={ordered.kind === k} onClick={() => setOrdered({ ...ordered, kind: k })}>
                  {k === 'takeaway' ? KIND_LABEL.takeaway() : L('Lunch at the office', 'Обяд в офиса')}
                </button>
              ))}
            </div>
            <label className="field">
              <span>{L('How much, in euros', 'Колко, в евро')}</span>
              <input className="input" inputMode="decimal" autoFocus value={ordered.amount} onChange={(e) => setOrdered({ ...ordered, amount: e.target.value })} placeholder="24.50" />
            </label>
            <label className="field">
              <span>{L('Where from (optional)', 'Откъде (по желание)')}</span>
              <input className="input" value={ordered.note} onChange={(e) => setOrdered({ ...ordered, note: e.target.value })} />
            </label>
            <button className="btn wide">{L('Add', 'Добави')}</button>
          </form>
        </Sheet>
      )}

      {manual !== null && (
        <Sheet label={L('Receipt total', 'Сума от бележка')} onClose={() => setManual(null)}>
          <h2 className="h2">{L('Receipt total', 'Сума от бележка')}</h2>
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
              <span>{L('Food total, in euros', 'Сума за храна, в евро')}</span>
              <input className="input" inputMode="decimal" autoFocus value={manual} onChange={(e) => setManual(e.target.value)} />
            </label>
            <button className="btn wide">{L('Add', 'Добави')}</button>
          </form>
        </Sheet>
      )}

      {receipt && (
        <Sheet label={L('Check the receipt', 'Проверете бележката')} onClose={() => setReceipt(null)}>
          <h2 className="h2">{L('Check the receipt', 'Проверете бележката')}</h2>
          <div className="grid2">
            <label className="field">
              <span>{L('Shop', 'Магазин')}</span>
              <input className="input" value={receipt.store ?? ''} onChange={(e) => setReceipt({ ...receipt, store: e.target.value })} />
            </label>
            <label className="field">
              <span>{L('Total €', 'Общо €')}</span>
              <input
                className="input"
                inputMode="decimal"
                value={receipt.total ?? ''}
                onChange={(e) => setReceipt({ ...receipt, total: parseFloat(e.target.value.replace(',', '.')) || undefined })}
              />
            </label>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            {L(
              `Untick anything that isn't food. It goes to ${word(h.settings.names.A)}'s non-food list.`,
              `Махнете отметката от всичко, което не е храна. То отива в нехранителния списък на ${word(h.settings.names.A)}.`,
            )}
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
                  {getLang() === 'bg' ? it.name : it.english || it.name}
                  {getLang() !== 'bg' && it.english && it.english !== it.name && <small>{it.name}</small>}
                </span>
                <span className="q">{eur(it.amount)}</span>
              </label>
            ))}
          </div>
          <button className="btn wide" onClick={saveReceipt}>
            {L('Save', 'Запази')}
          </button>
        </Sheet>
      )}
    </div>
  )
}
