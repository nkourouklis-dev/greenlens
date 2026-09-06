import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MobileNav from "./components/MobileNav";
import { CameraProvider } from "./contexts/CameraContext";
import ErrorBoundary from "./components/ErrorBoundary";

const Home = lazy(() => import("./pages/Home"));
const Scan = lazy(() => import("./pages/Scan"));
const AddProduct = lazy(() => import("./pages/AddProduct"));
const ProductPhoto = lazy(() => import("./pages/ProductPhoto"));
const IngredientsPhoto = lazy(() => import("./pages/IngredientsPhoto"));
const Product = lazy(() => import("./pages/Product"));
const History = lazy(() => import("./pages/History"));
const IngredientsReview = lazy(() => import("./pages/IngredientsReview"));
const AnalysisRun = lazy(() => import("./pages/AnalysisRun"));

function PageFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas text-ink-muted">
      <p className="text-sm font-semibold">Φόρτωση...</p>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Lives above the routed pages so the camera stream survives
          navigation across the scan flow instead of being re-acquired
          (and re-prompted for permission) on every step. */}
      <CameraProvider>
        <MobileNav />
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
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
          </Suspense>
        </ErrorBoundary>
      </CameraProvider>
    </BrowserRouter>
  );
}