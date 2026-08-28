import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Scan from "./pages/Scan";
import AddProduct from "./pages/AddProduct";
import ProductPhoto from "./pages/ProductPhoto";
import IngredientsPhoto from "./pages/IngredientsPhoto";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/add-product" element={<AddProduct />} />
        <Route path="/product-photo" element={<ProductPhoto />} />
        <Route path="/ingredients-photo" element={<IngredientsPhoto />} />
      </Routes>
    </BrowserRouter>
  );
}