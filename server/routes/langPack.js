import service from "../services/langPack.service.js";
import { validate } from "../plugins/validator.plugin.js";
import { idSchema, saveSchema, batchSaveSchema, batchDeleteSchema, translateTextSchema } from "../validators/langPack.schema.js";

function ensureAdmin(user) {
  if (!user?.is_super) {
    const e = new Error("관리자만 가능합니다."); e.statusCode = 403; e.code = "FORBIDDEN"; e.isOperational = true; throw e;
  }
}

/** 다국어 번역팩 (/api/langPack) */
export default async function langPackRoutes(app) {
  app.post("/list", async (req) => service.list(req.body || {}));
  app.post("/get", async (req) => { const { id } = validate(idSchema, req.body); return service.get(id); });
  app.post("/save", async (req) => { ensureAdmin(req.user); return service.save(validate(saveSchema, req.body)); });
  app.post("/batchSave", async (req) => { ensureAdmin(req.user); return service.batchSave(validate(batchSaveSchema, req.body)); });
  app.post("/batchDelete", async (req) => { ensureAdmin(req.user); return service.batchDelete(validate(batchDeleteSchema, req.body)); });
  app.post("/delete", async (req) => { ensureAdmin(req.user); const { id } = validate(idSchema, req.body); return service.remove(id); });
  app.post("/translateText", async (req) => { ensureAdmin(req.user); const { text } = validate(translateTextSchema, req.body); return service.translateText(text); });
}
