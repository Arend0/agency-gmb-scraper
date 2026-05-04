const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

// Note: when paginating we also need places.nextPageToken in the response.
// Field mask drives the Places API pricing tier (currently "Pro" SKU).
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.businessStatus,places.primaryType,places.types,places.googleMapsUri,nextPageToken";

export type GooglePlacesLeadFields = {
  placeId: string;
  businessName: string;
  formattedAddress: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUri: string | null;
  websiteUri: string | null;
  nationalPhoneNumber: string | null;
  internationalPhoneNumber: string | null;
  rating: number | null;
  userRatingCount: number | null;
  businessStatus: string | null;
  primaryType: string | null;
  types: string[];
};

type PlaceApiObject = {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  primaryType?: string;
  types?: string[];
  googleMapsUri?: string;
};

type SearchTextResponse = {
  places?: PlaceApiObject[];
  nextPageToken?: string;
};

export class GooglePlacesService {
  constructor(private readonly apiKey: string) {}

  /**
   * Search for places. Will paginate up to maxResults (capped at 50).
   * Each Google page returns up to 20; we may make up to 3 paginated calls.
   * Google requires a short delay before nextPageToken becomes valid.
   */
  async textSearch(
    keyword: string,
    location: string,
    maxResults = 50,
  ): Promise<GooglePlacesLeadFields[]> {
    const cap = Math.min(Math.max(maxResults, 1), 50);
    const collected: GooglePlacesLeadFields[] = [];
    const seenIds = new Set<string>();
    let pageToken: string | undefined;
    let pagesFetched = 0;
    const maxPages = 3; // 3 × 20 = 60, we trim to cap

    while (collected.length < cap && pagesFetched < maxPages) {
      const { places, nextPageToken } = await this.requestSearchText(
        keyword,
        location,
        pageToken,
        false,
      );
      pagesFetched += 1;

      for (const p of places) {
        if (collected.length >= cap) break;
        if (!seenIds.has(p.placeId)) {
          seenIds.add(p.placeId);
          collected.push(p);
        }
      }

      if (!nextPageToken || collected.length >= cap) break;
      pageToken = nextPageToken;

      // Google requires a brief pause before the next-page token becomes valid.
      await new Promise((r) => setTimeout(r, 2000));
    }

    return collected;
  }

  private async requestSearchText(
    keyword: string,
    location: string,
    pageToken: string | undefined,
    isRetry: boolean,
  ): Promise<{ places: GooglePlacesLeadFields[]; nextPageToken?: string }> {
    const body: Record<string, unknown> = {
      textQuery: `${keyword} in ${location}`,
      maxResultCount: 20,
    };
    if (pageToken) {
      body.pageToken = pageToken;
    }

    const res = await fetch(SEARCH_TEXT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429 && !isRetry) {
      await new Promise((r) => setTimeout(r, 1000));
      return this.requestSearchText(keyword, location, pageToken, true);
    }

    if (!res.ok) {
      const text = await res.text();
      const err = new Error(
        `Google Places API error ${res.status}: ${text || res.statusText}`,
      ) as Error & { status: number };
      err.status = res.status;
      throw err;
    }

    const data = (await res.json()) as SearchTextResponse;
    const places = (data.places ?? []).map((p) => this.normalizePlace(p));
    return { places, nextPageToken: data.nextPageToken };
  }

  private normalizePlace(p: PlaceApiObject): GooglePlacesLeadFields {
    const placeId = this.resolvePlaceId(p);
    const businessName = p.displayName?.text?.trim() || "Unknown";
    const { city, country } = parseCityCountry(p.formattedAddress);

    return {
      placeId,
      businessName,
      formattedAddress: p.formattedAddress ?? null,
      city,
      country,
      latitude: p.location?.latitude ?? null,
      longitude: p.location?.longitude ?? null,
      googleMapsUri: p.googleMapsUri ?? null,
      websiteUri: p.websiteUri ?? null,
      nationalPhoneNumber: p.nationalPhoneNumber ?? null,
      internationalPhoneNumber: p.internationalPhoneNumber ?? null,
      rating: p.rating ?? null,
      userRatingCount:
        p.userRatingCount !== undefined && p.userRatingCount !== null
          ? Math.trunc(p.userRatingCount)
          : null,
      businessStatus: p.businessStatus ?? null,
      primaryType: p.primaryType ?? null,
      types: Array.isArray(p.types) ? [...p.types] : [],
    };
  }

  private resolvePlaceId(p: PlaceApiObject): string {
    if (p.id && String(p.id).trim()) {
      return String(p.id).trim();
    }
    const name = p.name?.trim();
    if (name?.startsWith("places/")) {
      return name.slice("places/".length);
    }
    if (name) {
      return name;
    }
    throw new Error("Place result missing id and name; cannot map to placeId");
  }
}

function parseCityCountry(formattedAddress: string | undefined): {
  city: string | null;
  country: string | null;
} {
  if (!formattedAddress?.trim()) {
    return { city: null, country: null };
  }
  const parts = formattedAddress.split(",").map((s) => s.trim());
  if (parts.length < 2) {
    return { city: parts[0] ?? null, country: null };
  }
  const country = parts[parts.length - 1] || null;
  const city = parts[parts.length - 2] || null;
  return { city, country };
}
