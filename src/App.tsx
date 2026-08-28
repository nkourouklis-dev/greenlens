import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Scan from "./pages/Scan";
import AddProduct from "./pages/AddProduct";
import ProductPhoto from "./pages/ProductPhoto";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/add-product" element={<AddProduct />} />
        <Route path="/product-photo" element={<ProductPhoto />} />
      </Routes>
    </BrowserRouter>
  );
}