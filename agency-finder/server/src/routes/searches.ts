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
          res.status(503).json({ error: "GOOGLE_MAPS_API_KEY is not configured" });
          return;
        }

        const fromApi = await placesService.textSearch(keyword, location);
        const totalFound = fromApi.length;

        const filtered = fromApi.filter((lead) =>
          matchesFilters(lead, {
            keyword,
            location,
            hasPhone,
            hasWebsite,
            minRating,
          }),
        );

        const leadsSaved: Awaited<ReturnType<typeof prisma.lead.upsert>>[] = [];

        for (const row of filtered) {
          // COMPLIANCE TODO: review Google Maps Platform retention rules before production (most fields max 30 days)
          leadsSaved.push(
            await prisma.lead.upsert({
              where: { placeId: row.placeId },
              create: {
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
              update: {
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

        const searchRun = await prisma.searchRun.create({
          data: {
            keyword,
            location,
            country: null,
            resultsFound: totalFound,
            resultsSaved: leadsSaved.length,
          },
        });

        res.json({
          searchRunId: searchRun.id,
          totalFound,
          totalSaved: leadsSaved.length,
          leads: leadsSaved,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  return router;
}
