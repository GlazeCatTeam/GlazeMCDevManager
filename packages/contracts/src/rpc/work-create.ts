import { isWorkRecord, isWorkValue, type WorkRecord, workSections } from "./work-editor";

/** Creation has its own DTO; PC sync and related works are configured after creation */
export const workCreateFields = Object.values(workSections)
  .flat()
  .filter((key) => !["sync_pc_flag", "sync_item_info", "dlc_info", "relate_item_id"].includes(key));

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
