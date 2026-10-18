export type Person = 'A' | 'S' | 'E'
export const PEOPLE: Person[] = ['A', 'S', 'E']

export type Slot = 'lunch' | 'dinner'

export type Aisle = 'veg' | 'bakery' | 'dry' | 'fridge' | 'meat' | 'freezer' | 'other'

export interface Ingredient {
  name: string
  qty?: number
  unit?: string
  aisle: Aisle
  lactose?: boolean
}

export interface Recipe {
  id: string
  name: string
  minutes: number
  portions: number
  ingredients: Ingredient[]
  steps: string
  eaters: Person[]
  boxable: boolean
  photo?: string
  sourceUrl?: string
  isIdea?: boolean
  ideaWeek?: string
  never?: boolean
  swapCount?: number
  starter?: boolean
  createdAt: string
}

/** One batch of a recipe being cooked. Its portions feed the meal it is cooked for and any leftover meals. */
export interface Cook {
  id: string
  recipeId: string
  date: string
  slot: Slot
  portions: number
  status: 'planned' | 'cooked' | 'skipped'
  confirmed?: boolean
}

export type MealKind = 'cook' | 'leftover' | 'freezer' | 'simple' | 'order' | 'out'

export interface Meal {
  id: string
  date: string
  slot: Slot
  eaters: Person[]
  guests?: number
  kind: MealKind
  cookId?: string
  freezerId?: string
  label?: string
  /** Chosen by a person, so the planner never replaces it on its own. */
  pinned?: boolean
}

export interface FreezerItem {
  id: string
  recipeId: string
  portions: number
  frozenAt: string
}

export interface Bought {
  name: string
  at: string
  cookIds: string[]
}

export interface ExtraItem {
  id: string
  name: string
  addedAt: string
}

export type SpendKind = 'grocery' | 'takeaway' | 'lunch' | 'nonfood'

export interface SpendEntry {
  id: string
  date: string
  kind: SpendKind
  amount: number
  store?: string
  note?: string
  items?: { name: string; amount: number; food: boolean }[]
  receiptKey?: string
  by?: Person
}

export interface LogEntry {
  at: string
  by: Person
  text: string
}

export interface Settings {
  names: Record<Person, string>
  /** How many meals after cooking each person still eats leftovers (Sunday dinner to Tuesday lunch = 3). */
  freshness: Record<Person, number>
  /** pattern[person][slot] = weekdays (0 = Sunday) they usually eat at home. */
  pattern: Record<Person, Record<Slot, number[]>>
  /** Weekdays whose lunch is eaten at the office, for these people. */
  officeDays: number[]
  officePeople: Person[]
  staples: string[]
  breakfast: string[]
  runningOut: string[]
  quickMeals: string[]
  reminderHour: number
}

export interface Household {
  version: number
  recipes: Recipe[]
  cooks: Cook[]
  meals: Meal[]
  freezer: FreezerItem[]
  bought: Bought[]
  extras: ExtraItem[]
  spending: SpendEntry[]
  log: LogEntry[]
  settings: Settings
  /** Who eats at a given meal, when it differs from the usual pattern. Keyed by slotKey. */
  who: Record<string, Person[]>
  eveningOk?: string
  ideasWeek?: string
  /** Week whose ideas were picked by Claude for this household. */
  ideasFrom?: string
}
