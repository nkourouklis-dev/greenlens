interface Env {
  DB?: D1Database
  PRODUCT_IMAGES: R2Bucket
  ALLOWED_ORIGIN?: string
}

type ProductType = 'food' | 'cosmetic'

type ProductRecord = {
  id: number
  name: string
  barcode: string
  productType: ProductType
  ingredients: string
  score: number | null
  productPhotoKey: string | null
  ingredientPhotoKey: string | null
}

const isProductType = (value: string): value is ProductType => value === 'food' || value === 'cosmetic'

const buildCorsHeaders = (request: Request, env: Env) => {
  const configuredOrigin = env.ALLOWED_ORIGIN?.trim()
  const requestOrigin = request.headers.get('Origin')

  if (!requestOrigin) {
    return {
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    }
  }

  const requestUrlOrigin = new URL(request.url).origin
  const isAllowedOrigin = configuredOrigin
    ? requestOrigin === configuredOrigin
    : requestOrigin === requestUrlOrigin

  return {
    ...(isAllowedOrigin ? { 'Access-Control-Allow-Origin': requestOrigin } : {}),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

const json = (data: unknown, request: Request, env: Env, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...buildCorsHeaders(request, env),
    },
  })

const HIGH_RISK = ['sodium nitrite', 'paraben', 'bht', 'talc', 'high fructose corn syrup', 'red 40']
const LOW_RISK = ['water', 'vitamin c', 'oat', 'aloe vera', 'olive oil']
const MAX_DATA_URL_LENGTH = 7_000_000
const escapeLikePattern = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')

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

const decodeBase64Payload = (dataUrl: string): { bytes: Uint8Array; mimeType: string } | null => {
  const matched = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!matched) {
    return null
  }

  const [, mimeType, payload] = matched
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return { bytes, mimeType }
}

const extensionFromMime = (mimeType: string): string => {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return 'bin'
  }
}

