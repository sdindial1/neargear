/**
 * Partner attribution — calculation rules.
 *
 * NOTE: This is forward-looking. Phase 1 ships the data model only; nothing
 * calls computeAttribution yet. It lives here so the rule is captured and
 * unit-testable before Phase 3 wires it into the transaction-completion flow.
 *
 * THE FOUNDING-FAMILY RULE
 * ------------------------
 * Founding Family members pay a 0% platform fee (see src/lib/fees.ts —
 * calculatePlatformFee returns 0 when isFoundingMember). A partner program
 * earns rev_share_percent OF THE PLATFORM FEE. If a founding-family seller is
 * also tagged to a partner program (e.g. Jeff, a DYB founding family), their
 * sale generates $0 platform fee, so there is nothing to share:
 *
 *   - attributed_amount is 0
 *   - NO partner_transactions row should be created for them
 *
 * The user-facing story stays clean: founding families pay 0% fees; partner
 * leagues get rev_share_percent of platform fees from NON-founding members.
 *
 * Example (DYB, 30% rev share, non-founding seller, $100 sale at 8% fee):
 *   platform fee = $8.00  ->  attributed = 30% of $8.00 = $2.40
 *   (i.e. 2.4% of the gross sale)
 */

export interface AttributionInput {
  /** Gross sale amount in cents. */
  grossSaleAmount: number;
  /** Platform fee actually charged on this sale, in cents (0 for founding). */
  platformFeeAmount: number;
  /** The partner program's revenue share, as a percent (e.g. 30 = 30%). */
  revSharePercent: number;
  /** Whether the seller is a Founding Family member. */
  isFoundingMember: boolean;
}

export interface AttributionResult {
  /** Cents owed to the partner for this sale. */
  attributedAmount: number;
  /**
   * Whether a partner_transactions row should be created. False for
   * founding-family sales (0% fee -> nothing to attribute).
   */
  shouldRecord: boolean;
}

/**
 * Compute partner attribution for a single completed sale.
 *
 * Returns shouldRecord=false for founding-family sellers (and any zero-fee
 * sale) so callers skip inserting a partner_transactions row. Otherwise
 * attributedAmount = round(platformFeeAmount * revSharePercent / 100).
 */
export function computeAttribution(input: AttributionInput): AttributionResult {
  const { platformFeeAmount, revSharePercent, isFoundingMember } = input;

  // Founding family -> 0% fee -> no platform revenue to share. No record.
  if (isFoundingMember || platformFeeAmount <= 0) {
    return { attributedAmount: 0, shouldRecord: false };
  }

  const attributedAmount = Math.round(
    (platformFeeAmount * revSharePercent) / 100,
  );

  // A non-zero fee that rounds attribution to 0 still isn't worth a row.
  return {
    attributedAmount,
    shouldRecord: attributedAmount > 0,
  };
}
