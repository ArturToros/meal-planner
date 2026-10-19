import type { Ingredient, Recipe, Slot } from './types'

/** Each phone picks its own language; the shared data stays the same for everyone. */
export type Lang = 'en' | 'bg'

const KEY = 'meal-planner-lang'

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'bg') return saved
  } catch {
    /* private mode */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('bg') ? 'bg' : 'en'
}

let lang: Lang = initial()

export function getLang(): Lang {
  return lang
}

export function setLang(l: Lang) {
  lang = l
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* private mode: lasts until the app closes */
  }
  document.documentElement.lang = l
}

/** The same text in both languages, side by side where it's used. */
export function L(en: string, bg: string): string {
  return lang === 'bg' ? bg : en
}

/** Count + noun: plural(3, 'box', 'boxes', 'кутия', 'кутии') → "3 boxes". */
export function plural(n: number, en1: string, enN: string, bg1: string, bgN: string): string {
  return `${n} ${n === 1 ? L(en1, bg1) : L(enN, bgN)}`
}

const DAYS = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  bg: ['неделя', 'понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота'],
}
const SHORT = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  bg: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
}
const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  bg: ['яну', 'фев', 'мар', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'],
}

/** Weekday by number (0 = Sunday), full name; Bulgarian ones are lowercase as in a sentence. */
export const dayWord = (wd: number) => DAYS[lang][wd]
export const shortDayWord = (wd: number) => SHORT[lang][wd]
export const monthWord = (m: number) => MONTHS[lang][m]
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const slotWord = (s: Slot) => (s === 'lunch' ? L('lunch', 'обяд') : L('dinner', 'вечеря'))

const UNITS_BG: Record<string, string> = {
  g: 'г',
  kg: 'кг',
  ml: 'мл',
  l: 'л',
  tbsp: 'с.л.',
  tsp: 'ч.л.',
  cup: 'ч.ч.',
  cups: 'ч.ч.',
  pcs: 'бр.',
  pc: 'бр.',
  pack: 'пакет',
  packs: 'пакета',
  can: 'консерва',
  cans: 'консерви',
  clove: 'скилидка',
  cloves: 'скилидки',
  bunch: 'връзка',
  slice: 'филия',
  slices: 'филии',
}

export const unitWord = (u: string) => (lang === 'bg' ? (UNITS_BG[u] ?? u) : u)

export const recipeName = (r: Pick<Recipe, 'name' | 'nameBg'>) => (lang === 'bg' && r.nameBg ? r.nameBg : r.name)
export const recipeSteps = (r: Pick<Recipe, 'steps' | 'stepsBg'>) => (lang === 'bg' && r.stepsBg ? r.stepsBg : r.steps)
export const ingredientName = (i: Pick<Ingredient, 'name' | 'bg'>) => (lang === 'bg' && i.bg ? i.bg : i.name)

/** Bulgarian for common shopping words, for list items that come from no recipe (staples, extras). */
const WORDS_BG: Record<string, string> = {
  salt: 'сол',
  pepper: 'пипер',
  'black pepper': 'черен пипер',
  'olive oil': 'зехтин',
  'sunflower oil': 'олио',
  basil: 'босилек',
  paprika: 'червен пипер',
  rice: 'ориз',
  pasta: 'паста',
  flour: 'брашно',
  sugar: 'захар',
  'stock cubes': 'бульонни кубчета',
  'bay leaf': 'дафинов лист',
  savory: 'чубрица',
  'baking soda': 'сода бикарбонат',
  oats: 'овесени ядки',
  milk: 'прясно мляко',
  yoghurt: 'кисело мляко',
  muesli: 'мюсли',
  cereal: 'зърнена закуска',
  eggs: 'яйца',
  bread: 'хляб',
  'lactose-free': 'без лактоза',
  artur: 'Артур',
  svetlozara: 'Светлозара',
  evelina: 'Евелина',
}

export function word(en: string): string {
  if (lang !== 'bg') return en
  const k = en.toLowerCase()
  if (WORDS_BG[k]) return WORDS_BG[k]
  const m = k.match(/^(.*), lactose-free$/)
  if (m) return `${word(m[1])}, ${WORDS_BG['lactose-free']}`
  return en
}
