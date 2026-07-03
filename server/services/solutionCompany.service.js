import prisma from "../lib/prisma.js";
import AppError from "../errors/AppError.js";
import { parsePage, buildPageResult } from "../utils/pagination.js";

function shape(s) {
  return { ...s };
}

/** 다음 자동 코드 (SC0001, SC0002 …) */
async function nextCode() {
  const last = await prisma.solutionCompany.findFirst({
    where: { code: { startsWith: "SC" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  let n = 1;
  const m = last?.code?.match(/(\d+)$/);
  if (m) n = parseInt(m[1], 10) + 1;
  for (let i = 0; i < 50; i++) {
    const code = "SC" + String(n).padStart(4, "0");
    const dup = await prisma.solutionCompany.findUnique({ where: { code } });
    if (!dup) return code;
    n++;
  }
  return "SC" + Date.now();
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
      prisma.solutionCompany.findMany({ where, orderBy: [{ sort: "asc" }, { id: "desc" }], skip, take: l }),
      prisma.solutionCompany.count({ where }),
    ]);
    return buildPageResult({ rows: rows.map(shape), total, page: p, limit: l });
  },

  /** 드롭다운용 활성 솔루션사 목록 */
  async options() {
    return prisma.solutionCompany.findMany({
      where: { is_active: true },
      orderBy: [{ sort: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true },
    });
  },

  /** 상하위 트리 */
  async tree() {
    const rows = await prisma.solutionCompany.findMany({
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      select: { id: true, name: true, code: true, parent_id: true, is_active: true },
    });
    const byId = new Map();
    rows.forEach((r) => byId.set(r.id, { ...r, children: [], open_count: 0, progress_count: 0 }));
    const counts = await prisma.supportTicket.groupBy({
      by: ["solution_company_id", "status"],
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, solution_company_id: { not: null } },
      _count: { _all: true },
    });
    for (const c of counts) {
      const n = byId.get(c.solution_company_id);
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
    const s = await prisma.solutionCompany.findUnique({ where: { id } });
    if (!s) throw new AppError("솔루션사를 찾을 수 없습니다.", 404, "NOT_FOUND");
    return shape(s);
  },

  async save(data) {
    const { id, ...fields } = data;

    if (fields.parent_id) {
      if (fields.parent_id === id)
        throw new AppError("자기 자신을 상위로 지정할 수 없습니다.", 400, "INVALID_PARENT");
      if (id) {
        let cur = await prisma.solutionCompany.findUnique({ where: { id: fields.parent_id }, select: { parent_id: true } });
        while (cur?.parent_id) {
          if (cur.parent_id === id) throw new AppError("하위 솔루션사를 상위로 지정할 수 없습니다.", 400, "CYCLE");
          cur = await prisma.solutionCompany.findUnique({ where: { id: cur.parent_id }, select: { parent_id: true } });
        }
      }
    }

    if (fields.code) {
      const dup = await prisma.solutionCompany.findFirst({
        where: { code: fields.code, ...(id ? { id: { not: id } } : {}) },
      });
      if (dup) throw new AppError("이미 존재하는 코드입니다.", 400, "DUPLICATE");
    }
    if (id) {
      const ex = await prisma.solutionCompany.findUnique({ where: { id } });
      if (!ex) throw new AppError("솔루션사를 찾을 수 없습니다.", 404, "NOT_FOUND");
      return shape(await prisma.solutionCompany.update({ where: { id }, data: fields }));
    }
    if (!fields.code) fields.code = await nextCode();
    return shape(await prisma.solutionCompany.create({ data: fields }));
  },

  /** 드래그 순서/상위 변경 */
  async reorder({ id, parent_id, before_id }) {
    const pid = parent_id ?? null;
    if (pid) {
      if (pid === id) throw new AppError("자기 자신을 상위로 지정할 수 없습니다.", 400, "INVALID_PARENT");
      let cur = await prisma.solutionCompany.findUnique({ where: { id: pid }, select: { parent_id: true } });
      while (cur?.parent_id) {
        if (cur.parent_id === id) throw new AppError("하위 솔루션사를 상위로 지정할 수 없습니다.", 400, "CYCLE");
        cur = await prisma.solutionCompany.findUnique({ where: { id: cur.parent_id }, select: { parent_id: true } });
      }
    }
    await prisma.solutionCompany.update({ where: { id }, data: { parent_id: pid } });
    const sibs = await prisma.solutionCompany.findMany({
      where: { parent_id: pid, id: { not: id } },
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const orderIds = [];
    let inserted = false;
    for (const s of sibs) {
      if (before_id && s.id === before_id) { orderIds.push(id); inserted = true; }
      orderIds.push(s.id);
    }
    if (!inserted) orderIds.push(id);
    await prisma.$transaction(orderIds.map((sid, i) => prisma.solutionCompany.update({ where: { id: sid }, data: { sort: i } })));
    return { ok: true };
  },

  async remove(id) {
    const kids = await prisma.solutionCompany.count({ where: { parent_id: id } });
    if (kids > 0) throw new AppError("하위 솔루션사가 있어 삭제할 수 없습니다.", 400, "HAS_CHILDREN");
    const ticket = await prisma.supportTicket.count({ where: { solution_company_id: id } });
    if (ticket)
      throw new AppError("응대 이력이 있어 삭제할 수 없습니다. 비활성 처리하세요.", 400, "IN_USE");
    await prisma.solutionCompany.delete({ where: { id } });
    return { ok: true };
  },
};
