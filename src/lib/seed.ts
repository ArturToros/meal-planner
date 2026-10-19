import type { Household, Person, Recipe, Settings } from './types'
import { parseIngredient } from './ingredients'

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

export function defaultSettings(): Settings {
  return {
    names: { A: 'Artur', S: 'Svetlozara', E: 'Evelina' },
    freshness: { A: 8, S: 3, E: 5 },
    pattern: {
      A: { lunch: ALL_DAYS, dinner: ALL_DAYS },
      S: { lunch: ALL_DAYS, dinner: ALL_DAYS },
      E: { lunch: [0, 6], dinner: ALL_DAYS },
    },
    officeDays: [3, 4, 5],
    officePeople: ['A', 'S'],
    staples: ['salt', 'pepper', 'black pepper', 'olive oil', 'sunflower oil', 'basil', 'paprika', 'rice', 'pasta', 'flour', 'sugar', 'stock cubes', 'bay leaf', 'savory', 'baking soda'],
    breakfast: ['oats', 'milk', 'yoghurt', 'muesli', 'cereal', 'eggs'],
    runningOut: [],
    quickMeals: ['Sandwiches', 'Eggs & toast', 'Pasta with pesto'],
    reminderHour: 20,
  }
}

type Starter = [name: string, minutes: number, portions: number, eaters: Person[], boxable: boolean, ingredients: string[], steps: string]

const STARTERS: Starter[] = [
  ['Pumpkin cream soup', 40, 4, ['A', 'S', 'E'], false, ['1 pumpkin', '2 carrots', '1 onion', '200 ml cooking cream', '1 l vegetable stock', '1 bread'], 'Roast or boil pumpkin, carrot and onion in stock until soft. Blend, stir in cream, season lightly.'],
  ['Sweet potato & beef', 40, 3, ['A', 'S', 'E'], true, ['800 g sweet potatoes', '500 g beef mince', '1 onion', 'salad leaves'], 'Roast sweet potato wedges 30 minutes. Fry mince with onion, season lightly. Serve with salad.'],
  ['Salmon poke bowl', 25, 2, ['A', 'S', 'E'], true, ['2 salmon fillets', '250 g sushi rice', '1 cucumber', '2 avocado', '150 g edamame', 'soy sauce'], 'Cook rice. Pan-fry or bake salmon 12 minutes. Slice vegetables and assemble bowls.'],
  ['Chicken poke bowl', 25, 3, ['A', 'S', 'E'], true, ['500 g chicken breast', '300 g sushi rice', '1 cucumber', '2 avocado', '150 g edamame', 'soy sauce'], 'Cook rice. Grill chicken strips. Slice vegetables and assemble bowls.'],
  ['Potatoes with cream & bacon', 50, 2, ['A'], true, ['1 kg potatoes', '200 g bacon', '200 ml cooking cream', '1 onion'], 'Boil potato slices 10 minutes. Fry bacon and onion, layer with potatoes and cream, bake 25 minutes.'],
  ['Pesto pasta with chicken', 20, 4, ['A', 'S', 'E'], true, ['500 g penne', '400 g chicken breast', '190 g pesto', 'parmesan'], 'Cook pasta. Fry chicken strips. Mix with pesto and a splash of pasta water.'],
  ['Spaghetti bolognese', 45, 5, ['A', 'S', 'E'], true, ['500 g spaghetti', '500 g beef mince', '1 onion', '2 carrots', '700 g passata'], 'Fry onion, carrot and mince. Add passata, simmer 30 minutes. Serve over spaghetti.'],
  ['Carbonara', 20, 3, ['A', 'S', 'E'], true, ['400 g spaghetti', '200 g bacon', '3 eggs', '80 g parmesan'], 'Cook pasta. Fry bacon. Off the heat, toss pasta with egg and cheese mix and the bacon.'],
  ['Chicken salad', 20, 2, ['A', 'S', 'E'], true, ['400 g chicken breast', 'salad leaves', '1 cucumber', '1 avocado', '1 lemon'], 'Grill chicken, slice. Toss with leaves, cucumber and avocado, dress with lemon and oil.'],
]

