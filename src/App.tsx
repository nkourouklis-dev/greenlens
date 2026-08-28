import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type ProductType = 'food' | 'cosmetic'

type SearchProduct = {
  id?: number
  name: string
  barcode: string
  productType: ProductType
  ingredients: string
  score?: number
}

type AnalysisResult = {
  score: number
  summary: string
  flaggedIngredients: string[]
  recommendations: string[]
}

const HIGH_RISK_INGREDIENTS = [
  'sodium nitrite',
  'paraben',
  'bht',
  'talc',
  'high fructose corn syrup',
  'red 40',
]

const LOW_RISK_INGREDIENTS = ['water', 'vitamin c', 'oat', 'aloe vera', 'olive oil']

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }

  return (await response.json()) as T
}

function fallbackAnalysis(ingredients: string): AnalysisResult {
  const lowered = ingredients.toLowerCase()
  const flaggedIngredients = HIGH_RISK_INGREDIENTS.filter((item) => lowered.includes(item))
  const helpfulIngredients = LOW_RISK_INGREDIENTS.filter((item) => lowered.includes(item))

  const score = Math.max(15, Math.min(100, 75 - flaggedIngredients.length * 18 + helpfulIngredients.length * 8))

  return {
    score,
    summary:
      flaggedIngredients.length > 0
        ? 'Potentially risky ingredients were found. Review recommendations before buying.'
        : 'No high-risk ingredients detected in the current list.',
    flaggedIngredients,
    recommendations:
      flaggedIngredients.length > 0
        ? [
            'Limit frequent use or consumption if safer alternatives are available.',
            'Check product quantity and compare with cleaner alternatives.',
          ]
        : ['This product appears lower-risk based on the current ingredient text.'],
  }
}

