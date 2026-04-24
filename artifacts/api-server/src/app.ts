import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve static files from the 'public' directory if it exists
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPath = path.resolve(__dirname, "public");
app.use(express.static(publicPath));

// Catch-all route to serve the SPA index.html
app.get("*", (req, res, next) => {
  if (req.url.startsWith("/api")) return next();
  res.sendFile(path.join(publicPath, "index.html"), (err) => {
    if (err) {
      // If index.html is missing, just send a 404
      res.status(404).send("Not Found");
    }
  });
});

export default app;