const IDEAS: Starter[] = [
  ['Chicken & leek pie', 50, 6, ['A', 'S', 'E'], true, ['700 g chicken breast', '2 leeks', '200 ml cooking cream', '1 pack puff pastry'], 'Fry chicken and leek, add cream. Pour into a dish, cover with pastry, bake 25 minutes.'],
  ['Turkey meatballs with rice', 35, 4, ['A', 'S', 'E'], true, ['600 g turkey mince', '1 egg', '300 g rice', '2 zucchini'], 'Mix mince with egg, roll and bake 18 minutes. Serve with rice and pan-fried zucchini.'],
  ['Baked salmon with potatoes', 35, 2, ['A', 'S', 'E'], true, ['2 salmon fillets', '600 g baby potatoes', '1 broccoli', '1 lemon'], 'Roast potatoes 15 minutes, add salmon and broccoli, roast 15 more. Finish with lemon.'],
  ['Chicken fajita bowls', 30, 4, ['A', 'S', 'E'], true, ['600 g chicken breast', '300 g rice', '1 can corn', '1 can black beans', '2 avocado', '1 lime'], 'Cook rice. Fry chicken strips. Warm corn and beans. Assemble bowls with avocado and lime.'],
  ['Creamy chicken orzo', 30, 4, ['A', 'S', 'E'], true, ['500 g chicken breast', '350 g orzo', '200 ml cooking cream', '100 g spinach', 'parmesan'], 'Brown chicken, add orzo and stock, simmer 12 minutes. Stir in cream, spinach and cheese.'],
  ['Beef & broccoli rice bowl', 30, 4, ['A', 'S', 'E'], true, ['500 g beef strips', '2 broccoli', '300 g rice', 'soy sauce', 'honey'], 'Cook rice. Stir-fry beef, add broccoli, soy and a little honey.'],
  ['Lentil & sweet potato soup', 40, 4, ['A', 'S', 'E'], false, ['250 g red lentils', '2 sweet potatoes', '1 onion', '2 carrots', '1.5 l vegetable stock'], 'Simmer everything 25 minutes until soft, then blend.'],
  ['Oven chicken thighs with vegetables', 50, 4, ['A', 'S', 'E'], true, ['1 kg chicken thighs', '800 g potatoes', '3 carrots', '1 onion'], 'Toss everything with oil and salt, roast 45 minutes at 200°C.'],
]

export function toRecipe(s: Starter, extra: Partial<Recipe> = {}): Recipe {
  const [name, minutes, portions, eaters, boxable, ingredients, steps] = s
  return withBg({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6),
    name,
    minutes,
    portions,
    eaters,
    boxable,
    ingredients: ingredients.flatMap((l) => (l.includes(',') && !/^\d/.test(l) ? l.split(',') : [l])).map((l) => parseIngredient(l)!).filter(Boolean),
    steps,
    starter: true,
    createdAt: new Date().toISOString(),
    ...extra,
  })
}

export function ideaPool(): Recipe[] {
  return IDEAS.map((s) => toRecipe(s, { isIdea: true, starter: false }))
}

