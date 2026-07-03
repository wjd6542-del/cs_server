import prisma from "../lib/prisma.js";
import AppError from "../errors/AppError.js";
import { parsePage, buildPageResult } from "../utils/pagination.js";

/** 다음 자동 코드 (V0001, V0002 …) */
async function nextCode() {
  const last = await prisma.vendor.findFirst({
    where: { code: { startsWith: "V" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  let n = 1;
  const m = last?.code?.match(/(\d+)$/);
  if (m) n = parseInt(m[1], 10) + 1;
  // 충돌 방지 루프
  for (let i = 0; i < 50; i++) {
    const code = "V" + String(n).padStart(4, "0");
    const dup = await prisma.vendor.findUnique({ where: { code } });
    if (!dup) return code;
    n++;
  }
  return "V" + Date.now();
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
      prisma.vendor.findMany({ where, orderBy: [{ sort: "asc" }, { id: "desc" }], skip, take: l }),
      prisma.vendor.count({ where }),
    ]);
    return buildPageResult({ rows, total, page: p, limit: l });
  },

  /** 드롭다운용 활성 업체 목록 */
  async options() {
    return prisma.vendor.findMany({
      where: { is_active: true },
      orderBy: [{ sort: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true },
    });
  },

  /** 상하위 트리 (총판-대리점) */
  async tree() {
    const rows = await prisma.vendor.findMany({
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      select: { id: true, name: true, code: true, parent_id: true, is_active: true },
    });
    const byId = new Map();
    rows.forEach((r) => byId.set(r.id, { ...r, children: [], open_count: 0, progress_count: 0 }));
    // 상태별 응대 카운트 (접수/처리중 분리)
    const counts = await prisma.supportTicket.groupBy({
      by: ["vendor_id", "status"],
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, vendor_id: { not: null } },
      _count: { _all: true },
    });
    for (const c of counts) {
      const n = byId.get(c.vendor_id);
      if (!n) continue;
      if (c.status === "OPEN") n.open_count = c._count._all;
      else if (c.status === "IN_PROGRESS") n.progress_count = c._count._all;
    }
    const roots = [];
    for (const node of byId.values()) {
      if (node.parent_id && byId.has(node.parent_id)) byId.get(node.parent_id).children.push(node);
      else roots.push(node);
    }
    return roots;
  },

  async get(id) {
    const v = await prisma.vendor.findUnique({ where: { id } });
    if (!v) throw new AppError("업체를 찾을 수 없습니다.", 404, "NOT_FOUND");
    return v;
  },

  async save(data) {
    const { id, ...fields } = data;

    // 상위 지정 검증 (자기 자신/후손 금지)
    if (fields.parent_id) {
      if (fields.parent_id === id)
        throw new AppError("자기 자신을 상위로 지정할 수 없습니다.", 400, "INVALID_PARENT");
      if (id) {
        // 후손을 상위로 지정하면 순환 → 차단
        let cur = await prisma.vendor.findUnique({ where: { id: fields.parent_id }, select: { parent_id: true } });
        while (cur?.parent_id) {
          if (cur.parent_id === id) throw new AppError("하위 업체를 상위로 지정할 수 없습니다.", 400, "CYCLE");
          cur = await prisma.vendor.findUnique({ where: { id: cur.parent_id }, select: { parent_id: true } });
        }
      }
    }

    if (fields.code) {
      const dup = await prisma.vendor.findFirst({
        where: { code: fields.code, ...(id ? { id: { not: id } } : {}) },
      });
      if (dup) throw new AppError("이미 존재하는 코드입니다.", 400, "DUPLICATE");
    }

    if (id) {
      const ex = await prisma.vendor.findUnique({ where: { id } });
      if (!ex) throw new AppError("업체를 찾을 수 없습니다.", 404, "NOT_FOUND");
      return prisma.vendor.update({ where: { id }, data: fields });
    }
    // 신규: 코드 미입력 시 자동 생성
    if (!fields.code) fields.code = await nextCode();
    return prisma.vendor.create({ data: fields });
  },

  async remove(id) {
    const kids = await prisma.vendor.count({ where: { parent_id: id } });
    if (kids > 0) throw new AppError("하위 업체가 있어 삭제할 수 없습니다.", 400, "HAS_CHILDREN");
    const [ledger, settlement, ticket] = await Promise.all([
      prisma.ledgerEntry.count({ where: { vendor_id: id } }),
      prisma.settlement.count({ where: { vendor_id: id } }),
      prisma.supportTicket.count({ where: { vendor_id: id } }),
    ]);
    if (ledger || settlement || ticket)
      throw new AppError("장부·정산·응대 이력이 있어 삭제할 수 없습니다. 비활성 처리하세요.", 400, "IN_USE");
    await prisma.vendor.delete({ where: { id } });
    return { ok: true };
  },
};
