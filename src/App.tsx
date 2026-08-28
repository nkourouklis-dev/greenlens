import { NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Scan from './pages/Scan'
import AddProduct from './pages/AddProduct'
import Product from './pages/Product'
import './App.css'

function App() {
  return (
    <div className="app">
      <header>
        <h1>GreenLens</h1>
        <nav>
          <NavLink to="/">Home</NavLink>
          <NavLink to="/scan">Scan</NavLink>
          <NavLink to="/add-product">Add Product</NavLink>
          <NavLink to="/product/sample-product">Product</NavLink>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/add-product" element={<AddProduct />} />
          <Route path="/product/:id" element={<Product />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