/** The family's own recipes (from Svetlozara's recipe cards). */
const FAMILY: Starter[] = [
  ['Chicken with rice', 80, 3, ['A', 'S', 'E'], true, ['2 chicken drumsticks', '1 cup rice', '1 onion', '2 carrots', 'salt, black pepper, bay leaf'], '1. Boil the drumsticks with the carrot and onion peels, salt, black pepper and bay leaf for about 35 minutes.\n2. Take the drumsticks out and strain the stock. Pull the meat off the bones.\n3. Rinse the rice a little. Put it in a baking dish, then the chopped vegetables, and the meat on top. Pour over 3 cups (6-7 ladles) of the stock.\n4. Bake about 35 minutes at 200°C until the rice has soaked up the liquid.'],
  ['Pea stew', 35, 4, ['A', 'S', 'E'], true, ['1 onion', '2 carrots', '1 pack frozen peas', '4 potatoes', '150 ml tomato passata', 'sunflower oil, salt, black pepper, paprika'], '1. Finely chop the onion and carrots and fry them in a pot. Add the potatoes in pieces and stir. Sprinkle generously with paprika.\n2. Add the passata and some hot water if needed. Simmer 12-15 minutes.\n3. Add the peas and cook until done. Season and take off the heat.'],
  ['Chicken soup', 50, 4, ['A', 'S', 'E'], false, ['2 chicken drumsticks', '2 carrots', '1 onion', '500 g potatoes', '100 g celery', '100 g vermicelli', 'parsley', '2 egg yolks', '100 ml milk', '1 tbsp flour', 'salt, black pepper, paprika, savory, bay leaf'], '1. Salt the drumsticks and fry them 2 minutes on each side.\n2. Make the stock: simmer them in a pot of lightly salted water with the carrot and onion peels, bay leaf and black pepper.\n3. Chop the vegetables. Fry the onion, carrots and celery. Add the potatoes, pour in the stock, add the spices and simmer about 12 minutes.\n4. Take the meat off the bones and add it with the vermicelli.\n5. Whisk the yolks, milk and flour, then stir into the soup off the boil.'],
  ['Moussaka', 75, 4, ['A', 'S', 'E'], true, ['500 g minced meat', '500 g potatoes', '1 onion', '2 carrots', '250 ml tomato sauce', 'parsley', '300 g skyr', '4 eggs', '5 g baking soda', '1 tbsp flour', 'salt, black pepper, paprika, savory'], '1. Chop the vegetables. Heat oil and fry the onion and carrots. Add the mince and season.\n2. Add the diced potatoes for about 5 minutes. Add the tomato sauce and 1 cup of water, cook 5 more minutes.\n3. Pour into a baking dish and bake 40 minutes at 180°C.\n4. Whisk the skyr, eggs, soda and flour. Pour over and bake 15 more minutes at 200°C.'],
  ['Stew with sausage', 40, 4, ['A', 'S', 'E'], true, ['5 potatoes', '400 g nadenitsa sausage', '2 carrots', '1 onion', '200 ml tomato sauce', '2 tbsp sunflower oil', 'salt, black pepper, paprika, bay leaf'], '1. Chop everything. Heat the oil and fry the sausage 3-4 minutes, then take it out.\n2. Fry the onion and carrots with paprika. Add the potatoes and stir. Put the sausage back.\n3. Add the tomato sauce and 500-600 ml hot water or stock, enough to cover the potatoes. Season.\n4. When it boils, turn the heat down and simmer 20 minutes covered and 5 minutes uncovered.'],
]

export function emptyHousehold(): Household {
  return {
    version: 0,
    recipes: [...FAMILY.map((s) => toRecipe(s, { starter: false })), ...STARTERS.map((s) => toRecipe(s))],
    cooks: [],
    meals: [],
    freezer: [],
    bought: [],
    extras: [],
    spending: [],
    log: [],
    who: {},
    settings: defaultSettings(),
  }
}

