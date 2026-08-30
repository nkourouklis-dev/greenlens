import {
  apiBaseUrl,
  apiConfigurationError,
} from "../config";

export interface ProductIdentity {
  productName: string | null;
  brand: string | null;
  netContent: string | null;
  confidence: number;
}

export async function identifyProduct(
  image: string,
): Promise<ProductIdentity | null> {
  if (apiConfigurationError) {
    return null;
  }

  try {
    const blob = await (
      await fetch(image)
    ).blob();

    const formData = new FormData();

    formData.append(
      "image",
      blob,
      "product.jpg",
    );

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      20_000,
    );

    let response: Response;

    try {
      response = await fetch(
        `${apiBaseUrl}/api/product/identify`,
        {
          method: "POST",
          body: formData,
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return null;
    }

    const result: unknown = await response
      .json()
      .catch(() => null);

    if (!isIdentity(result)) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

function isIdentity(
  value: unknown,
): value is ProductIdentity {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const candidate = value as Record<
    string,
    unknown
  >;

  const nameOk =
    candidate.productName === null ||
    typeof candidate.productName === "string";

  const brandOk =
    candidate.brand === null ||
    typeof candidate.brand === "string";

  return nameOk && brandOk;
}