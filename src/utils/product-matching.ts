import { normalizeText } from "./normalize.js";

const STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "y",
  "en",
  "con",
  "sin",
  "para",
  "por",
  "un",
  "una",
  "unos",
  "unas",
  "al",
  "a"
]);

const UNIT_ALIASES: Record<string, string> = {
  kg: "kg",
  kilo: "kg",
  kilos: "kg",
  g: "g",
  gr: "g",
  grs: "g",
  gramo: "g",
  gramos: "g",
  l: "l",
  lt: "l",
  litro: "l",
  litros: "l",
  ml: "ml",
  cc: "ml"
};

type ParsedPresentation = {
  quantity: number | null;
  unit: string | null;
};

export function tokenizeProductText(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .filter((token) => !STOPWORDS.has(token));
}

export function uniqueTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens));
}

export function parsePresentation(value: string): ParsedPresentation {
  const normalized = normalizeText(value);

  const compactMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilo|kilos|g|gr|grs|gramo|gramos|l|lt|litro|litros|ml|cc)\b/);
  if (!compactMatch) {
    return {
      quantity: null,
      unit: null
    };
  }

  const rawQuantity = compactMatch[1].replace(",", ".");
  const rawUnit = compactMatch[2];

  const quantity = Number(rawQuantity);
  const unit = UNIT_ALIASES[rawUnit] ?? null;

  return {
    quantity: Number.isFinite(quantity) ? quantity : null,
    unit
  };
}

export function normalizeToBaseUnit(
  quantity: number | null,
  unit: string | null
): number | null {
  if (quantity == null || !unit) return null;

  switch (unit) {
    case "kg":
      return quantity * 1000;
    case "g":
      return quantity;
    case "l":
      return quantity * 1000;
    case "ml":
      return quantity;
    default:
      return null;
  }
}

function getBrandTokens(brand?: string | null): string[] {
  if (!brand) return [];
  return uniqueTokens(tokenizeProductText(brand));
}

function countSharedTokens(a: string[], b: string[]): number {
  let count = 0;

  for (const token of a) {
    if (b.includes(token)) {
      count++;
    }
  }

  return count;
}

export function scoreProductMatch(input: {
  requestedName: string;
  candidateName: string;
  candidateBrand?: string | null;
  candidateUnit?: string | null;
}): number {
  const { requestedName, candidateName, candidateBrand, candidateUnit } = input;

  const requestedTokens = uniqueTokens(tokenizeProductText(requestedName));
  const candidateTokens = uniqueTokens(tokenizeProductText(candidateName));
  const brandTokens = getBrandTokens(candidateBrand);

  if (requestedTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  let score = 0;

  for (const token of requestedTokens) {
    if (candidateTokens.includes(token)) {
      score += 10;
      continue;
    }

    if (brandTokens.includes(token)) {
      score += 12;
      continue;
    }

    const partialName = candidateTokens.some(
      (candidateToken) =>
        candidateToken.includes(token) || token.includes(candidateToken)
    );

    const partialBrand = brandTokens.some(
      (brandToken) => brandToken.includes(token) || token.includes(brandToken)
    );

    if (partialName) {
      score += 4;
    } else if (partialBrand) {
      score += 5;
    }
  }

  const normalizedRequested = normalizeText(requestedName);
  const normalizedCandidate = normalizeText(candidateName);

  if (normalizedCandidate.includes(normalizedRequested)) {
    score += 8;
  }

  if (normalizedRequested === normalizedCandidate) {
    score += 20;
  }

  const requestedPresentation = parsePresentation(requestedName);
  const candidatePresentation = parsePresentation(
    `${candidateName} ${candidateUnit ?? ""}`
  );

  const requestedBase = normalizeToBaseUnit(
    requestedPresentation.quantity,
    requestedPresentation.unit
  );

  const candidateBase = normalizeToBaseUnit(
    candidatePresentation.quantity,
    candidatePresentation.unit
  );

  if (
    requestedPresentation.unit &&
    candidatePresentation.unit &&
    requestedPresentation.unit === candidatePresentation.unit
  ) {
    score += 8;
  }

  if (requestedBase != null && candidateBase != null) {
    const diff = Math.abs(requestedBase - candidateBase);
    const max = Math.max(requestedBase, candidateBase);
    const ratio = max > 0 ? diff / max : 0;

    if (ratio === 0) {
      score += 20;
    } else if (ratio <= 0.1) {
      score += 10;
    } else if (ratio <= 0.25) {
      score += 4;
    } else if (ratio >= 0.5) {
      score -= 15;
    }
  }

  const sharedBrandTokens = countSharedTokens(requestedTokens, brandTokens);
  score += sharedBrandTokens * 8;

  return score;
}