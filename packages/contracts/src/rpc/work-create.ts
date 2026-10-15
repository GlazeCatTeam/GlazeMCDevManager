import { isWorkRecord, isWorkValue, type WorkRecord, workSections } from "./work-editor";

/** Creation accepts a full draft; update-only configuration is applied after selecting the created work */
export const workCreateFields = Object.values(workSections).flat();

/** Preserve fields absent from the create protocol for an explicit follow-up update */
export function deferredWorkCreatePatch(fields: WorkRecord): WorkRecord {
  const patch: WorkRecord = {};
  if (fields.sync_pc_flag === true)
    Object.assign(patch, { sync_pc_flag: true, sync_item_info: fields.sync_item_info ?? {} });
  if (isWorkRecord(fields.dlc_info) && fields.dlc_info.dlc_switch === true)
    Object.assign(patch, { dlc_info: fields.dlc_info, relate_item_id: fields.relate_item_id ?? "" });
  if (fields.corp_proof_image) patch.corp_proof_image = fields.corp_proof_image;
  if (Array.isArray(fields.discount) && fields.discount.length) patch.discount = fields.discount;
  return patch;
}

export interface WorkCreateParams {
  account: string;
  fields: WorkRecord;
}

/** Start with an account-local form, without inventing a platform work id */
export function emptyWorkCreateFields(): WorkRecord {
  return {
    item_name: "",
    is_domain_server_item: 0,
    is_original: true,
    corp_proof_image: "",
    discount: [],
    sync_pc_flag: false,
    sync_item_info: {},
    dlc_info: { dlc_switch: false, dlc_type: "off", master: {}, slave_list: [] },
    relate_item_id: "",
    tag: [],
    activity_desc: "",
    price: 0,
    price_rank: -4,
    price_type: "free",
    info: "",
    pri_type: 0,
    sub_type: 0,
    mod_second_type: 0,
    mod_version: "",
    label_type_list: [],
    mount_call_enabled: false,
    res: [],
    prerequisite_items: [],
    pe_is_add_play_plan: false,
    lobby_min_num: 0,
    lobby_max_num: 0,
    lobby_force_max_num: 10,
    lobby_tags: [],
    is_lobby_competitive: false,
    is_asymmetric: false,
    lobby_camps: [],
    lobby_player_num: 1,
    lobby_normal_mode: false,
    lobby_reconnect_time: 1,
    channel: [],
    banner_pic: "",
    video_info_list: [],
    update_summary: "",
    weak_offline: false,
    weak_offline_reason: "",
  };
}

/** Reject unknown fields and unbounded values at the renderer boundary */
export function isWorkCreateParams(value: unknown): value is WorkCreateParams {
  return (
    isWorkRecord(value) &&
    typeof value.account === "string" &&
    value.account.length > 0 &&
    isWorkRecord(value.fields) &&
    isWorkValue(value.fields) &&
    Object.keys(value.fields).every((key) => (workCreateFields as string[]).includes(key))
  );
}
