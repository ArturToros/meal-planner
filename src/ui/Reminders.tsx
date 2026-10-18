import { useEffect, useState } from 'react'
import { supabase } from '../lib/backend'
import type { AppCtx } from './common'

type State = 'checking' | 'offline' | 'install' | 'unsupported' | 'off' | 'on' | 'denied'

function b64ToBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

/** The 20:00 "tomorrow's plan" notification. iPhones only allow it once the app is on the home screen. */
export function Reminders({ ctx }: { ctx: AppCtx }) {
  const [state, setState] = useState<State>('checking')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      if (!supabase) return setState('offline')
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return setState(standalone() ? 'unsupported' : 'install')
      if (Notification.permission === 'denied') return setState('denied')
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setState(sub ? 'on' : 'off')
    })().catch(() => setState('unsupported'))
  }, [])

  const turnOn = async () => {
    setBusy(true)
    setErr(null)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return setState(perm === 'denied' ? 'denied' : 'off')
      const { data, error } = await supabase!.functions.invoke('remind', { body: { action: 'key' } })
      if (error || !data?.publicKey) throw new Error(error?.message ?? 'No key')
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.publicKey) as BufferSource })
      const { error: e2 } = await supabase!.functions.invoke('remind', { body: { action: 'subscribe', subscription: sub.toJSON(), person: ctx.me } })
      if (e2) throw e2
      setState('on')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await supabase!.functions.invoke('remind', { body: { action: 'unsubscribe', endpoint: sub.endpoint } })
        await sub.unsubscribe()
      }
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    setErr(null)
    try {
      const { data, error } = await supabase!.functions.invoke('remind', { body: { action: 'test', person: ctx.me } })
      if (error) throw error
      if (!data?.sent) setErr('Nothing was sent. Turn reminders off and on again.')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const hour = ctx.h.settings.reminderHour
  return (
    <div className="field">
      <span>Evening reminder</span>
      {state === 'offline' && <p className="muted" style={{ margin: 0 }}>Works once the app is online.</p>}
      {state === 'install' && (
        <p style={{ margin: 0 }}>
          First add the app to your home screen: in Safari tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. Open it from there and come back here.
        </p>
      )}
      {state === 'unsupported' && <p className="muted" style={{ margin: 0 }}>This phone doesn't support notifications from web apps.</p>}
      {state === 'denied' && <p className="muted" style={{ margin: 0 }}>Notifications are blocked for this app in the phone's settings.</p>}
      {state === 'off' && (
        <button className="btn yellow" onClick={turnOn} disabled={busy}>
          {busy ? <span className="spinner" /> : `Remind me at ${hour}:00 about tomorrow`}
        </button>
      )}
      {state === 'on' && (
        <div className="row-flex" style={{ justifyContent: 'space-between' }}>
          <span>On, every day at {hour}:00.</span>
          <span className="row-flex">
            <button className="btn small ghost" onClick={test} disabled={busy}>
              Test
            </button>
            <button className="btn small ghost" onClick={turnOff} disabled={busy}>
              Turn off
            </button>
          </span>
        </div>
      )}
      {err && <p style={{ margin: 0, color: 'var(--danger)' }}>{err}</p>}
    </div>
  )
}
