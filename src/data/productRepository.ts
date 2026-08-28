import type { Product } from "../types";

const products: readonly Product[] = [
  {
    id: "demo-greenlens-oat-drink",
    barcode: "0000000000000",
    name: "GreenLens Oat Drink",
    brand: "GreenLens Lab",
    ingredients: ["Water", "Oats (10%)", "Sunflower oil", "Sea salt"],
    description:
      "Demo product record for testing the GreenLens scan flow. It is not product, ingredient, or medical guidance.",
    isDemo: true,
  },
];

export function findProductByBarcode(barcode: string): Product | undefined {
  return products.find((product) => product.barcode === barcode);
}

export function findProductById(id: string): Product | undefined {
  return products.find((product) => product.id === id);
}