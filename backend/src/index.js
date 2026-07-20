import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";
import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import surveyRouter from "./routes/survey.js";
import eduRouter from "./routes/edu.js";
import judgmentRouter from "./routes/judgment.js";

dotenv.config();

export const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS"));
    },
  })
);
app.use(express.json());

app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/survey", surveyRouter);
app.use("/api/edu", eduRouter);
app.use("/api/judgment", judgmentRouter);

export function startServer(port = process.env.PORT || 4000) {
  return app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
