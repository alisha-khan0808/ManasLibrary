import type { Response } from 'express';
import type { ApiSuccess, PaginationMeta } from '@manas/shared';

export function ok<T>(res: Response, data: T, message = 'Operation completed successfully') {
  const body: ApiSuccess<T> = { success: true, data, message };
  return res.status(200).json(body);
}

export function created<T>(res: Response, data: T, message = 'Created successfully') {
  const body: ApiSuccess<T> = { success: true, data, message };
  return res.status(201).json(body);
}

export function paginated<T>(
  res: Response,
  data: T[],
  meta: PaginationMeta,
  message = 'Operation completed successfully',
) {
  const body: ApiSuccess<T[]> = { success: true, data, message, meta };
  return res.status(200).json(body);
}

export function noContent(res: Response) {
  return res.status(204).send();
}

export function buildPaginationMeta(
  page: number,
  pageSize: number,
  total: number,
): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}
