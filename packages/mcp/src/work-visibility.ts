import { z } from "zod";

export const workVisibility = {
  includeArchived: z.boolean().optional().describe("仅用户明确要求读取或操作归档作品时设为 true，仅对本次调用生效"),
};
export const workVisibilityDescription =
  "默认不读取或操作已归档作品；仅用户明确要求时传 includeArchived: true，每次调用单独指定，不得自行重试绕过归档。";
