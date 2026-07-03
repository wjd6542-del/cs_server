import Fastify from "fastify";
import multipart from "@fastify/multipart";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";

import prisma from "./lib/prisma.js";
import errorHandlerPlugin from "./plugins/errorHandler.plugin.js";
import auditHook from "./plugins/auditHook.js";

const app = Fastify({ logger: true });

function getClientIp(req) {
  let ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "";
  if (ip.includes("::ffff:")) ip = ip.replace("::ffff:", "");
  return ip;
}

await app.register(cors, { origin: true, credentials: true });
await app.register(errorHandlerPlugin);
await app.register(multipart, {
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
});

// 전역 API 키 + JWT 검증 훅
app.addHook("onRequest", async (request, reply) => {
  const apiKey = request.headers["x-api-key"];
  if (!request.url.startsWith("/api/")) return;

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  const authHeader = request.headers.authorization;
  if (!authHeader) return; // 로그인/회원가입 등 토큰 없는 요청 통과

  const token = authHeader.replace("Bearer ", "");
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    request.user = {
      id: decoded.userId,
      username: decoded.username,
      is_super: decoded.is_super,
      ip_restrict: decoded.ip_restrict,
    };

    if (decoded.ip_restrict && !decoded.is_super) {
      const ip = getClientIp(request);
      const allow = await prisma.userIpWhitelist.findFirst({
        where: { user_id: decoded.userId, ip, is_active: true },
      });
      if (!allow) {
        return reply.code(403).send({ error: "허용되지 않은 IP 입니다." });
      }
    }
  } catch (err) {
    return reply.code(401).send({ error: "Invalid token" });
  }
});

await app.register(auditHook);

app.register(fastifyStatic, {
  root: path.join(process.cwd(), "uploads"),
  prefix: "/uploads/",
});

// routes 자동 로드
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routesPath = path.join(__dirname, "routes");
if (fs.existsSync(routesPath)) {
  const routeFiles = fs.readdirSync(routesPath);
  for (const file of routeFiles) {
    if (!file.endsWith(".js")) continue;
    const routeModule = await import(`./routes/${file}`);
    const name = file.replace(".js", "");
    const prefix = `/api/${name}`;
    app.register(routeModule.default, { prefix });
    console.log(`✅ Route loaded: ${prefix}`);
  }
}

import { startExchangeRateCron } from "./cron/exchangeRate.cron.js";

await app.ready();
app.listen({ port: Number(process.env.PORT) || 3003, host: "0.0.0.0" });

// 환율 일일 자동 수집 크론
startExchangeRateCron();
