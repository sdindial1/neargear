export type SafeZoneType =
  | "sporting_goods"
  | "recreation_center"
  | "coffee_shop"
  | "community_park"
  | "shopping_center"
  | "library";

export interface SafeZone {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  type: SafeZoneType;
  badge: string;
  popularityScore: number;
}

export const DFW_CITY_CENTROIDS: Record<string, { lat: number; lng: number }> =
  {
    Frisco: { lat: 33.1507, lng: -96.8236 },
    Plano: { lat: 33.0198, lng: -96.6989 },
    Allen: { lat: 33.1032, lng: -96.6705 },
    McKinney: { lat: 33.1972, lng: -96.6397 },
    Southlake: { lat: 32.9412, lng: -97.1342 },
    Keller: { lat: 32.9345, lng: -97.2292 },
    Arlington: { lat: 32.7357, lng: -97.1081 },
    Irving: { lat: 32.814, lng: -96.9489 },
    Garland: { lat: 32.9126, lng: -96.6389 },
    Mesquite: { lat: 32.7666, lng: -96.5991 },
    Richardson: { lat: 32.9483, lng: -96.7299 },
    Carrollton: { lat: 32.9545, lng: -96.89 },
    Lewisville: { lat: 33.0462, lng: -96.9942 },
    "Flower Mound": { lat: 33.0146, lng: -97.097 },
    Coppell: { lat: 32.9546, lng: -97.015 },
    "Cedar Hill": { lat: 32.5885, lng: -96.9561 },
    DeSoto: { lat: 32.5899, lng: -96.857 },
    Duncanville: { lat: 32.6518, lng: -96.9083 },
    "Grand Prairie": { lat: 32.7459, lng: -96.9978 },
    Other: { lat: 32.7767, lng: -96.797 },
  };

const BADGE = "NearGear Safe Zone";

