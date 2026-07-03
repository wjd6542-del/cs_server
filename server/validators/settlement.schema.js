import { z } from "zod";

export const idSchema = z.object({ id: z.coerce.number().int().positive() });

export const listSchema = z.object({
  type: z.enum(["VENDOR", "GAME_COMPANY"]).optional(),
  status: z.enum(["PENDING", "PARTIAL", "DONE"]).optional(),
  vendor_id: z.coerce.number().int().positive().optional(),
  game_company_id: z.coerce.number().int().positive().optional(),
  date_from: z.string().trim().optional(),
  date_to: z.string().trim().optional(),
  page: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().optional(),
});

export const saveSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    type: z.enum(["VENDOR", "GAME_COMPANY"]),
    vendor_id: z.coerce.number().int().positive().nullable().optional(),
    game_company_id: z.coerce.number().int().positive().nullable().optional(),
    period_start: z.coerce.date(),
    period_end: z.coerce.date(),
    amount: z.coerce.number().nonnegative(),
    memo: z.string().trim().nullable().optional(),
  })
  .refine(
    (d) => (d.type === "VENDOR" ? !!d.vendor_id : !!d.game_company_id),
    { message: "업체 정산은 업체, 게임사 정산은 게임사를 선택하세요", path: ["type"] },
  );

/** 정산 처리(입금/지급) — settled_amount 만큼 반영하고 장부 기록 생성 */
export const settleSchema = z.object({
  id: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive("처리 금액을 입력하세요"),
  entry_date: z.coerce.date().optional(),
  memo: z.string().trim().nullable().optional(),
});
