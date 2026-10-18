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
  return {
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
  }
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
