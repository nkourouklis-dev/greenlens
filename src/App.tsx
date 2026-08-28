import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Scan from "./pages/Scan";
import ProductPhoto from "./pages/ProductPhoto";
import IngredientsPhoto from "./pages/IngredientsPhoto";
import Product from "./pages/Product";
import History from "./pages/History";
import IngredientsReview from "./pages/IngredientsReview";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/ingredients-photo" element={<IngredientsPhoto />} />
        <Route path="/ingredients-review/:id" element={<IngredientsReview />} />
        <Route path="/product-photo" element={<ProductPhoto />} />
        <Route path="/product/:id" element={<Product />} />
        <Route path="/history" element={<History />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}