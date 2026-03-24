import { prisma } from "../lib/prisma.js";
import { scoreProductMatch } from "../utils/product-matching.js";

type CompareItem = {
  name: string;
  quantity: number;
};

type CompareInput = {
  items: CompareItem[];
  city?: string;
  chainIds?: string[];
};

type MatchedItem = {
  requestedName: string;
  matchedProduct: string;
  matchedBrand: string | null;
  matchedUnit: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  matchScore: number;
};

function getLatestPricesByProduct<T extends { productId: string; capturedAt: Date }>(
  prices: T[]
): T[] {
  const latestMap = new Map<string, T>();

  for (const price of prices) {
    const current = latestMap.get(price.productId);

    if (!current || price.capturedAt > current.capturedAt) {
      latestMap.set(price.productId, price);
    }
  }

  return Array.from(latestMap.values());
}

export async function compareShoppingItems(input: CompareInput) {
  const stores = await prisma.store.findMany({
    where: {
      ...(input.city
        ? {
            city: {
              equals: input.city,
              mode: "insensitive"
            }
          }
        : {}),
      ...(input.chainIds && input.chainIds.length > 0
        ? {
            chainId: {
              in: input.chainIds
            }
          }
        : {})
    },
    include: {
      chain: true,
      prices: {
        orderBy: {
          capturedAt: "desc"
        },
        include: {
          product: true
        }
      }
    }
  });

  const options = stores.map((store) => {
    let total = 0;

    const matchedItems: MatchedItem[] = [];
    const missingItems: string[] = [];

    const latestPrices = getLatestPricesByProduct(store.prices);

    for (const requestedItem of input.items) {
      const scoredCandidates = latestPrices
        .map((price) => {
          const score = scoreProductMatch({
            requestedName: requestedItem.name,
            candidateName: price.product.name,
            candidateBrand: price.product.brand,
            candidateUnit: price.product.unit
          });

          return {
            price,
            score
          };
        })
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }

          return Number(a.price.amount) - Number(b.price.amount);
        });

      const bestCandidate = scoredCandidates[0];

      if (!bestCandidate) {
        missingItems.push(requestedItem.name);
        continue;
      }

      const subtotal =
        Number(bestCandidate.price.amount) * requestedItem.quantity;

      total += subtotal;

      matchedItems.push({
        requestedName: requestedItem.name,
        matchedProduct: bestCandidate.price.product.name,
        matchedBrand: bestCandidate.price.product.brand,
        matchedUnit: bestCandidate.price.product.unit,
        quantity: requestedItem.quantity,
        unitPrice: Number(bestCandidate.price.amount),
        subtotal,
        matchScore: bestCandidate.score
      });
    }

    return {
      storeId: store.id,
      storeName: store.name,
      chainName: store.chain.name,
      total,
      matchedItems,
      missingItems,
      matchedCount: matchedItems.length
    };
  });

  const completeOptions = options
    .filter((option) => option.missingItems.length === 0)
    .sort((a, b) => a.total - b.total);

  return {
    bestOption: completeOptions[0] ?? null,
    options
  };
}