const storeImage = async (
  bucket: R2Bucket,
  dataUrl: string | null | undefined,
  barcode: string,
  type: 'product' | 'ingredients',
): Promise<string | null> => {
  if (!dataUrl) {
    return null
  }

  const parsed = decodeBase64Payload(dataUrl)
  if (!parsed) {
    return null
  }

  const key = `${type}/${barcode}-${crypto.randomUUID()}.${extensionFromMime(parsed.mimeType)}`
  await bucket.put(key, parsed.bytes, {
    httpMetadata: {
      contentType: parsed.mimeType,
    },
  })

  return key
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(request, env),
      })
    }

    const { pathname, searchParams } = new URL(request.url)

    if (pathname === '/api/ocr' && request.method === 'POST') {
      const body = (await request.json()) as { filename?: string }
      const fromFilename = (body.filename ?? '')
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\d+/g, ' ')
        .trim()

      return json(
        {
          ingredients: fromFilename || 'water, fragrance, vitamin c',
          mode: 'stub',
        },
        request,
        env,
      )
    }

    if (pathname === '/api/analyze' && request.method === 'POST') {
      const body = (await request.json()) as { ingredients?: string }
      const ingredients = body.ingredients?.trim() ?? ''
      if (!ingredients) {
        return json({ error: 'ingredients are required' }, request, env, 400)
      }
      return json(analyzeIngredients(ingredients), request, env)
    }

    if (pathname === '/api/products' && request.method === 'POST') {
      const db = env.DB
      if (!db) {
        return json({ error: 'Database is not configured' }, request, env, 503)
      }

      const body = (await request.json()) as {
        name?: string
        barcode?: string
        productType?: string
        ingredients?: string
        score?: number | null
        productPhotoDataUrl?: string | null
        ingredientPhotoDataUrl?: string | null
      }

      if (!body.name?.trim() || !body.barcode?.trim() || !body.ingredients?.trim()) {
        return json({ error: 'name, barcode, and ingredients are required' }, request, env, 400)
      }
      if (
        (body.productPhotoDataUrl?.length ?? 0) > MAX_DATA_URL_LENGTH ||
        (body.ingredientPhotoDataUrl?.length ?? 0) > MAX_DATA_URL_LENGTH
      ) {
        return json({ error: 'Image payload is too large' }, request, env, 413)
      }

      const selectedProductType = body.productType ?? 'food'
      if (!isProductType(selectedProductType)) {
        return json({ error: 'productType must be food or cosmetic' }, request, env, 400)
      }

      const analyzed = analyzeIngredients(body.ingredients)
      const score = Number.isFinite(body.score) ? Number(body.score) : analyzed.score
      let productPhotoKey: string | null = null
      let ingredientPhotoKey: string | null = null

      try {
        const uploadResults = await Promise.allSettled([
          storeImage(env.PRODUCT_IMAGES, body.productPhotoDataUrl, body.barcode.trim(), 'product'),
          storeImage(env.PRODUCT_IMAGES, body.ingredientPhotoDataUrl, body.barcode.trim(), 'ingredients'),
        ])

        productPhotoKey = uploadResults[0].status === 'fulfilled' ? uploadResults[0].value : null
        ingredientPhotoKey = uploadResults[1].status === 'fulfilled' ? uploadResults[1].value : null

        const uploadFailure = uploadResults.find((result) => result.status === 'rejected')
        if (uploadFailure) {
          throw uploadFailure.reason
        }

        await db
          .prepare(
            `INSERT INTO products (name, barcode, product_type, ingredients, score, product_photo_key, ingredient_photo_key)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
          )
          .bind(
            body.name.trim(),
            body.barcode.trim(),
            selectedProductType,
            body.ingredients.trim(),
            score,
            productPhotoKey,
            ingredientPhotoKey,
          )
          .run()
      } catch (error) {
        await Promise.all([
          productPhotoKey ? env.PRODUCT_IMAGES.delete(productPhotoKey) : Promise.resolve(),
          ingredientPhotoKey ? env.PRODUCT_IMAGES.delete(ingredientPhotoKey) : Promise.resolve(),
        ])
        const message = error instanceof Error ? error.message : 'Failed to store product.'
        return json({ error: message }, request, env, 500)
      }

      return json({ ok: true, score, productPhotoKey, ingredientPhotoKey }, request, env)
    }

    if (pathname === '/api/products' && request.method === 'GET') {
      const db = env.DB
      if (!db) {
        return json({ error: 'Database is not configured' }, request, env, 503)
      }

      const query = (searchParams.get('query') ?? '').trim().toLowerCase()
      if (!query) {
        return json({ products: [] }, request, env)
      }
      const escapedQuery = escapeLikePattern(query)

      const result = await db
        .prepare(
          `SELECT id, name, barcode, product_type AS productType, ingredients, score,
                  product_photo_key AS productPhotoKey, ingredient_photo_key AS ingredientPhotoKey
           FROM products
           WHERE lower(name) LIKE ?1 ESCAPE '\\' OR lower(ingredients) LIKE ?1 ESCAPE '\\' OR lower(barcode) LIKE ?1 ESCAPE '\\'
           ORDER BY id DESC
           LIMIT 25`,
        )
        .bind(`%${escapedQuery}%`)
        .all<ProductRecord>()

      return json({ products: result.results ?? [] }, request, env)
    }

    if (pathname === '/api/chat' && request.method === 'POST') {
      const body = (await request.json()) as { question?: string; productType?: ProductType }
      if (!body.question?.trim()) {
        return json({ error: 'question is required' }, request, env, 400)
      }

      const category = body.productType === 'cosmetic' ? 'cosmetics' : 'food'
      return json(
        {
          answer: `For ${category}, GreenLens checks ingredient risks, compares alternatives, and explains trade-offs. Question received: "${body.question.trim()}".`,
        },
        request,
        env,
      )
    }

    return json({ error: 'Not Found' }, request, env, 404)
  },
}
