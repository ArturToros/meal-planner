// Reads receipts, recipe screenshots and recipe links with Claude, and suggests weekly ideas.
// The Anthropic key lives in the project's Edge Function secrets as ANTHROPIC_API_KEY.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const ingredient = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Ingredient name in English, lowercase, without the amount, e.g. "chicken breast"' },
    qty: { type: ['number', 'null'], description: 'Amount as a number, or null when the recipe gives none (salt, pepper, oil)' },
    unit: { type: 'string', enum: ['', 'g', 'kg', 'ml', 'l', 'tbsp', 'tsp', 'cup', 'pcs', 'pack', 'can', 'clove', 'bunch', 'slice'] },
  },
  required: ['name', 'qty', 'unit'],
  additionalProperties: false,
}

const recipe = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    minutes: { type: 'integer', description: 'Total time from start to eating' },
    portions: { type: 'integer' },
    ingredients: { type: 'array', items: ingredient },
    steps: { type: 'string', description: 'Short numbered steps, one per line' },
    boxable: { type: 'boolean', description: 'True if it reheats well in a lunch box in an office microwave (not soups, not salads that wilt, not fried crispy food)' },
  },
  required: ['name', 'minutes', 'portions', 'ingredients', 'steps', 'boxable'],
  additionalProperties: false,
}

const SCHEMAS: Record<string, Record<string, unknown>> = {
  receipt: {
    type: 'object',
    properties: {
      store: { type: 'string', description: 'Store name, e.g. Lidl, Kaufland, Billa, or the restaurant / delivery service' },
      date: { type: 'string', description: 'Purchase date as YYYY-MM-DD, or "" if not visible' },
      total: { type: 'number', description: 'Total paid, in euros' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Item name exactly as printed' },
            english: { type: 'string', description: 'Short plain English name, e.g. "chicken breast", "toilet paper"' },
            amount: { type: 'number', description: 'Line total in euros after any discount on that line' },
            food: { type: 'boolean', description: 'False for household, hygiene, cleaning and other non-food items' },
          },
          required: ['name', 'english', 'amount', 'food'],
          additionalProperties: false,
        },
      },
    },
    required: ['store', 'date', 'total', 'items'],
    additionalProperties: false,
  },
  recipe: { ...recipe, properties: { ...recipe.properties, readable: { type: 'boolean', description: 'False if there is no recipe in what you were given' } }, required: [...recipe.required, 'readable'] },
  ideas: { type: 'object', properties: { ideas: { type: 'array', items: recipe } }, required: ['ideas'], additionalProperties: false },
}

const HOUSEHOLD = `The household: Artur, his wife Svetlozara and his sister Evelina, in Sofia, Bulgaria. They shop at Lidl and pay in euros.
Svetlozara likes mild seasoning: a little basil, onion, red and black pepper and salt, never too much. She is lactose intolerant, so prefer little dairy.
Cooked or blended tomatoes, peppers and mushrooms are fine; raw chunks are not loved.
Wednesday to Friday they take lunch boxes to the office and reheat them in a microwave. They want to eat a bit healthier and cheaper and order less takeaway.`

function prompt(kind: string, context: unknown): string {
  if (kind === 'receipt') {
    return `Read this receipt. It is probably Bulgarian, from a supermarket, a restaurant or a delivery app. Amounts are in euros (if only leva are shown, divide by 1.95583).
Include every purchased line; skip deposit returns, subtotals and payment lines. Apply line discounts to the line they belong to.
${context ? `Names on their shopping list, use these exact words for "english" when an item matches one: ${JSON.stringify((context as { listNames?: string[] }).listNames ?? [])}` : ''}`
  }
  if (kind === 'recipe') {
    return `Turn this into a recipe for a home cook app. Write everything in English (translate from Bulgarian or any other language).
Keep the original recipe; do not adapt it. Use metric amounts. Keep steps short. If no portions are given, estimate them. If there is no recipe here, set readable to false.`
  }
  const c = (context ?? {}) as { have?: string[]; recent?: string[] }
  return `${HOUSEHOLD}

Suggest exactly 2 new dinner recipes for this week that they do not already have. Each should cook in under 45 minutes from ingredients easy to find at Lidl in Bulgaria, make 4 to 6 portions so it can feed tomorrow's lunch too, and be good reheated in a lunch box.
Make the two different from each other (for example one chicken or fish, one beef, pork or vegetarian). Familiar, not fancy.
Recipes they already have: ${JSON.stringify(c.have ?? [])}
Cooked recently: ${JSON.stringify(c.recent ?? [])}`
}

/** Pull the recipe out of a web page: structured data when present, otherwise the visible text. */
async function pageText(url: string): Promise<string> {
  const u = new URL(url)
  if (!/^https?:$/.test(u.protocol)) throw new Error('That does not look like a web link.')
  const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'Accept-Language': 'en,bg;q=0.8' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`That page did not open (${res.status}). Try a screenshot instead.`)
  const html = (await res.text()).slice(0, 2_000_000)
  const ld = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((s) => /Recipe/.test(s))
  if (ld.length) return `Structured recipe data from ${url}:\n${ld.join('\n').slice(0, 60_000)}`
  const text = html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|li|h\d|div|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
  if (text.length < 200) throw new Error('That page has no readable recipe (Instagram and TikTok hide theirs). Try a screenshot instead.')
  return `Text of the page ${url}:\n${text.slice(0, 60_000)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth } = await admin.auth.getUser(token)
    if (!auth?.user) return json({ error: 'Please sign in again.' }, 401)

    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'Reading is not set up yet: the Anthropic key is missing in Supabase.' }, 500)

    const { kind, images, url, text, context } = (await req.json()) as { kind: string; images?: string[]; url?: string; text?: string; context?: unknown }
    if (!SCHEMAS[kind]) return json({ error: 'Unknown request.' }, 400)

    const content: Anthropic.Beta.BetaContentBlockParam[] = []
    for (const data of (images ?? []).slice(0, 6)) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })
    if (url) content.push({ type: 'text', text: await pageText(url) })
    if (text) content.push({ type: 'text', text })
    content.push({ type: 'text', text: prompt(kind, context) })

    const client = new Anthropic({ apiKey: key })
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: kind === 'ideas' ? 'low' : 'medium', format: { type: 'json_schema', schema: SCHEMAS[kind] } },
      messages: [{ role: 'user', content }],
    })

    if (msg.stop_reason === 'refusal') return json({ error: 'Claude could not read this one. Try another photo.' }, 422)
    if (msg.stop_reason === 'max_tokens') return json({ error: 'That was too long to read in one go. Try fewer photos.' }, 422)
    const out = msg.content.find((b) => b.type === 'text')
    if (!out || out.type !== 'text') return json({ error: 'Nothing came back. Try again.' }, 502)
    const result = JSON.parse(out.text)
    if (kind === 'recipe' && result.readable === false) return json({ error: 'No recipe found there. Try a clearer screenshot.' }, 422)
    return json(result)
  } catch (e) {
    console.error(e)
    const status = (e as { status?: number }).status
    if (status === 401) return json({ error: 'The Anthropic key in Supabase is not valid.' }, 500)
    if (status === 400 && /credit/i.test(String((e as Error).message))) return json({ error: 'The Anthropic account is out of credit.' }, 500)
    return json({ error: (e as Error).message || 'Reading failed. Try again.' }, 500)
  }
})
