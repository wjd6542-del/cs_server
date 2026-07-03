import prisma from "../lib/prisma.js";
import AppError from "../errors/AppError.js";
import { parsePage, buildPageResult } from "../utils/pagination.js";

function shape(g) {
  return { ...g, fee_rate: g.fee_rate == null ? null : Number(g.fee_rate) };
}

/** 다음 자동 코드 (GC0001, GC0002 …) */
async function nextCode() {
  const last = await prisma.gameCompany.findFirst({
    where: { code: { startsWith: "GC" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  let n = 1;
  const m = last?.code?.match(/(\d+)$/);
  if (m) n = parseInt(m[1], 10) + 1;
  for (let i = 0; i < 50; i++) {
    const code = "GC" + String(n).padStart(4, "0");
    const dup = await prisma.gameCompany.findUnique({ where: { code } });
    if (!dup) return code;
    n++;
  }
  return "GC" + Date.now();
}

export default {
  async list({ q, is_active, page, limit } = {}) {
    const where = {};
    if (typeof is_active === "boolean") where.is_active = is_active;
    if (q)
      where.OR = [
        { name: { contains: q } },
        { code: { contains: q } },
        { contact_name: { contains: q } },
      ];
    const { page: p, limit: l, skip } = parsePage({ page, limit });
    const [rows, total] = await Promise.all([
      prisma.gameCompany.findMany({ where, orderBy: [{ sort: "asc" }, { id: "desc" }], skip, take: l }),
      prisma.gameCompany.count({ where }),
    ]);
    return buildPageResult({ rows: rows.map(shape), total, page: p, limit: l });
  },

  /** 드롭다운용 활성 게임사 목록 */
  async options() {
    return prisma.gameCompany.findMany({
      where: { is_active: true },
      orderBy: [{ sort: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true },
    });
  },

  /** 상하위 트리 */
  async tree() {
    const rows = await prisma.gameCompany.findMany({
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      select: { id: true, name: true, code: true, parent_id: true, is_active: true },
    });
    const byId = new Map();
    rows.forEach((r) => byId.set(r.id, { ...r, children: [], open_count: 0 }));
    const counts = await prisma.supportTicket.groupBy({
      by: ["game_company_id"],
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, game_company_id: { not: null } },
      _count: { _all: true },
    });
    for (const c of counts) { const n = byId.get(c.game_company_id); if (n) n.open_count = c._count._all; }
    const roots = [];
    for (const node of byId.values()) {
      if (node.parent_id && byId.has(node.parent_id)) byId.get(node.parent_id).children.push(node);
      else roots.push(node);
    }
    return roots;
  },

  async get(id) {
    const g = await prisma.gameCompany.findUnique({ where: { id } });
    if (!g) throw new AppError("게임사를 찾을 수 없습니다.", 404, "NOT_FOUND");
    return shape(g);
  },

  async save(data) {
    const { id, ...fields } = data;

    if (fields.parent_id) {
      if (fields.parent_id === id)
        throw new AppError("자기 자신을 상위로 지정할 수 없습니다.", 400, "INVALID_PARENT");
      if (id) {
        let cur = await prisma.gameCompany.findUnique({ where: { id: fields.parent_id }, select: { parent_id: true } });
        while (cur?.parent_id) {
          if (cur.parent_id === id) throw new AppError("하위 게임사를 상위로 지정할 수 없습니다.", 400, "CYCLE");
          cur = await prisma.gameCompany.findUnique({ where: { id: cur.parent_id }, select: { parent_id: true } });
        }
      }
    }

    if (fields.code) {
      const dup = await prisma.gameCompany.findFirst({
        where: { code: fields.code, ...(id ? { id: { not: id } } : {}) },
      });
      if (dup) throw new AppError("이미 존재하는 코드입니다.", 400, "DUPLICATE");
    }
    if (id) {
      const ex = await prisma.gameCompany.findUnique({ where: { id } });
      if (!ex) throw new AppError("게임사를 찾을 수 없습니다.", 404, "NOT_FOUND");
      return shape(await prisma.gameCompany.update({ where: { id }, data: fields }));
    }
    if (!fields.code) fields.code = await nextCode();
    return shape(await prisma.gameCompany.create({ data: fields }));
  },

  async remove(id) {
    const kids = await prisma.gameCompany.count({ where: { parent_id: id } });
    if (kids > 0) throw new AppError("하위 게임사가 있어 삭제할 수 없습니다.", 400, "HAS_CHILDREN");
    const [ledger, settlement, ticket] = await Promise.all([
      prisma.ledgerEntry.count({ where: { game_company_id: id } }),
      prisma.settlement.count({ where: { game_company_id: id } }),
      prisma.supportTicket.count({ where: { game_company_id: id } }),
    ]);
    if (ledger || settlement || ticket)
      throw new AppError("장부·정산·응대 이력이 있어 삭제할 수 없습니다. 비활성 처리하세요.", 400, "IN_USE");
    await prisma.gameCompany.delete({ where: { id } });
    return { ok: true };
  },
};
