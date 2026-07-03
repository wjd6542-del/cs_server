import userService from "../services/user.service.js";
import { validate } from "../plugins/validator.plugin.js";
import {
  idParamSchema,
  idPermissionSchema,
  createSchema,
  updateSchema,
} from "../validators/user.schema.js";
import { permission } from "../middleware/permission.js";

/**
 * 사용자(User) 라우트 (/api/user/*)
 * 계정·역할·권한 관리 + 사용자별 IP 화이트리스트 관리
 */
export default async function userRoutes(app) {
  /** 사용자 리스트 @route POST /api/user/list */
  app.post(
    "/list",
    { preHandler: permission("usermanager.view") },
    async (req) => {
      return userService.getList(req.body);
    },
  );

  /** 사용자 단건 조회 @route POST /api/user/:id */
  app.post(
    "/:id",
    { preHandler: permission("usermanager.view") },
    async (req) => {
      const params = validate(idParamSchema, req.params);
      return userService.getById(params.id);
    },
  );

  /** 사용자 권한 개별 설정 @route POST /api/user/setPermission */
  app.post(
    "/setPermission",
    { preHandler: permission("permission.user.update") },
    async (req) => {
      const body = validate(idPermissionSchema, req.body);
      return userService.setPermission(body);
    },
  );

  /** 사용자 IP 화이트리스트 조회 @route POST /api/user/ip/list */
  app.post(
    "/ip/list",
    { preHandler: permission("usermanager.view") },
    async (req) => {
      return userService.getUserIpList(req.body);
    },
  );

  /** 사용자 IP 화이트리스트 일괄 저장 @route POST /api/user/ip/batchSave */
  app.post(
    "/ip/batchSave",
    { preHandler: permission("usermanager.update") },
    async (req) => {
      return userService.batchIpSave(req.body);
    },
  );

  /** 사용자 IP 화이트리스트 일괄 삭제 @route POST /api/user/ip/batchDelete */
  app.post(
    "/ip/batchDelete",
    { preHandler: permission("usermanager.update") },
    async (req) => {
      return userService.batchIpDelete(req.body);
    },
  );

  /** 사용자 IP 제한 토글 @route POST /api/user/ip/toggle */
  app.post(
    "/ip/toggle",
    { preHandler: permission("usermanager.update") },
    async (req) => {
      return userService.ipToggle(req.body);
    },
  );

  /** 사용자 신규 등록 @route POST /api/user/create */
  app.post(
    "/create",
    { preHandler: permission("usermanager.create") },
    async (req) => {
      const body = validate(createSchema, req.body);
      return userService.create(body);
    },
  );

  /** 사용자 정보 수정 @route POST /api/user/update */
  app.post(
    "/update",
    { preHandler: permission("usermanager.update") },
    async (req) => {
      const body = validate(updateSchema, req.body);
      return userService.update(body);
    },
  );
}
