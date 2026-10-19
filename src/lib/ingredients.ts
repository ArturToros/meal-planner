import type { Aisle, Ingredient } from './types'

const AISLE_WORDS: [Aisle, string[]][] = [
  ['meat', ['пиле', 'пилешк', 'телешк', 'свинск', 'кайма', 'бекон', 'сьомга', 'риба', 'пуешк', 'шунка', 'наденица', 'кренвирш', 'луканка', 'тон', 'скариди', 'агнешк', 'chicken', 'beef', 'pork', 'mince', 'bacon', 'salmon', 'fish', 'turkey', 'ham', 'sausage', 'tuna', 'shrimp', 'prawn', 'lamb']],
  ['fridge', ['мляко', 'сметана', 'сирене', 'кашкавал', 'масло', 'яйц', 'жълтък', 'скир', 'моцарела', 'пармезан', 'песто', 'извара', 'milk', 'cream', 'cheese', 'yoghurt', 'yogurt', 'butter', 'egg', 'skyr', 'feta', 'mozzarella', 'parmesan', 'pesto', 'tofu', 'sirene', 'kashkaval']],
  ['freezer', ['замразен', 'грах', 'frozen', 'edamame', 'peas']],
  ['bakery', ['хляб', 'питка', 'тортил', 'кифл', 'bread', 'toast', 'tortilla', 'wrap', 'bun', 'baguette', 'pita']],
  ['veg', ['лук', 'чесън', 'морков', 'картоф', 'тиква', 'праз', 'краставиц', 'авокадо', 'маруля', 'салата', 'спанак', 'броколи', 'тиквичк', 'патладжан', 'целина', 'лимон', 'лайм', 'ябълк', 'банан', 'босилек', 'магданоз', 'копър', 'джинджифил', 'зеле', 'царевица', 'домат', 'чушк', 'гъби', 'плод', 'onion', 'garlic', 'carrot', 'potato', 'pumpkin', 'squash', 'leek', 'cucumber', 'avocado', 'lettuce', 'salad', 'spinach', 'broccoli', 'zucchini', 'courgette', 'aubergine', 'eggplant', 'celery', 'lemon', 'lime', 'apple', 'banana', 'basil', 'parsley', 'dill', 'herb', 'ginger', 'cabbage', 'corn', 'bean sprout', 'mango', 'berries', 'fruit']],
  ['dry', ['ориз', 'паста', 'спагети', 'макарон', 'фиде', 'брашно', 'овесен', 'захар', 'олио', 'зехтин', 'оцет', 'соев', 'бульон', 'консерв', 'леща', 'нахут', 'боб', 'сол', 'пипер', 'подправ', 'мед', 'сусам', 'ядки', 'кафе', 'чай', 'rice', 'pasta', 'spaghetti', 'penne', 'noodle', 'flour', 'oat', 'muesli', 'cereal', 'sugar', 'oil', 'vinegar', 'soy', 'stock', 'tomato paste', 'passata', 'tin', 'can', 'lentil', 'chickpea', 'bean', 'salt', 'pepper', 'paprika', 'spice', 'honey', 'sesame', 'nuts', 'coffee', 'tea']],
]

const LACTOSE = ['мляко', 'сметана', 'сирене', 'кашкавал', 'масло', 'скир', 'моцарела', 'пармезан', 'извара', 'бешамел', 'milk', 'cream', 'cheese', 'yoghurt', 'yogurt', 'butter', 'skyr', 'feta', 'mozzarella', 'parmesan', 'bechamel', 'sirene', 'kashkaval']

export function guessAisle(name: string): Aisle {
  const n = name.toLowerCase()
  if (/stock|sauce|paste|cube|seasoning|бульон|сос|паста от|кубче|подправка/.test(n)) return 'dry'
  for (const [aisle, words] of AISLE_WORDS) if (words.some((w) => n.includes(w))) return aisle
  return 'other'
}

export function guessLactose(name: string): boolean {
  const n = name.toLowerCase()
  if (n.includes('lactose-free') || n.includes('без лактоза') || n.includes('coconut') || n.includes('кокос') || n.includes('растително')) return false
  return LACTOSE.some((w) => n.includes(w))
}

/** Bulgarian units as written on recipe cards, mapped to the ones the app counts in. */
const UNITS_BG: Record<string, string> = { г: 'g', гр: 'g', кг: 'kg', мл: 'ml', л: 'l', 'с.л': 'tbsp', сл: 'tbsp', 'ч.л': 'tsp', чл: 'tsp', 'ч.ч': 'cup', чаша: 'cup', чаши: 'cup', бр: 'pcs', пакет: 'pack', пакета: 'pack', консерва: 'can', консерви: 'can', скилидка: 'clove', скилидки: 'clove', връзка: 'bunch', филия: 'slice', филии: 'slice' }

const UNITS = ['kg', 'g', 'ml', 'l', 'tbsp', 'tsp', 'cup', 'cups', 'pcs', 'pc', 'pack', 'packs', 'can', 'cans', 'clove', 'cloves', 'bunch', 'slice', 'slices']

/** "1 kg chicken breast" → qty 1, unit kg, name chicken breast. */
export function parseIngredient(line: string): Ingredient | undefined {
  const text = line.trim().replace(/^[-•*]\s*/, '')
  if (!text) return undefined
  const m = text.match(/^(\d+(?:[.,]\d+)?|\d+\/\d+|½|¼)\s*([a-zA-Zа-яА-Я]+(?:\.\s?[а-я]+)?)?\.?\s+(.*)$/)
  let qty: number | undefined
  let unit: string | undefined
  let name = text
  if (m) {
    const raw = m[1].replace(',', '.')
    qty = raw === '½' ? 0.5 : raw === '¼' ? 0.25 : raw.includes('/') ? Number(raw.split('/')[0]) / Number(raw.split('/')[1]) : Number(raw)
    const u = m[2]?.toLowerCase().replace(/\s/g, '')
    if (u && (UNITS.includes(u) || UNITS_BG[u])) {
      unit = UNITS_BG[u] ?? u
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
