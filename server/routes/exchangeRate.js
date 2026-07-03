import service from "../services/exchangeRate.service.js";

function ensureAuth(user) {
  if (!user?.id) {
    const e = new Error("로그인이 필요합니다."); e.statusCode = 401; e.code = "UNAUTH"; e.isOperational = true; throw e;
  }
}

/** 환율 (/api/exchangeRate) */
export default async function exchangeRateRoutes(app) {
  app.post("/list", async (req) => service.list(req.body || {}));
  app.post("/latest", async () => service.latest());
  // 수동 수집(관리자 트리거)
  app.post("/collect", async (req) => { ensureAuth(req.user); return service.collect(); });
}