export const SAFE_ZONES: SafeZone[] = [
  {
    id: "plano-dicks-legacy",
    name: "Dick's Sporting Goods – The Shops at Legacy",
    address: "7201 Bishop Rd",
    city: "Plano",
    state: "TX",
    zip: "75024",
    lat: 33.0776,
    lng: -96.8267,
    type: "sporting_goods",
    badge: BADGE,
    popularityScore: 9,
  },
  {
    id: "plano-academy",
    name: "Academy Sports + Outdoors – Plano",
    address: "1901 Preston Rd",
    city: "Plano",
    state: "TX",
    zip: "75093",
    lat: 33.0386,
    lng: -96.8,
    type: "sporting_goods",
    badge: BADGE,
    popularityScore: 8,
  },
  {
    id: "plano-muehlenbeck",
    name: "Tom Muehlenbeck Recreation Center",
    address: "5801 W Parker Rd",
    city: "Plano",
    state: "TX",
    zip: "75093",
    lat: 33.0404,
    lng: -96.815,
    type: "recreation_center",
    badge: BADGE,
    popularityScore: 7,
  },
  {
    id: "plano-davis-library",
    name: "Davis Library",
    address: "7501-B Independence Pkwy",
    city: "Plano",
    state: "TX",
    zip: "75025",
    lat: 33.0698,
    lng: -96.7683,
    type: "library",
    badge: BADGE,
    popularityScore: 6,
  },
  {
    id: "plano-starbucks-legacy",
    name: "Starbucks – Legacy West",
    address: "7700 Windrose Ave",
    city: "Plano",
    state: "TX",
    zip: "75024",
    lat: 33.0795,
    lng: -96.8314,
    type: "coffee_shop",
    badge: BADGE,
    popularityScore: 7,
  },
  {
    id: "frisco-dicks-stonebriar",
    name: "Dick's House of Sport – Stonebriar",
    address: "2601 Preston Rd",
    city: "Frisco",
    state: "TX",
    zip: "75034",
    lat: 33.1079,
    lng: -96.8025,
    type: "sporting_goods",
    badge: BADGE,
    popularityScore: 10,
  },
  {
    id: "frisco-athletic-center",
    name: "Frisco Athletic Center",
    address: "5828 Nancy Jane Ln",
    city: "Frisco",
    state: "TX",
    zip: "75034",
    lat: 33.1382,
    lng: -96.8411,
    type: "recreation_center",
    badge: BADGE,
    popularityScore: 9,
  },
  {
    id: "frisco-library",
    name: "Frisco Public Library",
    address: "8000 Dallas Pkwy",
    city: "Frisco",
    state: "TX",
    zip: "75034",
    lat: 33.1522,
    lng: -96.8317,
    type: "library",
    badge: BADGE,
    popularityScore: 7,
  },
  {
    id: "frisco-commons-park",
    name: "Frisco Commons Park",
    address: "8300 McKinney Rd",
    city: "Frisco",
    state: "TX",
    zip: "75034",
    lat: 33.1621,
    lng: -96.82,
    type: "community_park",
    badge: BADGE,
    popularityScore: 8,
  },
  {
    id: "frisco-stonebriar-centre",
    name: "Stonebriar Centre",
    address: "2601 Preston Rd",
    city: "Frisco",
    state: "TX",
    zip: "75034",
    lat: 33.1083,
    lng: -96.804,
    type: "shopping_center",
    badge: BADGE,
    popularityScore: 9,
  },
  {
    id: "allen-library",
    name: "Allen Public Library",
    address: "300 N Allen Dr",
    city: "Allen",
    state: "TX",
    zip: "75013",
    lat: 33.1019,
    lng: -96.6716,
    type: "library",
    badge: BADGE,
    popularityScore: 7,
  },
  {
    id: "allen-rodenbaugh",
    name: "Don Rodenbaugh Natatorium",
    address: "650 E Bethany Dr",
    city: "Allen",
    state: "TX",
    zip: "75002",
    lat: 33.1074,
    lng: -96.6519,
    type: "recreation_center",
    badge: BADGE,
    popularityScore: 7,
  },
  {
    id: "allen-joe-farmer",
    name: "Joe Farmer Recreation Center",
    address: "1201 E Bethany Dr",
    city: "Allen",
    state: "TX",
    zip: "75002",
    lat: 33.1072,
    lng: -96.6427,
    type: "recreation_center",
    badge: BADGE,
    popularityScore: 6,
  },
  {
    id: "mckinney-library",
    name: "John and Judy Gay Library",
    address: "6861 W Eldorado Pkwy",
    city: "McKinney",
    state: "TX",
    zip: "75070",
    lat: 33.1879,
    lng: -96.7263,
    type: "library",
    badge: BADGE,
    popularityScore: 6,
  },
  {
    id: "mckinney-gabe-nesbitt",
    name: "Gabe Nesbitt Community Park",
    address: "2800 Alma Rd",
    city: "McKinney",
    state: "TX",
    zip: "75070",
    lat: 33.1814,
    lng: -96.7246,
    type: "community_park",
    badge: BADGE,
    popularityScore: 8,
  },
  {
    id: "southlake-town-square",
    name: "Southlake Town Square",
    address: "1256 Main St",
    city: "Southlake",
    state: "TX",
    zip: "76092",
    lat: 32.9437,
    lng: -97.1285,
    type: "shopping_center",
    badge: BADGE,
    popularityScore: 9,
  },
  {
    id: "southlake-bicentennial",
    name: "Bicentennial Park",
    address: "450 W Southlake Blvd",
    city: "Southlake",
    state: "TX",
    zip: "76092",
    lat: 32.9399,
    lng: -97.1418,
    type: "community_park",
    badge: BADGE,
    popularityScore: 7,
  },
  {
    id: "keller-library",
    name: "Keller Public Library",
    address: "640 Johnson Rd",
    city: "Keller",
    state: "TX",
    zip: "76248",
    lat: 32.9397,
    lng: -97.2316,
    type: "library",
    badge: BADGE,
    popularityScore: 6,
  },
  {
    id: "arlington-dicks-parks-mall",
    name: "Dick's Sporting Goods – Parks Mall",
    address: "3811 S Cooper St",
    city: "Arlington",
    state: "TX",
    zip: "76015",
    lat: 32.6892,
    lng: -97.1339,
    type: "sporting_goods",
    badge: BADGE,
    popularityScore: 8,
  },
  {
    id: "arlington-library-east",
    name: "East Arlington Library",
    address: "1624 New York Ave",
    city: "Arlington",
    state: "TX",
    zip: "76010",
    lat: 32.7179,
    lng: -97.0727,
    type: "library",
    badge: BADGE,
    popularityScore: 5,
  },
  {
    id: "arlington-randol-mill",
    name: "Randol Mill Park",
    address: "1901 W Randol Mill Rd",
    city: "Arlington",
    state: "TX",
    zip: "76012",
    lat: 32.7437,
    lng: -97.1318,
    type: "community_park",
    badge: BADGE,
    popularityScore: 6,
  },
  {
    id: "irving-heritage-aquatic",
    name: "Heritage Aquatic Center",
    address: "200 S Jefferson St",
    city: "Irving",
    state: "TX",
    zip: "75060",
    lat: 32.8136,
    lng: -96.9444,
    type: "recreation_center",
    badge: BADGE,
    popularityScore: 6,
  },
  {
    id: "irving-starbucks-mac-arthur",
    name: "Starbucks – MacArthur Park",
    address: "7600 N MacArthur Blvd",
    city: "Irving",
    state: "TX",
    zip: "75063",
    lat: 32.911,
    lng: -96.9596,
    type: "coffee_shop",
    badge: BADGE,
    popularityScore: 7,
  },
  {
    id: "richardson-library",
    name: "Richardson Public Library",
    address: "900 Civic Center Dr",
    city: "Richardson",
    state: "TX",
    zip: "75080",
    lat: 32.9516,
    lng: -96.7113,
    type: "library",
    badge: BADGE,
    popularityScore: 6,
  },
  {
    id: "richardson-huffhines",
    name: "Huffhines Recreation Center",
    address: "200 N Plano Rd",
    city: "Richardson",
    state: "TX",
    zip: "75081",
    lat: 32.9577,
    lng: -96.6881,
    type: "recreation_center",
    badge: BADGE,
    popularityScore: 7,
  },
  {
    id: "carrollton-hebron-library",
    name: "Hebron & Josey Library",
    address: "4220 N Josey Ln",
    city: "Carrollton",
    state: "TX",
    zip: "75010",
    lat: 33.0001,
    lng: -96.9062,
    type: "library",
    badge: BADGE,
    popularityScore: 5,
  },
  {
    id: "carrollton-coyote-ridge",
    name: "Coyote Ridge Park",
    address: "2400 Old Denton Rd",
    city: "Carrollton",
    state: "TX",
    zip: "75007",
    lat: 33.0003,
    lng: -96.9176,
    type: "community_park",
    badge: BADGE,
    popularityScore: 6,
  },
  {
    id: "lewisville-library",
    name: "Lewisville Public Library",
    address: "1197 W Main St",
    city: "Lewisville",
    state: "TX",
    zip: "75067",
    lat: 33.046,
    lng: -97.0085,
    type: "library",
    badge: BADGE,
    popularityScore: 5,
  },
  {
    id: "flower-mound-cac",
    name: "Flower Mound Community Activity Center",
    address: "1200 Gerault Rd",
    city: "Flower Mound",
    state: "TX",
    zip: "75028",
    lat: 33.0195,
    lng: -97.0923,
    type: "recreation_center",
    badge: BADGE,
    popularityScore: 7,
  },
  {
    id: "grand-prairie-epic",
    name: "The Epic Recreation Center",
    address: "2960 W State Hwy 161",
    city: "Grand Prairie",
    state: "TX",
    zip: "75052",
    lat: 32.7479,
    lng: -97.0404,
    type: "recreation_center",
    badge: BADGE,
    popularityScore: 8,
  },
  {
    id: "grapevine-mills",
    name: "Grapevine Mills",
    address: "3000 Grapevine Mills Pkwy",
    city: "Grapevine",
    state: "TX",
    zip: "76051",
    lat: 32.974,
    lng: -97.041,
    type: "shopping_center",
    badge: BADGE,
    popularityScore: 9,
  },
  {
    id: "bedford-academy",
    name: "Academy Sports + Outdoors – Bedford",
    address: "1900 Airport Fwy",
    city: "Bedford",
    state: "TX",
    zip: "76021",
    lat: 32.844,
    lng: -97.142,
    type: "sporting_goods",
    badge: BADGE,
    popularityScore: 8,
  },
  {
    id: "nrh-centre",
    name: "NRH Centre",
    address: "6000 Hawk Ave",
    city: "North Richland Hills",
    state: "TX",
    zip: "76180",
    lat: 32.871,
    lng: -97.219,
    type: "recreation_center",
    badge: BADGE,
    popularityScore: 7,
  },
  {
    id: "mansfield-activities-center",
    name: "Mansfield Activities Center",
    address: "106 S Wisteria St",
    city: "Mansfield",
    state: "TX",
    zip: "76063",
    lat: 32.5634,
    lng: -97.1428,
    type: "recreation_center",
    badge: BADGE,
    popularityScore: 6,
  },
  {
    id: "las-colinas-mandalay",
    name: "Mandalay Canal at Las Colinas",
    address: "115 Mandalay Canal",
    city: "Irving",
    state: "TX",
    zip: "75039",
    lat: 32.873,
    lng: -96.946,
    type: "community_park",
    badge: BADGE,
    popularityScore: 7,
  },
  {
    id: "wylie-smith-library",
    name: "Smith Public Library",
    address: "300 Country Club Rd",
    city: "Wylie",
    state: "TX",
    zip: "75098",
    lat: 33.0175,
    lng: -96.5308,
    type: "library",
    badge: BADGE,
    popularityScore: 5,
  },
];

