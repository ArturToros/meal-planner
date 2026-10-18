// The evening "tomorrow" notification. Called hourly by pg_cron; sends at the household's reminder hour, Sofia time.
// Also hands out the push key and stores each phone's subscription.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

type Person = 'A' | 'S' | 'E'
type Slot = 'lunch' | 'dinner'
interface Meal { date: string; slot: Slot; eaters: Person[]; guests?: number; kind: string; cookId?: string; freezerId?: string; label?: string }
interface Household {
  recipes: { id: string; name: string }[]
  cooks: { id: string; recipeId: string; date: string; slot: Slot; status: string }[]
  meals: Meal[]
  freezer: { id: string; recipeId: string }[]
  settings: { names: Record<Person, string>; reminderHour: number; officeDays: number[]; officePeople: Person[] }
}

async function config(key: string): Promise<string | null> {
  const { data } = await db.from('app_config').select('value').eq('key', key).maybeSingle()
  return data?.value ?? null
}
const setConfig = (key: string, value: string) => db.from('app_config').upsert({ key, value })

async function vapid() {
  let pub = await config('vapid_public')
  let priv = await config('vapid_private')
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys()
    // Only the first writer wins, so two phones turning reminders on at once still share one key.
    await db.from('app_config').upsert([{ key: 'vapid_public', value: k.publicKey }, { key: 'vapid_private', value: k.privateKey }], { onConflict: 'key', ignoreDuplicates: true })
    pub = await config('vapid_public')
    priv = await config('vapid_private')
  }
  webpush.setVapidDetails('https://arturtoros.github.io/meal-planner/', pub!, priv!)
  return pub!
}

/** Date in Sofia, as YYYY-MM-DD, `days` from now, plus the current Sofia hour. */
function sofia(days = 0) {
  const d = new Date(Date.now() + days * 864e5)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }
}

function name(h: Household, m: Meal): string {
  const recipe = (id?: string) => h.recipes.find((r) => r.id === id)?.name
  if (m.kind === 'cook' || m.kind === 'leftover') return recipe(h.cooks.find((c) => c.id === m.cookId)?.recipeId) ?? 'a meal'
  if (m.kind === 'freezer') return recipe(h.freezer.find((f) => f.id === m.freezerId)?.recipeId) ?? 'something from the freezer'
  if (m.kind === 'order') return 'ordering in'
  if (m.kind === 'out') return 'eating out'
  return m.label ?? 'something quick'
}

/** What tomorrow looks like for one person, in a line or two. */
function message(h: Household, who: Person, tomorrow: string) {
  const weekday = new Date(tomorrow + 'T12:00:00Z').getUTCDay()
  const dayName = new Date(tomorrow + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
  const mine = h.meals.filter((m) => m.date === tomorrow && m.eaters.includes(who))
  if (!h.meals.some((m) => m.date === tomorrow)) return { title: dayName, body: 'Open the app to see tomorrow’s meals.' }
  if (!mine.length) return { title: dayName, body: 'No meals at home for you tomorrow.' }
  const parts: string[] = []
  const notes: string[] = []
  for (const slot of ['lunch', 'dinner'] as Slot[]) {
    const m = mine.find((x) => x.slot === slot)
    if (!m) continue
    const office = slot === 'lunch' && h.settings.officeDays.includes(weekday) && h.settings.officePeople.includes(who)
    let line = `${slot === 'lunch' ? 'Lunch' : 'Dinner'}: ${name(h, m)}`
    if (m.kind === 'leftover') line += office ? ' (pack a box tonight)' : ' (leftover)'
    else if (m.kind === 'cook') line += ', cooking'
    else if (office && m.kind !== 'out') line += ' at the office'
    parts.push(line)
    if (m.kind === 'freezer') notes.push(`Take ${name(h, m)} out of the freezer tonight.`)
  }
  if (mine.some((m) => m.kind === 'cook')) notes.push('Check the shopping list.')
  return { title: dayName, body: [parts.join('. ') + '.', ...notes].join(' ') }
}

async function send(h: Household, tomorrow: string, only?: Person) {
  await vapid()
  let q = db.from('push_subs').select('endpoint, person, sub')
  if (only) q = q.eq('person', only)
  const { data: subs } = await q
  let sent = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(s.sub, JSON.stringify(message(h, s.person as Person, tomorrow)), { TTL: 6 * 3600 })
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await db.from('push_subs').delete().eq('endpoint', s.endpoint)
      else console.error('push failed', code, (e as Error).message)
    }
  }
  return sent
}

async function household(): Promise<Household | null> {
  const { data } = await db.from('household').select('data').eq('id', 1).maybeSingle()
  return (data?.data as Household) ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json().catch(() => ({}))

    if (body.action === 'cron') {
      const secret = await config('cron_secret')
      if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Not allowed' }, 401)
      const h = await household()
      const now = sofia()
      if (!h || now.hour !== (h.settings.reminderHour ?? 20)) return json({ skipped: true })
      if ((await config('last_remind')) === now.date) return json({ skipped: 'already sent' })
      await setConfig('last_remind', now.date)
      return json({ sent: await send(h, sofia(1).date) })
    }

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth } = await db.auth.getUser(token)
    if (!auth?.user) return json({ error: 'Please sign in again.' }, 401)

    if (body.action === 'key') return json({ publicKey: await vapid() })
    if (body.action === 'subscribe') {
      const { error } = await db.from('push_subs').upsert({ endpoint: body.subscription.endpoint, person: body.person, sub: body.subscription })
      if (error) throw error
      return json({ ok: true })
    }
    if (body.action === 'unsubscribe') {
      await db.from('push_subs').delete().eq('endpoint', body.endpoint)
      return json({ ok: true })
    }
    if (body.action === 'test') {
      const h = await household()
      if (!h) return json({ error: 'No plan yet.' }, 404)
      return json({ sent: await send(h, sofia(1).date, body.person) })
    }
    return json({ error: 'Unknown request.' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message }, 500)
  }
})
