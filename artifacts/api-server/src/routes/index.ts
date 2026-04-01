import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import connectionsRouter from "./connections.js";
import databasesRouter from "./databases.js";
import collectionsRouter from "./collections.js";
import documentsRouter from "./documents.js";
import queryRouter from "./query.js";
import schemaRouter from "./schema.js";
import indexesRouter from "./indexes.js";
import importexportRouter from "./importexport.js";
import savedqueriesRouter from "./savedqueries.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(connectionsRouter);
router.use(databasesRouter);
router.use(collectionsRouter);
router.use(documentsRouter);
router.use(queryRouter);
router.use(schemaRouter);
router.use(indexesRouter);
router.use(importexportRouter);
router.use(savedqueriesRouter);

export default router;
