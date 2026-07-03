import prisma from "../lib/prisma.js";
import AppError from "../errors/AppError.js";
import { parsePage, buildPageResult } from "../utils/pagination.js";

const INCLUDE = {
  game_company: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
};

function shape(s) {
  const amount = Number(s.amount);
  const settled = Number(s.settled_amount);
  return {
    id: s.id,
    type: s.type,
    vendor_id: s.vendor_id,
    vendor_name: s.vendor?.name || null,
    game_company_id: s.game_company_id,
    game_company_name: s.game_company?.name || null,
    period_start: s.period_start,
    period_end: s.period_end,
    amount,
    settled_amount: settled,
    remaining: amount - settled,
    status: s.status,
    memo: s.memo,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

function statusFor(amount, settled) {
  if (settled <= 0) return "PENDING";
  if (settled >= amount) return "DONE";
  return "PARTIAL";
}

export default {
  async list(params = {}) {
    const where = {};
    if (params.type) where.type = params.type;
    if (params.status) where.status = params.status;
    if (params.vendor_id) where.vendor_id = params.vendor_id;
    if (params.game_company_id) where.game_company_id = params.game_company_id;
    // 정산 기간이 선택 범위와 겹치는 건 (period_start ≤ to AND period_end ≥ from)
    if (params.date_from || params.date_to) {
      where.AND = where.AND || [];
      if (params.date_to) where.AND.push({ period_start: { lte: new Date(`${params.date_to}T23:59:59.999`) } });
      if (params.date_from) where.AND.push({ period_end: { gte: new Date(`${params.date_from}T00:00:00`) } });
    }
    const { page, limit, skip } = parsePage(params);
    const [rows, total] = await Promise.all([
      prisma.settlement.findMany({ where, include: INCLUDE, orderBy: [{ period_end: "desc" }, { id: "desc" }], skip, take: limit }),
      prisma.settlement.count({ where }),
    ]);
    return buildPageResult({ rows: rows.map(shape), total, page, limit });
  },

  async get(id) {
    const s = await prisma.settlement.findUnique({
      where: { id },
      include: { ...INCLUDE, ledgerEntries: { orderBy: { id: "desc" } } },
    });
    if (!s) throw new AppError("정산을 찾을 수 없습니다.", 404, "NOT_FOUND");
    return { ...shape(s), ledgerEntries: s.ledgerEntries.map((e) => ({ ...e, amount: Number(e.amount) })) };
  },

  async save(data, user) {
    const payload = {
      type: data.type,
      vendor_id: data.type === "VENDOR" ? data.vendor_id : null,
      game_company_id: data.type === "GAME_COMPANY" ? data.game_company_id : null,
      period_start: data.period_start,
      period_end: data.period_end,
      amount: data.amount,
      memo: data.memo ?? null,
    };
    if (data.id) {
      const ex = await prisma.settlement.findUnique({ where: { id: data.id } });
      if (!ex) throw new AppError("정산을 찾을 수 없습니다.", 404, "NOT_FOUND");
      const settled = Number(ex.settled_amount);
      return shape(
        await prisma.settlement.update({
          where: { id: data.id },
          data: { ...payload, status: statusFor(data.amount, settled) },
          include: INCLUDE,
        }),
      );
    }
    return shape(
      await prisma.settlement.create({
        data: { ...payload, settled_amount: 0, status: "PENDING", created_by: user?.id ?? null },
        include: INCLUDE,
      }),
    );
  },

  /** 정산 처리: 입금(업체)/지급(게임사) 반영 + 장부 자동 기록 */
  async settle(data, user) {
    const s = await prisma.settlement.findUnique({ where: { id: data.id } });
    if (!s) throw new AppError("정산을 찾을 수 없습니다.", 404, "NOT_FOUND");
    const amount = Number(s.amount);
    const already = Number(s.settled_amount);
    const nextSettled = already + data.amount;
    if (nextSettled > amount + 0.001)
      throw new AppError("정산 잔액을 초과했습니다.", 400, "OVER_SETTLE");

    const ledgerType = s.type === "VENDOR" ? "COLLECTION" : "PAYMENT";
    const result = await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.create({
        data: {
          type: ledgerType,
          entry_date: data.entry_date ?? new Date(),
          amount: data.amount,
          game_company_id: s.game_company_id,
          vendor_id: s.vendor_id,
          settlement_id: s.id,
          memo: data.memo ?? `정산 #${s.id} 처리`,
          created_by: user?.id ?? null,
        },
      });
      return tx.settlement.update({
        where: { id: s.id },
        data: { settled_amount: nextSettled, status: statusFor(amount, nextSettled) },
        include: INCLUDE,
      });
    });
    return shape(result);
  },

  async remove(id) {
    const cnt = await prisma.ledgerEntry.count({ where: { settlement_id: id } });
    if (cnt > 0) throw new AppError("처리 이력(장부)이 있어 삭제할 수 없습니다.", 400, "HAS_LEDGER");
    await prisma.settlement.delete({ where: { id } });
    return { ok: true };
  },
};
