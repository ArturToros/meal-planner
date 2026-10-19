import { useState } from 'react'
import type { Household } from '../lib/types'
import { cookOf, markCooked, recipeOf, slotLabel, type Result } from '../lib/planner'
import { formatQty } from '../lib/ingredients'
import { backend, compressImage } from '../lib/backend'
import { Back, Icon, PhotoInput, Sheet, Stepper, go, type AppCtx } from './common'
import { resultToast } from './Plan'
import { L, ingredientName, plural, recipeName, recipeSteps, unitWord, word } from '../lib/i18n'
import type { Ingredient } from '../lib/types'

/** "1.5 kg chicken breast" in the phone's language. */
function ingredientLine(i: Ingredient, scale: number): string {
  const q = formatQty(i, scale)
  const [n, u] = q.split(' ')
  const qty = u ? `${n} ${unitWord(u)}` : q
  return [qty, ingredientName({ name: word(i.name), bg: i.bg })].filter(Boolean).join(' ')
}

export function Cook({ ctx, cookId }: { ctx: AppCtx; cookId: string }) {
  const { h, now, me, dispatch } = ctx
  const c = cookOf(h, cookId)
  const r = recipeOf(h, c?.recipeId)
  const [done, setDone] = useState(false)
  const [ticked, setTicked] = useState<Set<number>>(new Set())
  const own = h.meals.find((m) => m.cookId === cookId && m.kind === 'cook')
  const eatNow = own ? own.eaters.length + (own.guests ?? 0) : 0
  const [boxes, setBoxes] = useState(c ? Math.max(0, c.portions - eatNow) : 0)
  const [photo, setPhoto] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  if (!c || !r) return <div className="screen no-nav"><Back /><p className="pad">{L('This meal is no longer in the plan.', 'Това ястие вече не е в плана.')}</p></div>
  const scale = c.portions / r.portions

  const finish = () => {
    const before = h
    let res: Result | undefined
    dispatch((x: Household) => {
      res = markCooked(x, cookId, boxes, { now, by: me })
      if (photo) {
        const rr = res.h.recipes.find((y) => y.id === r.id)
        if (rr) rr.photo = photo
      }
      return res.h
    })
    if (res) resultToast(ctx, before, res, L(`Enjoy. ${boxes} box${boxes === 1 ? '' : 'es'} saved.`, `Добър апетит. Записани: ${plural(boxes, 'box', 'boxes', 'кутия', 'кутии')}.`))
    go('plan')
  }

  return (
    <div className="screen no-nav">
      <Back />
      {r.photo && <img src={r.photo} alt="" className="photo" />}
      <div className="pad rule" style={{ paddingTop: 12, paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="mono">{slotLabel(c, now)}</div>
        <h1 className="h1">{recipeName(r)}</h1>
        <p style={{ margin: 0, fontSize: 17 }}>
          {L(
            `${c.portions} portions · about ${r.minutes} min${scale !== 1 ? ` · amounts scaled from ${r.portions} portions` : ''}`,
            `${c.portions} порции · около ${r.minutes} мин${scale !== 1 ? ` · количествата са преизчислени от ${r.portions} порции` : ''}`,
          )}
        </p>
      </div>
      <div className="pad">
        <div className="section-label">{L('Ingredients', 'Продукти')}</div>
        {r.ingredients.map((i, n) => (
          <label key={n} className={'check' + (ticked.has(n) ? ' done' : '')}>
            <input
              type="checkbox"
              checked={ticked.has(n)}
              onChange={() => {
                const next = new Set(ticked)
                if (next.has(n)) next.delete(n)
                else next.add(n)
                setTicked(next)
              }}
            />
            <span className="n">{ingredientLine(i, scale)}</span>
          </label>
        ))}
        {recipeSteps(r) && (
          <>
            <div className="section-label">{L('How', 'Приготвяне')}</div>
            <p style={{ whiteSpace: 'pre-line', fontSize: 17, lineHeight: 1.5, margin: '4px 0 0' }}>{recipeSteps(r)}</p>
          </>
        )}
        {r.sourceUrl && (
          <p>
            <a href={r.sourceUrl} target="_blank" rel="noreferrer">
              {L('Original recipe', 'Оригинална рецепта')}
            </a>
          </p>
        )}
        <div style={{ paddingTop: 20 }}>
          <button className="btn wide" onClick={() => setDone(true)}>
            {L('Done cooking', 'Сготвено')}
          </button>
        </div>
      </div>
      {done && (
        <Sheet label={L('Done cooking', 'Сготвено')} onClose={() => setDone(false)}>
          <h2 className="h2">{L('How many boxes are left?', 'Колко кутии останаха?')}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {L(
              `After ${eatNow} portion${eatNow === 1 ? '' : 's'} for now. The plan uses exactly this many later.`,
              `След ${plural(eatNow, 'portion', 'portions', 'порция', 'порции')} за сега. Планът ще използва точно толкова по-късно.`,
            )}
          </p>
          <Stepper label={L('boxes', 'кутии')} value={boxes} onChange={setBoxes} max={20} />
          <PhotoInput
            camera
            className="photo-btn"
            onFiles={async ([f]) => {
              setUploading(true)
              try {
                setPhoto(await backend.uploadPhoto(await compressImage(f)))
              } catch (e) {
                ctx.toast({ text: L(`Photo not saved: ${(e as Error).message}`, `Снимката не е запазена: ${(e as Error).message}`) })
              } finally {
                setUploading(false)
              }
            }}
          >
            {photo ? <img src={photo} alt={L('Your photo of the dish', 'Твоята снимка на ястието')} className="thumb" /> : uploading ? <span className="spinner" /> : <Icon name="camera" />}
            <span>
              {photo ? L('Photo added', 'Снимката е добавена') : L('Add a photo?', 'Да добавим снимка?')}
              <br />
              <small>{L('Shows on the plan next time', 'Ще се вижда в плана следващия път')}</small>
            </span>
          </PhotoInput>
          <button className="btn wide" onClick={finish} disabled={uploading}>
            {L('Save', 'Запази')}
          </button>
        </Sheet>
      )}
    </div>
  )
}
