export function calculatePlatformFee(priceInCents: number): number {
  if (priceInCents < 3000) return Math.round(priceInCents * 0.10);
  if (priceInCents < 10000) return Math.round(priceInCents * 0.08);
  if (priceInCents < 30000) return Math.round(priceInCents * 0.07);
  return Math.round(priceInCents * 0.06);
}

export function calculateDisputeReserve(priceInCents: number): number {
  return Math.round(priceInCents * 0.01);
}

export function calculateSellerPayout(priceInCents: number): number {
  return priceInCents - calculatePlatformFee(priceInCents) - calculateDisputeReserve(priceInCents);
}

export function calculateDeposit(priceInCents: number): number {
  if (priceInCents < 3000) return 500;
  if (priceInCents < 10000) return 1000;
  if (priceInCents < 30000) return 2000;
  return 5000;
}

export const FEE_DISPLAY = {
  marketing: "Free to list. Only pay when you swap.",
  sellerNote: "A small platform fee is deducted automatically when your item sells.",
  feeSchedule: [
    { range: "Under $30", fee: "10%" },
    { range: "$30–$100", fee: "8%" },
    { range: "$100–$300", fee: "7%" },
    { range: "$300+", fee: "6%" },
  ],
};
