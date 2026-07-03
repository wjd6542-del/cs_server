import prisma from "../lib/prisma.js";
import { parsePage, buildPageResult } from "../utils/pagination.js";

const CODES = ["usd", "jpy", "cny", "vnd", "eur", "gbp"];
const SOURCE = "open.er-api.com";

function num(v) {
  return v == null ? null : Number(v);
}
function shape(r) {
  return {
    id: r.id,
    base: r.base,
    date: r.date,
    krw: num(r.krw),
    usd: num(r.usd),
    jpy: num(r.jpy),
    cny: num(r.cny),
    vnd: num(r.vnd),
    eur: num(r.eur),
    gbp: num(r.gbp),
    source: r.source,
    created_at: r.created_at,
  };
}
function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default {
  /** 외부 API에서 환율을 받아 오늘자 스냅샷을 upsert (1 외화 = X원) */
  async collect() {
    const res = await fetch("https://open.er-api.com/v6/latest/KRW");
    if (!res.ok) throw new Error(`환율 API 오류 ${res.status}`);
    const json = await res.json();
    if (json.result !== "success" || !json.rates) throw new Error("환율 데이터 형식 오류");

    // rates[X] = 1 KRW 당 외화. 1 외화 = 1/rates[X] 원.
    const data = { base: "KRW", krw: 1, source: SOURCE };
    for (const c of CODES) {
      const rate = json.rates[c.toUpperCase()];
      data[c] = rate ? 1 / rate : null;
    }
    const date = startOfDay();
    const existing = await prisma.exchangeRate.findUnique({ where: { date } });
    if (existing) {
      return shape(await prisma.exchangeRate.update({ where: { id: existing.id }, data }));
    }
    return shape(await prisma.exchangeRate.create({ data: { ...data, date } }));
  },

  async list(params = {}) {
    const { page, limit, skip } = parsePage(params, { defaultLimit: 30 });
    const [rows, total] = await Promise.all([
      prisma.exchangeRate.findMany({ orderBy: { date: "desc" }, skip, take: limit }),
      prisma.exchangeRate.count(),
    ]);
    return buildPageResult({ rows: rows.map(shape), total, page, limit });
  },

  async latest() {
    const r = await prisma.exchangeRate.findFirst({ orderBy: { date: "desc" } });
    return r ? shape(r) : null;
  },
};
