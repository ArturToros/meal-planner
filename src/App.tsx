import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Person, Slot } from './lib/types'
import { PEOPLE } from './lib/types'
import { getMe, setMe, useHousehold, type Toast } from './lib/store'
import { supabase } from './lib/backend'
import { Nav, go, useRoute, type AppCtx } from './ui/common'
import { Plan } from './ui/Plan'
import { Change } from './ui/Change'
import { Cook } from './ui/Cook'
import { RecipeEdit, RecipeView, Recipes } from './ui/Recipes'
import { List } from './ui/List'
import { Money } from './ui/Money'
import { Settings } from './ui/Settings'

function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    const vis = () => document.visibilityState === 'visible' && setNow(new Date())
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [])
  return now
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="app">
      <div className="screen no-nav pad" style={{ justifyContent: 'center', gap: 20, paddingTop: 40 }}>
        <h1 className="h1 xl">
          What are we <span className="hl">eating?</span>
        </h1>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setErr(null)
            const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
            if (error) setErr(error.message === 'Invalid login credentials' ? 'That email or password is not right.' : error.message)
            setBusy(false)
          }}
        >
          <label className="field">
            <span>Household email</span>
            <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {err && <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 600 }}>{err}</p>}
          <button className="btn wide" disabled={busy}>
            {busy ? <span className="spinner" /> : 'Open'}
          </button>
        </form>
        <p className="muted" style={{ fontSize: 14 }}>
          One login for the whole household. You stay signed in on this phone.
        </p>
      </div>
    </div>
  )
}

function WhoAreYou({ names, onPick }: { names: Record<Person, string>; onPick: (p: Person) => void }) {
  return (
    <div className="app">
      <div className="screen no-nav pad" style={{ justifyContent: 'center', gap: 16 }}>
        <h1 className="h1 xl">Who are you?</h1>
        <p style={{ margin: 0, fontSize: 17 }}>So the others can see who changed what. Asked once on this phone.</p>
        {PEOPLE.map((p) => (
          <button key={p} className="btn ghost wide" style={{ justifyContent: 'flex-start', fontSize: 20 }} onClick={() => onPick(p)}>
            {names[p]}
          </button>
        ))}
      </div>
    </div>
  )
}

function Main() {
  const { h, dispatch, error, refresh } = useHousehold()
  const route = useRoute()
  const now = useNow()
  const [me, setMeState] = useState<Person | null>(getMe)
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const showToast = useCallback((t: Toast) => {
    setToast(t)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), t.undo ? 7000 : 3500)
  }, [])

  // The plan rolls forward on its own: re-check when the day or meal changes.
  const slotStamp = `${now.toDateString()}-${now.getHours() < 15 ? 'l' : now.getHours() < 21 ? 'd' : 'n'}`
  useEffect(() => {
    refresh()
  }, [slotStamp, refresh])

  if (!h) {
    return (
      <div className="app">
        <div className="screen no-nav pad" style={{ justifyContent: 'center', alignItems: 'center' }}>
          {error ? <p>{error}</p> : <span className="spinner" aria-label="Loading" />}
        </div>
      </div>
    )
  }
  if (!me) {
    return (
      <WhoAreYou
        names={h.settings.names}
        onPick={(p) => {
          setMe(p)
          setMeState(p)
        }}
      />
    )
  }

  const ctx: AppCtx = { h, me, dispatch, toast: showToast, go, now }
  const [page, a, b] = route
  let body
  let tab: string | null = null
  switch (page) {
    case 'change':
      body = <Change key={a + b} ctx={ctx} date={a} slot={b as Slot} />
      break
    case 'cook':
      body = <Cook ctx={ctx} cookId={a} />
      break
    case 'recipes':
      tab = 'recipes'
      body = <Recipes ctx={ctx} />
      break
    case 'recipe':
      body = b === 'edit' ? <RecipeEdit key={a} ctx={ctx} id={a} /> : <RecipeView ctx={ctx} id={a} />
      break
    case 'new-recipe':
      body = <RecipeEdit ctx={ctx} />
      break
    case 'list':
      tab = 'list'
      body = <List ctx={ctx} />
      break
    case 'money':
      tab = 'money'
      body = <Money ctx={ctx} />
      break
    case 'settings':
      body = <Settings ctx={ctx} onMe={setMeState} />
      break
    default:
      tab = 'plan'
      body = <Plan ctx={ctx} />
  }
  return (
    <div className="app">
      {error && <div className="error-bar">{error}</div>}
      {body}
      {tab && <Nav tab={tab} />}
      {toast && (
        <div className="toast" role="status" style={tab ? undefined : { bottom: 'calc(var(--safe-b) + 14px)' }}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              onClick={() => {
                const prev = toast.undo!
                dispatch((cur) => ({ ...prev, version: cur.version }))
                setToast(null)
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (supabase && session === undefined) return null
  if (supabase && !session) return <Login />
  return <Main />
}
