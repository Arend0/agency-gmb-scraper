const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.businessStatus,places.primaryType,places.types,places.googleMapsUri";

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
};

export class GooglePlacesService {
  constructor(private readonly apiKey: string) {}

  async textSearch(
    keyword: string,
    location: string,
  ): Promise<GooglePlacesLeadFields[]> {
    return this.requestSearchText(keyword, location, false);
  }

  private async requestSearchText(
    keyword: string,
    location: string,
    isRetry: boolean,
  ): Promise<GooglePlacesLeadFields[]> {
    const res = await fetch(SEARCH_TEXT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: `${keyword} in ${location}`,
        maxResultCount: 20,
      }),
    });

    if (res.status === 429 && !isRetry) {
      await new Promise((r) => setTimeout(r, 1000));
      return this.requestSearchText(keyword, location, true);
    }

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(
        `Google Places API error ${res.status}: ${body || res.statusText}`,
      ) as Error & { status: number };
      err.status = res.status;
      throw err;
    }

    const data = (await res.json()) as SearchTextResponse;
    const places = data.places ?? [];

    return places.map((p) => this.normalizePlace(p));
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
