import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getAuth } from '../../middleware/auth';
import { isoDateSchema, uuidSchema, validate } from '../../middleware/validate';
import { ok } from '../../utils/response';
import * as service from './dashboard.service';
import { search } from '../reports/reports.service';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  validate({
    query: z.object({
      branchId: uuidSchema.optional(),
      date: isoDateSchema.optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const dashboard = await service.getDashboard(getAuth(req), req.query as never);
    return ok(res, dashboard, 'Dashboard retrieved successfully');
  }),
);

dashboardRouter.get(
  '/trends',
  validate({
    query: z.object({
      branchId: uuidSchema.optional(),
      days: z.coerce.number().int().min(2).max(90).default(14),
    }),
  }),
  asyncHandler(async (req, res) => {
    const trends = await service.getTrends(getAuth(req), req.query as never);
    return ok(res, trends, 'Trends retrieved successfully');
  }),
);

export const searchRouter = Router();

searchRouter.get(
  '/',
  validate({
    query: z.object({
      q: z.string().trim().min(2).max(80),
      branchId: uuidSchema.optional(),
      limit: z.coerce.number().int().min(1).max(25).default(8),
    }),
  }),
  asyncHandler(async (req, res) => {
    const results = await search(getAuth(req), req.query as never);
    return ok(res, results, 'Search completed successfully');
  }),
);