// Adjacency map — cities considered "close enough" that a safe zone in
// either is a reasonable meet for someone in the keyed city.
export const NEIGHBORS: Record<string, string[]> = {
  Frisco: ["Plano", "Allen", "McKinney", "Lewisville"],
  Plano: ["Frisco", "Allen", "Richardson", "Carrollton", "Garland"],
  Allen: ["Plano", "Frisco", "McKinney"],
  McKinney: ["Allen", "Frisco", "Plano"],
  Lewisville: ["Frisco", "Carrollton", "Flower Mound", "Coppell"],
  Carrollton: ["Lewisville", "Plano", "Coppell", "Richardson"],
  "Flower Mound": ["Lewisville", "Coppell", "Southlake", "Keller"],
  Coppell: ["Lewisville", "Carrollton", "Irving", "Flower Mound"],
  Southlake: ["Keller", "Flower Mound"],
  Keller: ["Southlake", "Flower Mound"],
  Richardson: ["Plano", "Garland", "Carrollton"],
  Garland: ["Plano", "Richardson", "Mesquite"],
  Mesquite: ["Garland"],
  Arlington: ["Grand Prairie"],
  "Grand Prairie": ["Arlington", "Irving", "Cedar Hill"],
  Irving: ["Coppell", "Grand Prairie"],
  "Cedar Hill": ["DeSoto", "Duncanville", "Grand Prairie"],
  DeSoto: ["Cedar Hill", "Duncanville"],
  Duncanville: ["DeSoto", "Cedar Hill", "Grand Prairie"],
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function getDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getMidpoint(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): { lat: number; lng: number } {
  return { lat: (lat1 + lat2) / 2, lng: (lng1 + lng2) / 2 };
}

function cityCoords(city: string | null | undefined): {
  lat: number;
  lng: number;
} {
  if (city && DFW_CITY_CENTROIDS[city]) return DFW_CITY_CENTROIDS[city];
  return DFW_CITY_CENTROIDS.Other;
}

function neighborsOf(city: string | null | undefined): Set<string> {
  if (!city) return new Set();
  return new Set(NEIGHBORS[city] || []);
}

/**
 * Suggest 3 meetup spots using a tiered priority system:
 *   T0: zones in buyer's city
 *   T1: zones in seller's city
 *   T2: zones in cities that neighbor either party
 *   T3: anything else, by distance to midpoint
 *
 * For same-city pairs (most common case), all 3 results come from the buyer's
 * own city sorted by popularity. For different-city pairs we round-robin
 * across the tiers so the buyer sees one option from their city, one from the
 * seller's city, then a neighbor or fallback.
 */
export function getSuggestedMeetupLocations(
  buyerCity: string | null | undefined,
  sellerCity: string | null | undefined,
  limit = 3,
): SafeZone[] {
  const sameCity =
    !!buyerCity && !!sellerCity && buyerCity === sellerCity;

  const buyer = cityCoords(buyerCity);
  const seller = cityCoords(sellerCity);
  const mid = getMidpoint(buyer.lat, buyer.lng, seller.lat, seller.lng);

  const byPop = (a: SafeZone, b: SafeZone) =>
    b.popularityScore - a.popularityScore;
  const byMidDist = (a: SafeZone, b: SafeZone) =>
    getDistanceMiles(mid.lat, mid.lng, a.lat, a.lng) -
    getDistanceMiles(mid.lat, mid.lng, b.lat, b.lng);

  const buyerCityZones = SAFE_ZONES.filter((z) => z.city === buyerCity).sort(
    byPop,
  );
  const sellerCityZones = sameCity
    ? []
    : SAFE_ZONES.filter((z) => z.city === sellerCity).sort(byPop);

  const buyerNeighbors = neighborsOf(buyerCity);
  const sellerNeighbors = neighborsOf(sellerCity);
  const neighborCities = new Set<string>([
    ...buyerNeighbors,
    ...sellerNeighbors,
  ]);
  if (buyerCity) neighborCities.delete(buyerCity);
  if (sellerCity) neighborCities.delete(sellerCity);
  const neighborZones = SAFE_ZONES.filter((z) =>
    neighborCities.has(z.city),
  ).sort(byMidDist);

  if (sameCity) {
    if (buyerCityZones.length >= limit) return buyerCityZones.slice(0, limit);
    return [...buyerCityZones, ...neighborZones].slice(0, limit);
  }

  const tiers: SafeZone[][] = [
    buyerCityZones,
    sellerCityZones,
    neighborZones,
  ];
  const used = new Set<string>();
  const result: SafeZone[] = [];
  let advanced = true;
  while (result.length < limit && advanced) {
    advanced = false;
    for (const tier of tiers) {
      if (result.length >= limit) break;
      const next = tier.find((z) => !used.has(z.id));
      if (next) {
        used.add(next.id);
        result.push(next);
        advanced = true;
      }
    }
  }
  if (result.length < limit) {
    const fallback = SAFE_ZONES.filter((z) => !used.has(z.id)).sort(byMidDist);
    for (const z of fallback) {
      if (result.length >= limit) break;
      result.push(z);
    }
  }

  return result;
}

/**
 * All safe zones, sorted by relevance for the buyer/seller pair — used by
 * the "Browse all safe zones" expander.
 */
export function getAllZonesByRelevance(
  buyerCity: string | null | undefined,
  sellerCity: string | null | undefined,
): SafeZone[] {
  const buyer = cityCoords(buyerCity);
  const seller = cityCoords(sellerCity);
  const mid = getMidpoint(buyer.lat, buyer.lng, seller.lat, seller.lng);
  const buyerNeighbors = neighborsOf(buyerCity);
  const sellerNeighbors = neighborsOf(sellerCity);

  function tier(city: string): number {
    if (city === buyerCity) return 0;
    if (city === sellerCity) return 1;
    if (buyerNeighbors.has(city) || sellerNeighbors.has(city)) return 2;
    return 3;
  }

  return [...SAFE_ZONES].sort((a, b) => {
    const ta = tier(a.city);
    const tb = tier(b.city);
    if (ta !== tb) return ta - tb;
    const da = getDistanceMiles(mid.lat, mid.lng, a.lat, a.lng);
    const db = getDistanceMiles(mid.lat, mid.lng, b.lat, b.lng);
    return da - db;
  });
}

// ----- Zipcode-based matching (preferred) ----------------------------------
import { getZipcodeCoords } from "@/lib/zipcodes";

export interface SuggestedZone {
  zone: SafeZone;
  buyerMiles: number;
  sellerMiles: number;
  combined: number;
}

/**
 * Score each safe zone by combined distance from buyer and seller zipcodes.
 * Lower combined miles → better match. Naturally favors zones close to both
 * parties without arbitrary midpoint math.
 *
 * If a zipcode is unknown, falls back to the other party's zipcode (so the
 * algorithm still produces sensible results when one side is anonymous).
 * If both are unknown, sorts by popularity.
 */
export function getSuggestedMeetupLocationsByZip(
  buyerZipcode: string | null | undefined,
  sellerZipcode: string | null | undefined,
  limit = 3,
): SuggestedZone[] {
  const buyer = getZipcodeCoords(buyerZipcode);
  const seller = getZipcodeCoords(sellerZipcode);

  if (!buyer && !seller) {
    return [...SAFE_ZONES]
      .sort((a, b) => b.popularityScore - a.popularityScore)
      .slice(0, limit)
      .map((zone) => ({ zone, buyerMiles: 0, sellerMiles: 0, combined: 0 }));
  }

  const ref1 = buyer ?? seller!;
  const ref2 = seller ?? buyer!;

  return SAFE_ZONES.map((zone) => {
    const buyerMiles = getDistanceMiles(ref1.lat, ref1.lng, zone.lat, zone.lng);
    const sellerMiles = getDistanceMiles(
      ref2.lat,
      ref2.lng,
      zone.lat,
      zone.lng,
    );
    const combined = buyerMiles + sellerMiles - zone.popularityScore * 0.05;
    return { zone, buyerMiles, sellerMiles, combined };
  })
    .sort((a, b) => a.combined - b.combined)
    .slice(0, limit);
}

/**
 * Full safe zone list for the buyer/seller pair, sorted by combined distance.
 * Used for the "Browse all safe zones" expander.
 */
export function getAllZonesByCombinedDistance(
  buyerZipcode: string | null | undefined,
  sellerZipcode: string | null | undefined,
): SuggestedZone[] {
  const buyer = getZipcodeCoords(buyerZipcode);
  const seller = getZipcodeCoords(sellerZipcode);

  if (!buyer && !seller) {
    return [...SAFE_ZONES]
      .sort((a, b) => b.popularityScore - a.popularityScore)
      .map((zone) => ({ zone, buyerMiles: 0, sellerMiles: 0, combined: 0 }));
  }

  const ref1 = buyer ?? seller!;
  const ref2 = seller ?? buyer!;

  return SAFE_ZONES.map((zone) => {
    const buyerMiles = getDistanceMiles(ref1.lat, ref1.lng, zone.lat, zone.lng);
    const sellerMiles = getDistanceMiles(
      ref2.lat,
      ref2.lng,
      zone.lat,
      zone.lng,
    );
    return {
      zone,
      buyerMiles,
      sellerMiles,
      combined: buyerMiles + sellerMiles,
    };
  }).sort((a, b) => a.combined - b.combined);
}

// ----- Directions URL ------------------------------------------------------

interface DirectionsInput {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  label?: string | null;
}

export function getDirectionsUrl(input: DirectionsInput): string {
  if (input.lat != null && input.lng != null) {
    let url = `https://www.google.com/maps/search/?api=1&query=${input.lat},${input.lng}`;
    if (input.label) url += `&query_place=${encodeURIComponent(input.label)}`;
    return url;
  }
  if (input.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(input.address)}`;
  }
  return "https://www.google.com/maps";
}

/**
 * @deprecated Use getDirectionsUrl({lat, lng, label}) instead.
 */
export function getUniversalDirectionsUrl(
  lat: number,
  lng: number,
  label?: string,
): string {
  return getDirectionsUrl({ lat, lng, label });
}

const ZONE_EMOJI: Record<SafeZoneType, string> = {
  sporting_goods: "🏟️",
  recreation_center: "🏊",
  coffee_shop: "☕",
  community_park: "🌳",
  shopping_center: "🛍️",
  library: "📚",
};

const ZONE_LABEL: Record<SafeZoneType, string> = {
  sporting_goods: "Sporting Goods",
  recreation_center: "Recreation Center",
  coffee_shop: "Coffee Shop",
  community_park: "Community Park",
  shopping_center: "Shopping Center",
  library: "Library",
};

export function getZoneTypeEmoji(type: SafeZoneType): string {
  return ZONE_EMOJI[type] || "📍";
}

export function getZoneTypeLabel(type: SafeZoneType): string {
  return ZONE_LABEL[type] || "Safe Zone";
}

export function getSafeZoneById(id: string): SafeZone | undefined {
  return SAFE_ZONES.find((z) => z.id === id);
}