const INGREDIENTS_BG: Record<string, string> = {
  avocado: 'авокадо', 'baby potatoes': 'пресни картофи', bacon: 'бекон', 'baking soda': 'сода бикарбонат', 'bay leaf': 'дафинов лист',
  'beef mince': 'телешка кайма', 'beef strips': 'телешко на ивици', 'black beans': 'черен боб', 'black pepper': 'черен пипер', bread: 'хляб',
  broccoli: 'броколи', carrots: 'моркови', celery: 'целина', 'chicken breast': 'пилешко филе', 'chicken drumsticks': 'пилешки бутчета',
  'chicken thighs': 'пилешки бутчета', 'cooking cream': 'сметана за готвене', corn: 'царевица', cucumber: 'краставица', edamame: 'едамаме',
  egg: 'яйце', 'egg yolks': 'жълтъка', eggs: 'яйца', flour: 'брашно', 'frozen peas': 'замразен грах', honey: 'мед', leeks: 'праз',
  lemon: 'лимон', lime: 'лайм', milk: 'прясно мляко', 'minced meat': 'кайма', 'nadenitsa sausage': 'наденица', onion: 'глава лук',
  orzo: 'орзо (паста ориз)', paprika: 'червен пипер', parmesan: 'пармезан', parsley: 'магданоз', passata: 'доматено пюре', penne: 'пене',
  pesto: 'песто', potatoes: 'картофи', 'puff pastry': 'бутер тесто', pumpkin: 'тиква', 'red lentils': 'червена леща', rice: 'ориз',
  'salad leaves': 'салата', 'salmon fillets': 'филе от сьомга', salt: 'сол', savory: 'чубрица', skyr: 'скир', 'soy sauce': 'соев сос',
  spaghetti: 'спагети', spinach: 'спанак', 'sunflower oil': 'олио', 'sushi rice': 'ориз за суши', 'sweet potatoes': 'сладки картофи',
  'tomato passata': 'доматено пюре', 'tomato sauce': 'доматен сос', 'turkey mince': 'пуешка кайма', 'vegetable stock': 'зеленчуков бульон',
  vermicelli: 'фиде', zucchini: 'тиквички',
}

