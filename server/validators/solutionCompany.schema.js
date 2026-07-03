import { z } from "zod";

export const idSchema = z.object({ id: z.coerce.number().int().positive() });

export const listSchema = z.object({
  q: z.string().trim().optional(),
  is_active: z.boolean().optional(),
  page: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().optional(),
});

export const saveSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1, "솔루션사명을 입력하세요"),
  code: z.string().trim().nullable().optional(),
  contact_name: z.string().trim().nullable().optional(),
  contact_phone: z.string().trim().nullable().optional(),
  contact_email: z.string().trim().nullable().optional(),
  memo: z.string().trim().nullable().optional(),
  is_active: z.boolean().default(true),
  sort: z.coerce.number().int().default(0),
  parent_id: z.coerce.number().int().positive().nullable().optional(),
});

export const reorderSchema = z.object({
  id: z.coerce.number().int().positive(),
  parent_id: z.coerce.number().int().positive().nullable().optional(),
  before_id: z.coerce.number().int().positive().nullable().optional(),
});
