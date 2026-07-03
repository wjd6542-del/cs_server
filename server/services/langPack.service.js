import prisma from "../lib/prisma.js";
import AppError from "../errors/AppError.js";

function shape(r) {
  return {
    id: r.id,
    name: r.name || { ko: "", en: "", ja: "", zh: "" },
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export default {
  /** 활성/전체 목록 (프론트 번역팩 로드용) */
  async list(params = {}) {
    const where = {};
    if (params.only_active) where.is_active = true;
    const rows = await prisma.langPack.findMany({ where, orderBy: { id: "asc" } });
    return rows.map(shape);
  },

  async get(id) {
    const r = await prisma.langPack.findUnique({ where: { id } });
    if (!r) throw new AppError("존재하지 않는 정보입니다.", 404, "NOT_FOUND");
    return shape(r);
  },

  async save(data) {
    const payload = { name: data.name, is_active: data.is_active };
    if (data.id) {
      return shape(await prisma.langPack.update({ where: { id: data.id }, data: payload }));
    }
    return shape(await prisma.langPack.create({ data: payload }));
  },

  /** 일괄 저장 (id>0 → update, 없으면 create) */
  async batchSave(rows) {
    const results = await prisma.$transaction(
      rows.map((row) => {
        const payload = { name: row.name, is_active: row.is_active };
        return row.id
          ? prisma.langPack.update({ where: { id: row.id }, data: payload })
          : prisma.langPack.create({ data: payload });
      }),
    );
    return results.map(shape);
  },

  async batchDelete(rows) {
    const ids = rows.map((r) => r.id).filter(Boolean);
    if (!ids.length) return { count: 0 };
    return prisma.langPack.deleteMany({ where: { id: { in: ids } } });
  },

  async remove(id) {
    await prisma.langPack.delete({ where: { id } });
    return { ok: true };
  },

  /**
   * 한국어 → en/ja/zh 자동 번역 (Google Cloud Translation).
   * @google-cloud/translate 패키지와 GCP 자격증명이 있을 때만 동작. 없으면 안내 에러.
   */
  async translateText(text) {
    if (!text) throw new AppError("번역할 텍스트가 없습니다.", 400);
    const project = process.env.GOOGLE_TRANSLATE_PROJECT;
    let TranslationServiceClient;
    try {
      ({ TranslationServiceClient } = await import("@google-cloud/translate"));
    } catch (e) {
      throw new AppError("자동 번역 모듈(@google-cloud/translate)이 설치되지 않았습니다. 수동으로 입력하세요.", 501, "NO_TRANSLATE");
    }
    if (!project) {
      throw new AppError("GOOGLE_TRANSLATE_PROJECT 환경변수가 설정되지 않았습니다.", 501, "NO_TRANSLATE");
    }
    const client = new TranslationServiceClient();
    const LANG_MAP = { en: "en", ja: "ja", "zh-CN": "zh" };
    const TARGETS = Object.keys(LANG_MAP);
    const responses = await Promise.all(
      TARGETS.map((lang) =>
        client.translateText({
          parent: `projects/${project}/locations/global`,
          contents: [text],
          mimeType: "text/plain",
          sourceLanguageCode: "ko",
          targetLanguageCode: lang,
        }),
      ),
    );
    const result = { ko: text };
    responses.forEach((res, idx) => {
      result[LANG_MAP[TARGETS[idx]]] = res[0].translations[0].translatedText;
    });
    return result;
  },
};
