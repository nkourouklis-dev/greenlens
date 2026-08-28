interface Env {
  DB: D1Database
  PRODUCT_IMAGES: R2Bucket
}

type ProductType = 'food' | 'cosmetic'

type ProductRecord = {
  id: number
  name: string
  barcode: string
  productType: ProductType
  ingredients: string
  score: number | null
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })

const HIGH_RISK = ['sodium nitrite', 'paraben', 'bht', 'talc', 'high fructose corn syrup', 'red 40']
const LOW_RISK = ['water', 'vitamin c', 'oat', 'aloe vera', 'olive oil']

const parseIngredients = (raw: string): string[] =>
  raw
    .split(/[\n,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

const analyzeIngredients = (rawIngredients: string) => {
  const ingredients = parseIngredients(rawIngredients)
  const flagged = HIGH_RISK.filter((risk) => ingredients.some((ingredient) => ingredient.includes(risk)))
  const beneficial = LOW_RISK.filter((safe) => ingredients.some((ingredient) => ingredient.includes(safe)))

  const score = Math.max(15, Math.min(100, 75 - flagged.length * 18 + beneficial.length * 8))

  return {
    score,
    summary:
      flagged.length > 0
        ? 'Potentially risky ingredients were found. Review before frequent use.'
        : 'No high-risk ingredients detected in the current list.',
    flaggedIngredients: flagged,
    recommendations:
      flagged.length > 0
        ? ['Compare with alternatives that avoid flagged additives.', 'Use in moderation and verify quantity exposure.']
        : ['Current ingredient list appears lower-risk from known flagged additives.'],
  }
}

const fallbackProducts: ProductRecord[] = []

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return json({ ok: true })
    }

    const { pathname, searchParams } = new URL(request.url)

    if (pathname === '/api/ocr' && request.method === 'POST') {
      const body = (await request.json()) as { filename?: string }
      const fromFilename = (body.filename ?? '')
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\d+/g, ' ')
        .trim()

      return json({ ingredients: fromFilename || 'water, fragrance, vitamin c' })
    }

    if (pathname === '/api/analyze' && request.method === 'POST') {
      const body = (await request.json()) as { ingredients?: string }
      const ingredients = body.ingredients?.trim() ?? ''
      if (!ingredients) {
        return json({ error: 'ingredients are required' }, 400)
      }
      return json(analyzeIngredients(ingredients))
    }

    if (pathname === '/api/products' && request.method === 'POST') {
      const body = (await request.json()) as {
        name?: string
        barcode?: string
        productType?: ProductType
        ingredients?: string
        score?: number | null
      }

      if (!body.name?.trim() || !body.barcode?.trim() || !body.ingredients?.trim()) {
        return json({ error: 'name, barcode, and ingredients are required' }, 400)
      }

      const analyzed = analyzeIngredients(body.ingredients)
      const score = Number.isFinite(body.score) ? Number(body.score) : analyzed.score

      if (env.DB) {
        await env.DB.prepare(
          `INSERT INTO products (name, barcode, product_type, ingredients, score)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
          .bind(body.name.trim(), body.barcode.trim(), body.productType ?? 'food', body.ingredients.trim(), score)
          .run()
      } else {
        fallbackProducts.unshift({
          id: Date.now(),
          name: body.name.trim(),
          barcode: body.barcode.trim(),
          productType: body.productType ?? 'food',
          ingredients: body.ingredients.trim(),
          score,
        })
      }

      return json({ ok: true, score })
    }

    if (pathname === '/api/products' && request.method === 'GET') {
      const query = (searchParams.get('query') ?? '').trim().toLowerCase()

      if (env.DB) {
        const result = await env.DB.prepare(
          `SELECT id, name, barcode, product_type AS productType, ingredients, score
           FROM products
           WHERE lower(name) LIKE ?1 OR lower(ingredients) LIKE ?1 OR barcode LIKE ?1
           ORDER BY id DESC
           LIMIT 25`,
        )
          .bind(`%${query}%`)
          .all<ProductRecord>()

        return json({ products: result.results ?? [] })
      }

      const products = fallbackProducts.filter((product) => {
        if (!query) return true
        return (
          product.name.toLowerCase().includes(query) ||
          product.ingredients.toLowerCase().includes(query) ||
          product.barcode.includes(query)
        )
      })

      return json({ products: products.slice(0, 25) })
    }

    if (pathname === '/api/chat' && request.method === 'POST') {
      const body = (await request.json()) as { question?: string; productType?: ProductType }
      if (!body.question?.trim()) {
        return json({ error: 'question is required' }, 400)
      }

      const category = body.productType === 'cosmetic' ? 'cosmetics' : 'food'
      return json({
        answer: `For ${category}, GreenLens checks ingredient risks, compares alternatives, and explains trade-offs. Question received: "${body.question.trim()}".`,
      })
    }

    return json({ error: 'Not Found' }, 404)
  },
}
