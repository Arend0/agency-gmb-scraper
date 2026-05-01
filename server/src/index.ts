import "dotenv/config";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./lib/prisma.js";
import { createLeadsRouter } from "./routes/leads.js";
import { createSearchesRouter } from "./routes/searches.js";
import { GooglePlacesService } from "./services/googlePlaces.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.set('trust proxy', 1);
const port = Number(process.env.PORT) || 3001;
const devCorsFallback = "http://localhost:5173";
/** In production without CORS_ORIGIN, reflect Origin (same-host SPA works). Prefer setting CORS_ORIGIN to your Railway HTTPS URL explicitly. */
const corsOriginResolved =
  process.env.CORS_ORIGIN?.trim() ||
  (process.env.NODE_ENV === "production" ? true : devCorsFallback);

const placesService = new GooglePlacesService(
  process.env.GOOGLE_MAPS_API_KEY ?? "",
);

const searchRouteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(helmet());
app.use(
  cors({
    origin: corsOriginResolved,
    credentials: true,
  }),
);
app.use(express.json());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
});
app.use(globalLimiter);

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "error" });
  }
});

app.use(
  "/api",
  createSearchesRouter(placesService, searchRouteLimiter),
);

app.use("/api/leads", createLeadsRouter());

if (process.env.NODE_ENV === "production") {
  const clientDist =
    process.env.CLIENT_DIST_PATH?.trim() ||
    join(__dirname, "..", "..", "client", "dist");

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false }));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        next();
        return;
      }
      if (req.path.startsWith("/api")) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.sendFile(join(clientDist, "index.html"), (err) =>
        err ? next(err) : undefined,
      );
    });
    console.info(`Serving static SPA from ${clientDist}`);
  } else {
    console.warn(
      `Production NODE_ENV set but CLIENT_DIST=${clientDist} not found`,
    );
  }
}

app.use(
  (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    console.error("[server error]", err);

    if (res.headersSent) {
      return;
    }

    const statusFromErr =
      err !== null &&
      typeof err === "object" &&
      "status" in err &&
      typeof (err as { status?: unknown }).status === "number"
        ? (err as { status: number }).status
        : undefined;

    const status =
      typeof statusFromErr === "number" &&
      statusFromErr >= 400 &&
      statusFromErr < 600
        ? statusFromErr
        : 500;

    if (status >= 500) {
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    let message =
      err instanceof Error && typeof err.message === "string"
        ? err.message.trim()
        : "";
    if (!message) {
      message = "Request failed";
    } else if (message.length > 2000) {
      message = `${message.slice(0, 2000)}…`;
    }

    res.status(status).json({ error: message });
  },
);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
