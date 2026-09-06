import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Scan from "./pages/Scan";
import AddProduct from "./pages/AddProduct";
import ProductPhoto from "./pages/ProductPhoto";
import IngredientsPhoto from "./pages/IngredientsPhoto";
import Product from "./pages/Product";
import History from "./pages/History";
import IngredientsReview from "./pages/IngredientsReview";
import MobileNav from "./components/MobileNav";
import AnalysisRun from "./pages/AnalysisRun";
import { CameraProvider } from "./contexts/CameraContext";

export default function App() {
  return (
    <BrowserRouter>
      {/* Lives above the routed pages so the camera stream survives
          navigation across the scan flow instead of being re-acquired
          (and re-prompted for permission) on every step. */}
      <CameraProvider>
        <MobileNav />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/add-product" element={<AddProduct />} />
          <Route path="/ingredients-photo" element={<IngredientsPhoto />} />
          <Route path="/ingredients-review/:id" element={<IngredientsReview />} />
          <Route path="/product-photo" element={<ProductPhoto />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/product/:id/analysis" element={<AnalysisRun />} />
          <Route path="/history" element={<History />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </CameraProvider>
    </BrowserRouter>
  );
}