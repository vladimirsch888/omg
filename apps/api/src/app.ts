import express from "express";
import cors from "cors";
import { config } from "./config";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { clientsRouter } from "./modules/clients/clients.routes";
import { projectsRouter } from "./modules/projects/projects.routes";
import { dictionariesRouter } from "./modules/dictionaries/dictionaries.routes";
import { operationsRouter } from "./modules/operations/operations.routes";
import { requestsRouter } from "./modules/requests/requests.routes";
import { timeEntriesRouter } from "./modules/timeEntries/timeEntries.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { errorMiddleware } from "./middleware/error.middleware";

export const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/dictionaries", dictionariesRouter);
app.use("/api/operations", operationsRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/time-entries", timeEntriesRouter);
app.use("/api/reports", reportsRouter);

app.use(errorMiddleware);
