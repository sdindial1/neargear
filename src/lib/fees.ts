// NearGear fee model.
//
// CURRENT MODEL (payments Phase 2+): full payment upfront.
//   - Buyer pays item price + 10% "Buyer Protection fee" at checkout.
//   - Seller receives item price − 10% seller fee at payout (Phase 3).
//   - Founding members: 0% SELLER fee. The buyer still pays the buyer fee.
// Use calculateBuyerFee / calculateSellerFee / computeOrderBreakdown for all
// new payment code. All amounts are integer cents — never floats.
//
// LEGACY MODEL (tiered platform fee + $-deposit + 1% dispute reserve) still
// powers the OLD meetup-completion transaction path. Left intact so completion
// keeps working; payments Phase 3 reconciles completion onto the flat model and
// removes the @deprecated helpers below.

const BUYER_FEE_RATE = 0.1; // 10% added on top of the item price
const SELLER_FEE_RATE = 0.1; // 10% deducted from the seller payout

/** Buyer service fee ("Buyer Protection fee") — 10% of the item price, added on top. */
export function calculateBuyerFee(itemPriceCents: number): number {
  return Math.round(itemPriceCents * BUYER_FEE_RATE);
}

/**
 * Seller fee — 10% of the item price, deducted from the seller's payout.
 * Founding members are exempt (0%).
 */
export function calculateSellerFee(
  itemPriceCents: number,
  isFoundingMember: boolean = false,
): number {
  if (isFoundingMember) return 0;
  return Math.round(itemPriceCents * SELLER_FEE_RATE);
}

export interface OrderBreakdown {
  itemPriceCents: number;
  buyerFeeCents: number;
  buyerTotalCents: number; // what the buyer pays / we capture
  sellerFeeCents: number;
  sellerPayoutCents: number; // what the seller receives at transfer (Phase 3)
  platformRevenueCents: number; // buyerFee + sellerFee — NearGear's cut
}

/**
 * Single source of truth for checkout + payout math. All integer cents.
 *
 * Example — $200 item (20000c), non-founding seller:
 *   buyerFee 2000, buyerTotal 22000, sellerFee 2000, sellerPayout 18000,
 *   platformRevenue 4000.
 * Founding seller: sellerFee 0, sellerPayout 20000, platformRevenue 2000
 *   (buyer still pays the 2000 buyer fee).
 */
export function computeOrderBreakdown(
  itemPriceCents: number,
  isFoundingSeller: boolean = false,
): OrderBreakdown {
  const buyerFeeCents = calculateBuyerFee(itemPriceCents);
  const sellerFeeCents = calculateSellerFee(itemPriceCents, isFoundingSeller);
  return {
    itemPriceCents,
    buyerFeeCents,
    buyerTotalCents: itemPriceCents + buyerFeeCents,
    sellerFeeCents,
    sellerPayoutCents: itemPriceCents - sellerFeeCents,
    platformRevenueCents: buyerFeeCents + sellerFeeCents,
  };
}

/**
 * @deprecated Legacy tiered platform fee — used only by the old meetup-completion
 * transaction path. New payment code uses calculateSellerFee (flat 10%). Payments
 * Phase 3 reconciles completion onto the flat model and removes this.
 */
export function calculatePlatformFee(
  priceInCents: number,
  isFoundingMember: boolean = false,
): number {
  if (isFoundingMember) return 0;
  if (priceInCents < 3000) return Math.round(priceInCents * 0.10);
  if (priceInCents < 10000) return Math.round(priceInCents * 0.08);
  if (priceInCents < 30000) return Math.round(priceInCents * 0.07);
  return Math.round(priceInCents * 0.06);
}

/**
 * @deprecated Legacy 1% dispute reserve — old completion path only. Removed in
 * payments Phase 3.
 */
export function calculateDisputeReserve(priceInCents: number): number {
  return Math.round(priceInCents * 0.01);
}

/**
 * @deprecated Legacy payout math (price − tiered fee − dispute reserve). Old
 * completion path only. New code uses computeOrderBreakdown().sellerPayoutCents.
 * Reconciled in payments Phase 3.
 */
export function calculateSellerPayout(
  priceInCents: number,
  isFoundingMember: boolean = false,
): number {
  return (
    priceInCents -
    calculatePlatformFee(priceInCents, isFoundingMember) -
    calculateDisputeReserve(priceInCents)
  );
}

export const FEE_DISPLAY = {
  marketing: "Free to list. Only pay when you sell.",
  sellerNote:
    "A 10% seller fee is deducted from your payout when your item sells. Founding members pay 0%.",
  buyerNote:
    "A 10% Buyer Protection fee is added at checkout and held securely until you confirm the handoff.",
};