const RECIPES_BG: Record<string, [name: string, steps: string]> = {
  'Pumpkin cream soup': ['Крем супа от тиква', 'Опечете или сварете тиквата, моркова и лука в бульона до омекване. Пасирайте, добавете сметаната и подправете леко.'],
  'Sweet potato & beef': ['Сладки картофи с телешко', 'Изпечете сладките картофи на резени 30 минути. Запържете каймата с лука и подправете леко. Сервирайте със салата.'],
  'Salmon poke bowl': ['Поке купа със сьомга', 'Сварете ориза. Изпечете или запържете сьомгата 12 минути. Нарежете зеленчуците и подредете купите.'],
  'Chicken poke bowl': ['Поке купа с пиле', 'Сварете ориза. Изпечете пилето на ивици. Нарежете зеленчуците и подредете купите.'],
  'Potatoes with cream & bacon': ['Картофи със сметана и бекон', 'Сварете картофите на кръгчета 10 минути. Запържете бекона и лука, наредете на пластове с картофите и сметаната и печете 25 минути.'],
  'Pesto pasta with chicken': ['Паста с песто и пиле', 'Сварете пастата. Запържете пилето на ивици. Смесете с песто и малко вода от пастата.'],
  'Spaghetti bolognese': ['Спагети болонезе', 'Запържете лука, моркова и каймата. Добавете доматеното пюре и оставете да къкри 30 минути. Сервирайте върху спагетите.'],
  Carbonara: ['Карбонара', 'Сварете пастата. Запържете бекона. Извън котлона разбъркайте пастата с яйцата и сиренето и добавете бекона.'],
  'Chicken salad': ['Салата с пиле', 'Изпечете пилето и го нарежете. Смесете със салатата, краставицата и авокадото и полейте с лимон и олио.'],
  'Chicken & leek pie': ['Пай с пиле и праз', 'Запържете пилето и праза, добавете сметаната. Изсипете в тава, покрийте с бутер тестото и печете 25 минути.'],
  'Turkey meatballs with rice': ['Пуешки кюфтенца с ориз', 'Омесете каймата с яйцето, оформете кюфтенца и печете 18 минути. Сервирайте с ориз и задушени тиквички.'],
  'Baked salmon with potatoes': ['Печена сьомга с картофи', 'Печете картофите 15 минути, добавете сьомгата и броколите и печете още 15. Полейте с лимон.'],
  'Chicken fajita bowls': ['Купи фахита с пиле', 'Сварете ориза. Запържете пилето на ивици. Затоплете царевицата и боба. Подредете купите с авокадо и лайм.'],
  'Creamy chicken orzo': ['Кремообразно орзо с пиле', 'Запържете пилето, добавете орзото и бульона и варете 12 минути. Добавете сметаната, спанака и сиренето.'],
  'Beef & broccoli rice bowl': ['Ориз с телешко и броколи', 'Сварете ориза. Запържете бързо телешкото, добавете броколите, соевия сос и малко мед.'],
  'Lentil & sweet potato soup': ['Супа от леща и сладки картофи', 'Варете всичко 25 минути до омекване, после пасирайте.'],
  'Oven chicken thighs with vegetables': ['Пилешки бутчета със зеленчуци на фурна', 'Овкусете всичко с олио и сол и печете 45 минути на 200°C.'],
  'Chicken with rice': ['Пиле с ориз', '1. Варим бутчетата заедно с обелките от морковите и лука, сол, черен пипер и дафинов лист около 35 минути.\n2. Изваждаме бутчетата и прецеждаме бульона. Накъсваме бялото месо.\n3. Измиваме малко ориза. Слагаме го в тавата, после зеленчуците и накрая месото. Заливаме с 3 чаши (6-7 черпака) бульон.\n4. Печем около 35 минути в предварително загрята фурна на 200 градуса, докато оризът поеме течността.'],
  'Pea stew': ['Постна грах яхния', '1. Нарязваме на дребно лука и морковите и ги запържваме в тенджера. Добавяме нарязаните на парченца картофи и разбъркваме. Поръсваме обилно с червен пипер.\n2. Прибавяме доматеното пюре и при нужда доливаме гореща вода. Оставяме да се свари 12-15 минути.\n3. Добавяме граха и варим до готовност. Овкусяваме с подправки и махаме от котлона.'],
  'Chicken soup': ['Пилешка супа', '1. Посоляваме бутчетата и ги запържваме за по 2 минути от страна.\n2. Правим бульона, като ги варим в тенджера с подсолена вода и обелките от морковите и лука, дафинов лист и черен пипер.\n3. Режем зеленчуците. Запържваме лука, морковите и целината. Добавяме картофите. Сипваме бульона. Слагаме подправките. Оставяме да ври около 12 минути.\n4. Обезкостяваме пилето. Слагаме го заедно с фидето.\n5. Правим застройката (жълтъци, прясно мляко, брашно) и я сипваме.'],
  Moussaka: ['Мусака', '1. Нарязваме зеленчуците. Загряваме олиото и запържваме лука и моркова. Добавяме каймата. Овкусяваме с подправките.\n2. Слагаме картофите за около 5 минути. Добавяме доматения сос и 1 чаша вода. Оставяме за още 5 минути.\n3. Изсипваме в тава и печем за 40 минути на 180 градуса в предварително загрята фурна.\n4. Забъркваме заливката (скир, яйца, сода, брашно). Поливаме и запичаме за още 15 минути на 200 градуса.'],
  'Stew with sausage': ['Яхния с наденица', '1. Нарязваме продуктите. Загряваме олиото и запържваме наденицата за 3-4 минути. Вадим я.\n2. Слагаме лука и морковите с червен пипер. Добавяме картофите и разбъркваме. Връщаме наденицата.\n3. Добавяме доматения сос и около 500-600 мл гореща вода (бульон) - трябва да покриват картофите. Подправяме.\n4. След като заври, намаляваме котлона на 3 и оставяме да къкри под капак 20 минути и 5 минути без него.'],
}

/** Bulgarian names and steps for the built-in recipes, keyed by English name; also used to fill households saved before. */
export function seedTranslations(): Record<string, { nameBg: string; stepsBg: string; ingredients: Record<string, string> }> {
  return Object.fromEntries(Object.entries(RECIPES_BG).map(([en, [nameBg, stepsBg]]) => [en, { nameBg, stepsBg, ingredients: INGREDIENTS_BG }]))
}

/** Adds the Bulgarian fields to a built-in recipe. */
export function withBg(r: Recipe): Recipe {
  const t = RECIPES_BG[r.name]
  return {
    ...r,
    nameBg: r.nameBg ?? t?.[0],
    stepsBg: r.stepsBg ?? t?.[1],
    ingredients: r.ingredients.map((i) => ({ ...i, bg: i.bg ?? INGREDIENTS_BG[i.name.toLowerCase()] })),
  }
}
