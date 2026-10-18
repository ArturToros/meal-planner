import type { Aisle, Ingredient } from './types'

const AISLE_WORDS: [Aisle, string[]][] = [
  ['meat', ['chicken', 'beef', 'pork', 'mince', 'bacon', 'salmon', 'fish', 'turkey', 'ham', 'sausage', 'tuna', 'shrimp', 'prawn', 'lamb']],
  ['fridge', ['milk', 'cream', 'cheese', 'yoghurt', 'yogurt', 'butter', 'egg', 'skyr', 'feta', 'mozzarella', 'parmesan', 'pesto', 'tofu', 'sirene', 'kashkaval']],
  ['freezer', ['frozen', 'edamame', 'peas']],
  ['bakery', ['bread', 'toast', 'tortilla', 'wrap', 'bun', 'baguette', 'pita']],
  ['veg', ['onion', 'garlic', 'carrot', 'potato', 'pumpkin', 'squash', 'leek', 'cucumber', 'avocado', 'lettuce', 'salad', 'spinach', 'broccoli', 'zucchini', 'courgette', 'aubergine', 'eggplant', 'celery', 'lemon', 'lime', 'apple', 'banana', 'basil', 'parsley', 'dill', 'herb', 'ginger', 'cabbage', 'corn', 'bean sprout', 'mango', 'berries', 'fruit']],
  ['dry', ['rice', 'pasta', 'spaghetti', 'penne', 'noodle', 'flour', 'oat', 'muesli', 'cereal', 'sugar', 'oil', 'vinegar', 'soy', 'stock', 'tomato paste', 'passata', 'tin', 'can', 'lentil', 'chickpea', 'bean', 'salt', 'pepper', 'paprika', 'spice', 'honey', 'sesame', 'nuts', 'coffee', 'tea']],
]

const LACTOSE = ['milk', 'cream', 'cheese', 'yoghurt', 'yogurt', 'butter', 'skyr', 'feta', 'mozzarella', 'parmesan', 'bechamel', 'sirene', 'kashkaval']

export function guessAisle(name: string): Aisle {
  const n = name.toLowerCase()
  if (/stock|sauce|paste|cube|seasoning/.test(n)) return 'dry'
  for (const [aisle, words] of AISLE_WORDS) if (words.some((w) => n.includes(w))) return aisle
  return 'other'
}

export function guessLactose(name: string): boolean {
  const n = name.toLowerCase()
  if (n.includes('lactose-free') || n.includes('coconut')) return false
  return LACTOSE.some((w) => n.includes(w))
}

const UNITS = ['kg', 'g', 'ml', 'l', 'tbsp', 'tsp', 'cup', 'cups', 'pcs', 'pc', 'pack', 'packs', 'can', 'cans', 'clove', 'cloves', 'bunch', 'slice', 'slices']

/** "1 kg chicken breast" → qty 1, unit kg, name chicken breast. */
export function parseIngredient(line: string): Ingredient | undefined {
  const text = line.trim().replace(/^[-•*]\s*/, '')
  if (!text) return undefined
  const m = text.match(/^(\d+(?:[.,]\d+)?|\d+\/\d+|½|¼)\s*([a-zA-Z]+)?\.?\s+(.*)$/)
  let qty: number | undefined
  let unit: string | undefined
  let name = text
  if (m) {
    const raw = m[1].replace(',', '.')
    qty = raw === '½' ? 0.5 : raw === '¼' ? 0.25 : raw.includes('/') ? Number(raw.split('/')[0]) / Number(raw.split('/')[1]) : Number(raw)
    if (m[2] && UNITS.includes(m[2].toLowerCase())) {
      unit = m[2].toLowerCase()
      name = m[3]
    } else {
      name = [m[2], m[3]].filter(Boolean).join(' ')
    }
  }
  name = name.trim()
  return { name, qty, unit, aisle: guessAisle(name), lactose: guessLactose(name) || undefined }
}

export function formatIngredient(i: Ingredient, scale = 1): string {
  return [formatQty(i, scale), i.name].filter(Boolean).join(' ')
}

export function formatQty(i: { qty?: number; unit?: string }, scale = 1): string {
  if (i.qty == null) return ''
  let q = i.qty * scale
  let unit = i.unit ?? ''
  if (unit === 'g' && q >= 1000) {
    q /= 1000
    unit = 'kg'
  }
  if (unit === 'ml' && q >= 1000) {
    q /= 1000
    unit = 'l'
  }
  const n = q >= 10 ? Math.round(q) : Math.round(q * 10) / 10
  return unit ? `${n} ${unit}` : String(n)
}

export function ingredientsToText(list: Ingredient[]): string {
  return list.map((i) => formatIngredient(i)).join('\n')
}
