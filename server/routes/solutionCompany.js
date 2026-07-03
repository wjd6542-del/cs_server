import service from "../services/solutionCompany.service.js";
import { validate } from "../plugins/validator.plugin.js";
import { idSchema, listSchema, saveSchema, reorderSchema } from "../validators/solutionCompany.schema.js";

function ensureAdmin(user) {
  if (!user?.is_super) {
    const e = new Error("관리자만 가능합니다."); e.statusCode = 403; e.code = "FORBIDDEN"; e.isOperational = true; throw e;
  }
}

/** 솔루션사 설정 (/api/solutionCompany) */
export default async function solutionCompanyRoutes(app) {
  app.post("/list", async (req) => service.list(validate(listSchema, req.body || {})));
  app.post("/tree", async () => service.tree());
  app.post("/options", async () => service.options());
  app.post("/get", async (req) => { const { id } = validate(idSchema, req.body); return service.get(id); });
  app.post("/save", async (req) => { ensureAdmin(req.user); return service.save(validate(saveSchema, req.body)); });
  app.post("/reorder", async (req) => { ensureAdmin(req.user); return service.reorder(validate(reorderSchema, req.body)); });
  app.post("/delete", async (req) => { ensureAdmin(req.user); const { id } = validate(idSchema, req.body); return service.remove(id); });
}
