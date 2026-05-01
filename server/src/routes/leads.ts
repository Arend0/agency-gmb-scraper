import { Router, type NextFunction, type Request, type Response } from "express";
import { stringify } from "csv-stringify";
import type { Prisma } from "@prisma/client";
import type { Lead } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export const LEAD_STATUSES = [
  "NEW",
  "QUALIFIED",
  "CONTACTED",
  "NOT_RELEVANT",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

const leadFiltersFields = z.object({
  status: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  hasPhone: z.boolean().optional(),
  hasWebsite: z.boolean().optional(),
  search: z.string().optional(),
});

const listQuerySchema = leadFiltersFields.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const exportBodySchema = leadFiltersFields.strict();

const patchBodySchema = z
  .object({
    status: z.enum(LEAD_STATUSES).optional(),
    notes: z.string().optional(),
  })
  .strict()
  .refine((d) => d.status !== undefined || d.notes !== undefined, {
    message: "Provide at least one of: status, notes",
  });

const CSV_COLUMNS = [
  "businessName",
  "internationalPhoneNumber",
  "websiteUri",
  "city",
  "country",
  "rating",
  "userRatingCount",
  "status",
  "notes",
  "googleMapsUri",
] as const;

function csvRow(lead: Lead): Record<(typeof CSV_COLUMNS)[number], string | number | null> {
  return {
    businessName: lead.businessName,
    internationalPhoneNumber: lead.internationalPhoneNumber,
    websiteUri: lead.websiteUri,
    city: lead.city,
    country: lead.country,
    rating: lead.rating,
    userRatingCount: lead.userRatingCount,
    status: lead.status,
    notes: lead.notes,
    googleMapsUri: lead.googleMapsUri,
  };
}

export type ParsedLeadFilters = z.infer<typeof leadFiltersFields>;

export function buildLeadWhere(filters: ParsedLeadFilters): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [];

  if (filters.status?.trim()) {
    and.push({ status: filters.status.trim() });
  }
  if (filters.city?.trim()) {
    and.push({
      city: { equals: filters.city.trim(), mode: "insensitive" },
    });
  }
  if (filters.country?.trim()) {
    and.push({
      country: { equals: filters.country.trim(), mode: "insensitive" },
    });
  }
  if (filters.search?.trim()) {
    and.push({
      businessName: {
        contains: filters.search.trim(),
        mode: "insensitive",
      },
    });
  }

  if (filters.hasPhone === true) {
    and.push({
      OR: [
        {
          nationalPhoneNumber: {
            not: null,
          },
        },
        {
          internationalPhoneNumber: {
            not: null,
          },
        },
      ],
    });
  } else if (filters.hasPhone === false) {
    and.push({
      nationalPhoneNumber: null,
      internationalPhoneNumber: null,
    });
  }

  if (filters.hasWebsite === true) {
    and.push({
      AND: [
        { websiteUri: { not: null } },
        { NOT: { websiteUri: { equals: "" } } },
      ],
    });
  } else if (filters.hasWebsite === false) {
    and.push({
      OR: [{ websiteUri: null }, { websiteUri: { equals: "" } }],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

function parseQueryBoolean(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === true || v === false) return v;
  if (typeof v === "string") {
    const s = v.toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return undefined;
}

function paramId(req: Request): string | undefined {
  const raw = req.params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

export function createLeadsRouter(): Router {
  const router = Router();

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = req.query;
      const hasPhoneRaw = parseQueryBoolean(q.hasPhone);
      const hasWebsiteRaw = parseQueryBoolean(q.hasWebsite);

      const { hasPhone: _hq, hasWebsite: _hw, ...rest } = q;

      const parsed = listQuerySchema.safeParse({
        ...rest,
        hasPhone: hasPhoneRaw,
        hasWebsite: hasWebsiteRaw,
      });

      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid query",
          details: parsed.error.flatten(),
        });
        return;
      }

      const { page, limit, ...filterFields } = parsed.data;
      const where = buildLeadWhere(filterFields);
      const skip = (page - 1) * limit;

      const [leads, total] = await Promise.all([
        prisma.lead.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.lead.count({ where }),
      ]);

      res.json({ leads, total, page, limit });
    } catch (e) {
      next(e);
    }
  });

  router.post(
    "/export",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = exportBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          res.status(400).json({
            error: "Invalid body",
            details: parsed.error.flatten(),
          });
          return;
        }

        const where = buildLeadWhere(parsed.data);
        const ts = new Date().toISOString().replace(/[:.]/g, "-");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="leads-${ts}.csv"`,
        );

        const stringifier = stringify({
          header: true,
          columns: [...CSV_COLUMNS],
        });

        stringifier.on("error", (err) => next(err));
        stringifier.pipe(res);

        const batchSize = 500;
        let skip = 0;

        try {
          for (;;) {
            const batch = await prisma.lead.findMany({
              where,
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              skip,
              take: batchSize,
            });

            if (batch.length === 0) break;

            for (const lead of batch) {
              const row = csvRow(lead);
              const ok = stringifier.write(row);
              if (!ok) {
                await new Promise<void>((resolve) => {
                  stringifier.once("drain", resolve);
                });
              }
            }

            skip += batchSize;
            if (batch.length < batchSize) break;
          }
          stringifier.end();
        } catch (e) {
          stringifier.destroy(e as Error);
          throw e;
        }
      } catch (e) {
        next(e);
      }
    },
  );

  router.get(
    "/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = paramId(req);
        if (!id) {
          res.status(400).json({ error: "Invalid id" });
          return;
        }
        const lead = await prisma.lead.findUnique({
          where: { id },
        });
        if (!lead) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        res.json(lead);
      } catch (e) {
        next(e);
      }
    },
  );

  router.patch(
    "/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = paramId(req);
        if (!id) {
          res.status(400).json({ error: "Invalid id" });
          return;
        }

        const parsed = patchBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          res.status(400).json({
            error: "Invalid body",
            details: parsed.error.flatten(),
          });
          return;
        }

        const existing = await prisma.lead.findUnique({
          where: { id },
        });
        if (!existing) {
          res.status(404).json({ error: "Not found" });
          return;
        }

        const data: Prisma.LeadUpdateInput = {};
        if (parsed.data.status !== undefined) {
          data.status = parsed.data.status;
        }
        if (parsed.data.notes !== undefined) {
          data.notes = parsed.data.notes;
        }

        const lead = await prisma.lead.update({
          where: { id },
          data,
        });
        res.json(lead);
      } catch (e) {
        next(e);
      }
    },
  );

  return router;
}
