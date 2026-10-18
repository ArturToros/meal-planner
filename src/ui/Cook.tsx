import { useState } from 'react'
import type { Household } from '../lib/types'
import { cookOf, markCooked, recipeOf, slotLabel, type Result } from '../lib/planner'
import { formatIngredient } from '../lib/ingredients'
import { backend, compressImage } from '../lib/backend'
import { Back, Icon, PhotoInput, Sheet, Stepper, go, type AppCtx } from './common'
import { resultToast } from './Plan'

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
  if (!c || !r) return <div className="screen no-nav"><Back /><p className="pad">This meal is no longer in the plan.</p></div>
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
    if (res) resultToast(ctx, before, res, `Enjoy. ${boxes} box${boxes === 1 ? '' : 'es'} saved.`)
    go('plan')
  }

  return (
    <div className="screen no-nav">
      <Back />
      {r.photo && <img src={r.photo} alt="" className="photo" />}
      <div className="pad rule" style={{ paddingTop: 12, paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="mono">{slotLabel(c, now)}</div>
        <h1 className="h1">{r.name}</h1>
        <p style={{ margin: 0, fontSize: 17 }}>
          {c.portions} portions · about {r.minutes} min{scale !== 1 ? ` · amounts scaled from ${r.portions} portions` : ''}
        </p>
      </div>
      <div className="pad">
        <div className="section-label">Ingredients</div>
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
            <span className="n">{formatIngredient(i, scale)}</span>
          </label>
        ))}
        {r.steps && (
          <>
            <div className="section-label">How</div>
            <p style={{ whiteSpace: 'pre-line', fontSize: 17, lineHeight: 1.5, margin: '4px 0 0' }}>{r.steps}</p>
          </>
        )}
        {r.sourceUrl && (
          <p>
            <a href={r.sourceUrl} target="_blank" rel="noreferrer">
              Original recipe
            </a>
          </p>
        )}
        <div style={{ paddingTop: 20 }}>
          <button className="btn wide" onClick={() => setDone(true)}>
            Done cooking
          </button>
        </div>
      </div>
      {done && (
        <Sheet label="Done cooking" onClose={() => setDone(false)}>
          <h2 className="h2">How many boxes are left?</h2>
          <p className="muted" style={{ margin: 0 }}>
            After {eatNow} portion{eatNow === 1 ? '' : 's'} for now. The plan uses exactly this many later.
          </p>
          <Stepper label="boxes" value={boxes} onChange={setBoxes} max={20} />
          <PhotoInput
            camera
            className="photo-btn"
            onFiles={async ([f]) => {
              setUploading(true)
              try {
                setPhoto(await backend.uploadPhoto(await compressImage(f)))
              } catch (e) {
                ctx.toast({ text: `Photo not saved: ${(e as Error).message}` })
              } finally {
                setUploading(false)
              }
            }}
          >
            {photo ? <img src={photo} alt="Your photo of the dish" className="thumb" /> : uploading ? <span className="spinner" /> : <Icon name="camera" />}
            <span>
              {photo ? 'Photo added' : 'Add a photo?'}
              <br />
              <small>Shows on the plan next time</small>
            </span>
          </PhotoInput>
          <button className="btn wide" onClick={finish} disabled={uploading}>
            Save
          </button>
        </Sheet>
      )}
    </div>
  )
}
