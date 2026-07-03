import prisma from "../lib/prisma.js";
import AppError from "../errors/AppError.js";
import { parsePage, buildPageResult } from "../utils/pagination.js";

const INCLUDE = {
  game_company: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
  solution_company: { select: { id: true, name: true } },
  tags: { select: { id: true, name: true, color: true } },
  _count: { select: { messages: true } },
};

function shape(t) {
  return {
    id: t.id,
    party: t.party,
    vendor_id: t.vendor_id,
    vendor_name: t.vendor?.name || null,
    game_company_id: t.game_company_id,
    game_company_name: t.game_company?.name || null,
    solution_company_id: t.solution_company_id,
    solution_company_name: t.solution_company?.name || null,
    title: t.title,
    category: t.category,
    status: t.status,
    priority: t.priority,
    assignee_id: t.assignee_id,
    created_by: t.created_by,
    tags: t.tags || [],
    message_count: t._count?.messages ?? 0,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

export default {
  async list(params = {}) {
    const where = {};
    if (params.party) where.party = params.party;
    if (params.status) where.status = params.status;
    if (params.vendor_id) where.vendor_id = params.vendor_id;
    if (params.game_company_id) where.game_company_id = params.game_company_id;
    if (params.solution_company_id) where.solution_company_id = params.solution_company_id;
    if (params.tag_ids?.length) where.tags = { some: { id: { in: params.tag_ids } } };
    if (params.q) where.title = { contains: params.q };
    if (params.date_from || params.date_to) {
      where.created_at = {};
      if (params.date_from) where.created_at.gte = new Date(`${params.date_from}T00:00:00`);
      if (params.date_to) where.created_at.lte = new Date(`${params.date_to}T23:59:59.999`);
    }
    const { page, limit, skip } = parsePage(params);
    const [rows, total] = await Promise.all([
      prisma.supportTicket.findMany({ where, include: INCLUDE, orderBy: [{ status: "asc" }, { priority: "desc" }, { id: "desc" }], skip, take: limit }),
      prisma.supportTicket.count({ where }),
    ]);
    return buildPageResult({ rows: rows.map(shape), total, page, limit });
  },

  /** 미해결(접수/처리중) 응대 알림 — 양측 합산 + 파티별 카운트 */
  async alerts({ limit = 20 } = {}) {
    const where = { status: { in: ["OPEN", "IN_PROGRESS"] } };
    const [rows, total, byParty] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ priority: "desc" }, { updated_at: "desc" }],
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.groupBy({ by: ["party"], where, _count: { _all: true } }),
    ]);
    const counts = { VENDOR: 0, GAME_COMPANY: 0, SOLUTION: 0 };
    for (const g of byParty) counts[g.party] = g._count._all;
    return { rows: rows.map(shape), total, counts };
  },

  async get(id) {
    const t = await prisma.supportTicket.findUnique({
      where: { id },
      include: {
        ...INCLUDE,
        messages: { orderBy: { id: "asc" } },
      },
    });
    if (!t) throw new AppError("응대 건을 찾을 수 없습니다.", 404, "NOT_FOUND");
    return { ...shape(t), messages: t.messages };
  },

  async save(data, user) {
    const payload = {
      party: data.party,
      vendor_id: data.party === "VENDOR" ? data.vendor_id : null,
      game_company_id: data.party === "GAME_COMPANY" ? data.game_company_id : null,
      solution_company_id: data.party === "SOLUTION" ? data.solution_company_id : null,
      title: data.title,
      category: data.category ?? null,
      status: data.status,
      priority: data.priority,
      assignee_id: data.assignee_id ?? null,
    };
    const tagIds = Array.isArray(data.tag_ids) ? data.tag_ids : null;
    if (data.id) {
      const ex = await prisma.supportTicket.findUnique({ where: { id: data.id } });
      if (!ex) throw new AppError("응대 건을 찾을 수 없습니다.", 404, "NOT_FOUND");
      return shape(await prisma.supportTicket.update({
        where: { id: data.id },
        data: { ...payload, ...(tagIds ? { tags: { set: tagIds.map((id) => ({ id })) } } : {}) },
        include: INCLUDE,
      }));
    }
    return shape(
      await prisma.supportTicket.create({
        data: { ...payload, created_by: user?.id ?? null, ...(tagIds ? { tags: { connect: tagIds.map((id) => ({ id })) } } : {}) },
        include: INCLUDE,
      }),
    );
  },

  async setStatus({ id, status }) {
    const ex = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ex) throw new AppError("응대 건을 찾을 수 없습니다.", 404, "NOT_FOUND");
    return shape(await prisma.supportTicket.update({ where: { id }, data: { status }, include: INCLUDE }));
  },

  /** 상태 일괄 변경 */
  async bulkStatus({ ids, status }) {
    if (!ids?.length) return { ok: true, count: 0 };
    const res = await prisma.supportTicket.updateMany({ where: { id: { in: ids } }, data: { status } });
    return { ok: true, count: res.count };
  },

  async addMessage(data, user) {
    const t = await prisma.supportTicket.findUnique({ where: { id: data.ticket_id } });
    if (!t) throw new AppError("응대 건을 찾을 수 없습니다.", 404, "NOT_FOUND");
    const msg = await prisma.supportMessage.create({
      data: {
        ticket_id: data.ticket_id,
        user_id: user?.id ?? null,
        content: data.content,
        is_internal: data.is_internal,
      },
    });
    // 새 메시지가 달리면 종료 건은 다시 처리중으로
    if (t.status === "CLOSED" || t.status === "RESOLVED") {
      await prisma.supportTicket.update({ where: { id: t.id }, data: { status: "IN_PROGRESS" } });
    } else {
      await prisma.supportTicket.update({ where: { id: t.id }, data: { updated_at: new Date() } });
    }
    return msg;
  },

  async remove(id) {
    await prisma.supportTicket.delete({ where: { id } }); // messages cascade
    return { ok: true };
  },
};
