import { normalizeText } from "./normalize.js";

export function buildProductKey(input: {
  description: string;
  brand?: string | null;
  unit?: string | null;
}) {
  const description = normalizeText(input.description || "");
  const brand = normalizeText(input.brand || "");
  const unit = normalizeText(input.unit || "");

  return [description, brand, unit].join("::");
}