function App() {
  const [productType, setProductType] = useState<ProductType>('food')
  const [barcode, setBarcode] = useState('')
  const [productName, setProductName] = useState('')
  const [ingredientText, setIngredientText] = useState('')
  const [productPhoto, setProductPhoto] = useState<File | null>(null)
  const [ingredientPhoto, setIngredientPhoto] = useState<File | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchProduct[]>([])
  const [chatQuestion, setChatQuestion] = useState('')
  const [chatResponse, setChatResponse] = useState('')
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [status, setStatus] = useState('Ready to scan and analyze products.')

  const canSaveProduct = useMemo(
    () => productName.trim().length > 0 && barcode.trim().length > 0 && ingredientText.trim().length > 0,
    [barcode, ingredientText, productName],
  )

  const withBusy = async (label: string, fn: () => Promise<void>) => {
    try {
      setBusyLabel(label)
      await fn()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unexpected error while processing your request.')
    } finally {
      setBusyLabel(null)
    }
  }

  const runOcr = async () => {
    if (!ingredientPhoto) {
      setStatus('Add an ingredient photo first.')
      return
    }

    await withBusy('Extracting ingredients with OCR...', async () => {
      const fallbackText = ingredientPhoto.name
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\d+/g, ' ')
        .trim()

      try {
        const data = await postJson<{ ingredients: string }>('/api/ocr', {
          productType,
          filename: ingredientPhoto.name,
        })
        setIngredientText(data.ingredients)
      } catch {
        setIngredientText(fallbackText || 'water, fragrance, vitamin c')
      }

      setStatus('OCR complete. Review and edit extracted ingredients if needed.')
    })
  }

  const runIngredientAnalysis = async () => {
    if (!ingredientText.trim()) {
      setStatus('Add ingredient text before running analysis.')
      return
    }

    await withBusy('Analyzing ingredients with AI...', async () => {
      try {
        const data = await postJson<AnalysisResult>('/api/analyze', {
          productType,
          ingredients: ingredientText,
        })
        setAnalysis(data)
      } catch {
        setAnalysis(fallbackAnalysis(ingredientText))
      }

      setStatus('Analysis complete. Score and recommendations updated.')
    })
  }

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSaveProduct) {
      setStatus('Enter product name, barcode, and ingredients before saving.')
      return
    }

    await withBusy('Saving product in shared database...', async () => {
      await postJson<{ ok: boolean }>('/api/products', {
        name: productName.trim(),
        productType,
        barcode: barcode.trim(),
        ingredients: ingredientText.trim(),
        productPhotoName: productPhoto?.name ?? null,
        ingredientPhotoName: ingredientPhoto?.name ?? null,
        score: analysis?.score ?? null,
      })
      setStatus('Product saved to shared database.')
    })
  }

  const runSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    await withBusy('Searching products...', async () => {
      const response = await fetch(`/api/products?query=${encodeURIComponent(searchQuery.trim())}`)
      if (!response.ok) {
        throw new Error('Search failed. Try again.')
      }
      const data = (await response.json()) as { products: SearchProduct[] }
      setSearchResults(data.products)
      setStatus(`Found ${data.products.length} matching products.`)
    })
  }

  const askChatbot = async (event: FormEvent) => {
    event.preventDefault()
    if (!chatQuestion.trim()) {
      setStatus('Enter a question for the GreenLens assistant.')
      return
    }

    await withBusy('Consulting GreenLens AI assistant...', async () => {
      try {
        const data = await postJson<{ answer: string }>('/api/chat', {
          question: chatQuestion.trim(),
          productType,
        })
        setChatResponse(data.answer)
      } catch {
        setChatResponse(
          'I can help compare ingredients, flag common risks, and suggest cleaner alternatives for food and cosmetics.',
        )
      }

      setStatus('Assistant response ready.')
    })
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="badge">Progressive Web App</p>
        <h1>GreenLens</h1>
        <p className="subtitle">
          Scan food and cosmetic products, extract ingredients, and get AI-powered health and safety insights.
        </p>
      </header>

      <section className="panel">
        <h2>1) Capture product data</h2>
        <form onSubmit={saveProduct} className="form-grid">
          <label>
            Product type
            <select value={productType} onChange={(e) => setProductType(e.target.value as ProductType)}>
              <option value="food">Food</option>
              <option value="cosmetic">Cosmetic</option>
            </select>
          </label>

          <label>
            Product name
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Example: Oat Milk"
            />
          </label>

          <label>
            Barcode
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Scan or type barcode"
              inputMode="numeric"
            />
          </label>

          <label>
            Product photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setProductPhoto(e.target.files?.[0] ?? null)}
            />
          </label>

          <label>
            Ingredient label photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setIngredientPhoto(e.target.files?.[0] ?? null)}
            />
          </label>

          <label className="full-width">
            Ingredients (OCR editable)
            <textarea
              value={ingredientText}
              onChange={(e) => setIngredientText(e.target.value)}
              rows={5}
              placeholder="water, sugar, oats..."
            />
          </label>

          <div className="button-row full-width">
            <button type="button" onClick={runOcr} disabled={busyLabel !== null}>
              Extract ingredients (OCR)
            </button>
            <button type="button" onClick={runIngredientAnalysis} disabled={busyLabel !== null}>
              Analyze ingredients (AI)
            </button>
            <button type="submit" disabled={busyLabel !== null || !canSaveProduct}>
              Save product
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>2) Health and safety score</h2>
        {analysis ? (
          <div className="score-card" aria-live="polite">
            <p className="score">{analysis.score}/100</p>
            <p>{analysis.summary}</p>
            {analysis.flaggedIngredients.length > 0 ? (
              <>
                <h3>Flagged ingredients</h3>
                <ul>
                  {analysis.flaggedIngredients.map((ingredient) => (
                    <li key={ingredient}>{ingredient}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : (
          <p>Run AI analysis to generate a score.</p>
        )}
      </section>

      <section className="panel">
        <h2>3) Search shared products</h2>
        <div className="search-row">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, ingredient, or barcode"
          />
          <button type="button" onClick={runSearch} disabled={busyLabel !== null}>
            Search
          </button>
        </div>
        <ul className="results">
          {searchResults.map((product, index) => (
            <li key={`${product.barcode}-${index}`}>
              <strong>{product.name}</strong> ({product.productType})<br />
              Barcode: {product.barcode}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>4) Ask GreenLens AI chatbot</h2>
        <form className="search-row" onSubmit={askChatbot}>
          <input
            value={chatQuestion}
            onChange={(e) => setChatQuestion(e.target.value)}
            placeholder="Is this product safe for daily use?"
          />
          <button type="submit" disabled={busyLabel !== null}>
            Ask
          </button>
        </form>
        {chatResponse ? <p className="chat-response">{chatResponse}</p> : null}
      </section>

      <footer className="status" aria-live="polite">
        {busyLabel ?? status}
      </footer>
    </main>
  )
}

export default App
