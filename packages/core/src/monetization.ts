export type MerchantType = "own" | "affiliate" | "normal";

export interface RankedOffer {
  offerId: string;
  rank: number;
  evaluationScore: number;
}

export interface CommercialOfferMetadata {
  offerId: string;
  merchantType: MerchantType;
  destinationUrl: string;
  disclosureRequired: boolean;
}

export interface ResolvedOffer extends RankedOffer, CommercialOfferMetadata {}

/** Commercial metadata is attached only after a ranking has been produced. */
export function attachCommercialMetadata(
  ranked: RankedOffer[],
  metadata: ReadonlyMap<string, CommercialOfferMetadata>,
): ResolvedOffer[] {
  return ranked.flatMap((offer) => {
    const commercial = metadata.get(offer.offerId);
    return commercial ? [{ ...offer, ...commercial }] : [];
  });
}
