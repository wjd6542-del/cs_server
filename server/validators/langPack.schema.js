import { z } from "zod";

const nameSchema = z.object({
  ko: z.string().default(""),
  en: z.string().default(""),
  ja: z.string().default(""),
  zh: z.string().default(""),
});

export const idSchema = z.object({ id: z.coerce.number().int().positive() });

export const saveSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: nameSchema,
  is_active: z.coerce.boolean().default(true),
});

export const batchSaveSchema = z.array(saveSchema).min(1, "저장할 데이터가 없습니다.");

export const batchDeleteSchema = z
  .array(z.object({ id: z.coerce.number().int().positive() }))
  .min(1, "삭제할 데이터가 없습니다.");

export const translateTextSchema = z.object({
  text: z.string().trim().min(1, "번역할 텍스트가 없습니다."),
});
