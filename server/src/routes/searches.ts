import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import type {
  GooglePlacesLeadFields,
  GooglePlacesService,
} from "../services/googlePlaces.js";

const MAX_RESULTS_PER_SEARCH = 50;

const searchBodySchema = z.object({
  keyword: z.string().min(2),
  location: z.string().min(2),
  hasPhone: z.boolean().optional(),
  hasWebsite: z.boolean().optional(),
  minRating: z.number().optional(),
});

function matchesFilters(
  lead: GooglePlacesLeadFields,
  filters: z.infer<typeof searchBodySchema>,
): boolean {
  if (
    filters.hasPhone === true &&
    !lead.nationalPhoneNumber &&
    !lead.internationalPhoneNumber
  ) {
    return false;
  }
  if (filters.hasWebsite === true && !lead.websiteUri) {
    return false;
  }
  if (filters.minRating !== undefined) {
    if (lead.rating === null || lead.rating === undefined) {
      return false;
    }
    if (lead.rating < filters.minRating) {
      return false;
    }
  }
  return true;
}

export function createSearchesRouter(
  placesService: GooglePlacesService,
  searchLimiter: RequestHandler,
): Router {
  const router = Router();

  router.post(
    "/searches",
    searchLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = searchBodySchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: "Invalid body",
            details: parsed.error.flatten(),
          });
          return;
        }

        const { keyword, location, hasPhone, hasWebsite, minRating } =
          parsed.data;

        if (!process.env.GOOGLE_MAPS_API_KEY?.trim()) {
          res
            .status(503)
            .json({ error: "GOOGLE_MAPS_API_KEY is not configured" });
          return;
        }

        // 1. Get results from Google (capped at MAX_RESULTS_PER_SEARCH)
        const fromApi = await placesService.textSearch(keyword, location);
        const trimmed = fromApi.slice(0, MAX_RESULTS_PER_SEARCH);
        const totalFound = trimmed.length;

        // 2. Apply user filters (hasPhone, hasWebsite, minRating)
        const filtered = trimmed.filter((lead) =>
          matchesFilters(lead, {
            keyword,
            location,
            hasPhone,
            hasWebsite,
            minRating,
          }),
        );

        // 3. Check which placeIds we already have in DB
        const placeIds = filtered.map((row) => row.placeId);
        const existing = await prisma.lead.findMany({
          where: { placeId: { in: placeIds } },
          select: { placeId: true },
        });
        const existingIds = new Set(existing.map((row) => row.placeId));

        // 4. Split into new vs duplicates
        const newRows = filtered.filter((row) => !existingIds.has(row.placeId));
        const duplicatesSkipped = filtered.length - newRows.length;

        // 5. Save only the new ones (no upsert — we already know they're new)
        const leadsSaved: Awaited<ReturnType<typeof prisma.lead.create>>[] = [];

        for (const row of newRows) {
          // COMPLIANCE TODO: review Google Maps Platform retention rules before production (most fields max 30 days)
          leadsSaved.push(
            await prisma.lead.create({
              data: {
                placeId: row.placeId,
                businessName: row.businessName,
                formattedAddress: row.formattedAddress,
                city: row.city,
                country: row.country,
                latitude: row.latitude,
                longitude: row.longitude,
                googleMapsUri: row.googleMapsUri,
                websiteUri: row.websiteUri,
                nationalPhoneNumber: row.nationalPhoneNumber,
                internationalPhoneNumber: row.internationalPhoneNumber,
                rating: row.rating,
                userRatingCount: row.userRatingCount,
                businessStatus: row.businessStatus,
                primaryType: row.primaryType,
                types: row.types,
                searchKeyword: keyword,
                searchLocation: location,
              },
            }),
          );
        }

        // 6. Record the search run
        const searchRun = await prisma.searchRun.create({
          data: {
            keyword,
            location,
            country: null,
            resultsFound: totalFound,
            resultsSaved: leadsSaved.length,
          },
        });

        // 7. Return clear stats so the UI can tell the user what happened
        res.json({
          searchRunId: searchRun.id,
          totalFound,
          totalSaved: leadsSaved.length,
          duplicatesSkipped,
          filteredOut: trimmed.length - filtered.length,
          leads: leadsSaved,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  return router;
}
