import { Router, type IRouter } from "express";
import cmsRouter from "./cms";
import healthRouter from "./health";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cmsRouter);
router.use(storageRouter);

export default router;
