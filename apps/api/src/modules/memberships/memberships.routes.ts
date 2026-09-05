import { Router } from 'express';
import { z } from 'zod';
import {
  MembershipPlanStatus,
  Permission,
  type MembershipPlan,
} from '@manas/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { idParamSchema, moneySchema, validate } from '../../middleware/validate';
import { requirePermission } from '../../guards/rbac';
import { query, queryOne } from '../../database/pool';
import { created, ok } from '../../utils/response';
import { notFound } from '../../utils/errors';
import { normalizeMoney } from '../../domain/money';

/**
 * Membership plans are franchise-wide, not branch-owned: the PRD's plan fields
 * carry no branch_id, and pricing is set centrally. Only a Super Admin may
 * change them; every authenticated user may read them for the admission form.
 */
export const membershipsRouter = Router();

const createPlanSchema = z.object({
  name: z.string().trim().min(2).max(80),
  duration_days: z.coerce.number().int().min(1).max(3650),
  price: moneySchema,
  description: z.string().trim().max(400).optional().nullable(),
  status: z.nativeEnum(MembershipPlanStatus).default(MembershipPlanStatus.ACTIVE),
});

const updatePlanSchema = createPlanSchema.partial();

const listPlansSchema = z.object({
  status: z.nativeEnum(MembershipPlanStatus).optional(),
});

membershipsRouter.get(
  '/',
  validate({ query: listPlansSchema }),
  asyncHandler(async (req, res) => {
    const status = (req.query as { status?: string }).status;

    const plans = await query<MembershipPlan>(
      `SELECT id, name, duration_days, price::text AS price, description, status,
              created_at, updated_at
         FROM public.membership_plans
        WHERE ($1::plan_status IS NULL OR status = $1::plan_status)
        ORDER BY duration_days ASC`,
      [status ?? null],
    );

    return ok(res, plans, 'Membership plans retrieved successfully');
  }),
);

membershipsRouter.post(
  '/',
  requirePermission(Permission.MEMBERSHIP_PLAN_MANAGE),
  validate({ body: createPlanSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createPlanSchema>;

    const plan = await queryOne<MembershipPlan>(
      `INSERT INTO public.membership_plans (name, duration_days, price, description, status)
       VALUES ($1, $2, $3, $4, $5::plan_status)
       RETURNING id, name, duration_days, price::text AS price, description, status,
                 created_at, updated_at`,
      [
        body.name,
        body.duration_days,
        normalizeMoney(body.price),
        body.description ?? null,
        body.status,
      ],
    );

    return created(res, plan, 'Membership plan created successfully');
  }),
);

membershipsRouter.patch(
  '/:id',
  requirePermission(Permission.MEMBERSHIP_PLAN_MANAGE),
  validate({ params: idParamSchema, body: updatePlanSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updatePlanSchema>;

    const plan = await queryOne<MembershipPlan>(
      `UPDATE public.membership_plans
          SET name          = coalesce($2, name),
              duration_days = coalesce($3, duration_days),
              price         = coalesce($4::numeric, price),
              description   = coalesce($5, description),
              status        = coalesce($6::plan_status, status)
        WHERE id = $1
        RETURNING id, name, duration_days, price::text AS price, description, status,
                  created_at, updated_at`,
      [
        req.params.id,
        body.name ?? null,
        body.duration_days ?? null,
        body.price ? normalizeMoney(body.price) : null,
        body.description ?? null,
        body.status ?? null,
      ],
    );

    if (!plan) throw notFound('Membership plan');

    // Existing admissions keep the price they were sold at — invoices store
    // their own amounts, so a plan price change is never retroactive.
    return ok(res, plan, 'Membership plan updated successfully');
  }),
);

membershipsRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const plan = await queryOne<MembershipPlan>(
      `SELECT id, name, duration_days, price::text AS price, description, status,
              created_at, updated_at
         FROM public.membership_plans WHERE id = $1`,
      [req.params.id],
    );

    if (!plan) throw notFound('Membership plan');
    return ok(res, plan, 'Membership plan retrieved successfully');
  }),
);
