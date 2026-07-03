import exchangeRateService from "../services/exchangeRate.service.js";

const DAY = 24 * 60 * 60 * 1000;

async function runSafe() {
  try {
    const r = await exchangeRateService.collect();
    console.log(`💱 환율 수집 완료 (${new Date().toISOString().slice(0, 10)}) USD≈${r.usd ? Math.round(r.usd) : "-"}원`);
  } catch (e) {
    console.error("💱 환율 수집 실패:", e.message);
  }
}

/** 부팅 시 1회 수집 후, 매일(24h)마다 자동 수집 */
export function startExchangeRateCron() {
  runSafe();
  setInterval(runSafe, DAY);
}
