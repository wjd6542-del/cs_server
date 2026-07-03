import { z } from "zod";

export const idSchema = z.object({ id: z.coerce.number().int().positive() });

export const listSchema = z.object({
  party: z.enum(["VENDOR", "GAME_COMPANY", "SOLUTION"]).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  vendor_id: z.coerce.number().int().positive().optional(),
  game_company_id: z.coerce.number().int().positive().optional(),
  solution_company_id: z.coerce.number().int().positive().optional(),
  tag_ids: z.array(z.coerce.number().int().positive()).optional(),
  q: z.string().trim().optional(),
  date_from: z.string().trim().optional(),
  date_to: z.string().trim().optional(),
  page: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().optional(),
});

export const saveSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    party: z.enum(["VENDOR", "GAME_COMPANY", "SOLUTION"]),
    vendor_id: z.coerce.number().int().positive().nullable().optional(),
    game_company_id: z.coerce.number().int().positive().nullable().optional(),
    solution_company_id: z.coerce.number().int().positive().nullable().optional(),
    title: z.string().trim().min(1, "제목을 입력하세요"),
    category: z.string().trim().nullable().optional(),
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).default("OPEN"),
    priority: z.coerce.number().int().min(0).max(2).default(0),
    assignee_id: z.coerce.number().int().positive().nullable().optional(),
    tag_ids: z.array(z.coerce.number().int().positive()).optional(),
  })
  .refine(
    (d) => (d.party === "VENDOR" ? !!d.vendor_id : d.party === "GAME_COMPANY" ? !!d.game_company_id : !!d.solution_company_id),
    { message: "응대 대상을 선택하세요", path: ["party"] },
  );

export const statusSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
});

export const bulkStatusSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, "선택된 항목이 없습니다"),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
});

export const messageSchema = z.object({
  ticket_id: z.coerce.number().int().positive(),
  content: z.string().trim().min(1, "내용을 입력하세요"),
  is_internal: z.boolean().default(false),
});
