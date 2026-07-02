import service from "../services/support.service.js";
import { validate } from "../plugins/validator.plugin.js";
import { idSchema, listSchema, saveSchema, statusSchema, messageSchema } from "../validators/support.schema.js";

function ensureAuth(user) {
  if (!user?.id) {
    const e = new Error("로그인이 필요합니다."); e.statusCode = 401; e.code = "UNAUTH"; e.isOperational = true; throw e;
  }
}

/** CS 응대 (/api/support) — 업체 응대 / 게임사 응대 */
export default async function supportRoutes(app) {
  app.post("/list", async (req) => service.list(validate(listSchema, req.body || {})));
  app.post("/alerts", async (req) => service.alerts(req.body || {}));
  app.post("/get", async (req) => { const { id } = validate(idSchema, req.body); return service.get(id); });
  app.post("/save", async (req) => { ensureAuth(req.user); return service.save(validate(saveSchema, req.body), req.user); });
  app.post("/status", async (req) => { ensureAuth(req.user); return service.setStatus(validate(statusSchema, req.body)); });
  app.post("/message", async (req) => { ensureAuth(req.user); return service.addMessage(validate(messageSchema, req.body), req.user); });
  app.post("/delete", async (req) => { ensureAuth(req.user); const { id } = validate(idSchema, req.body); return service.remove(id); });
}
