import type { BannerApplication, BannerFields } from "@glaze/plugin-sdk";

export type BannerStep = 1 | 2 | 3;
export interface BannerDraft {
  fields: BannerFields;
  editing: BannerApplication | null;
  step: BannerStep;
  imageName: string;
  dirty: boolean;
}

export const bannerCopyFields = [
  {
    key: "feature",
    label: "作品特色",
    hint: "推荐填写：介绍玩家能体验到什么，有哪些独特玩法。",
    example: "玩家可以……\n与其他作品不同的是……",
    placeholder: "例如：探索漂浮群岛，收集材料建造飞艇，与好友一起发现隐藏遗迹。",
  },
  {
    key: "update",
    label: "更新内容",
    hint: "有近期更新时填写，没有可留空。",
    example: "本次新增……\n优化了……",
    placeholder: "本次新增的玩法、场景或体验优化",
  },
  {
    key: "activity",
    label: "活动介绍",
    hint: "有作品内活动时填写，没有可留空。",
    example: "活动内容：……\n参与方式：……",
    placeholder: "玩家可以参加什么活动，如何参与",
  },
  {
    key: "extra",
    label: "补充说明",
    hint: "可选，补充希望审核人员了解的信息。",
    example: "希望补充说明：……",
    placeholder: "例如适合的玩家群体、推荐理由",
  },
] as const;

/** Create an independent draft; reuse keeps content while requiring a fresh date selection */
export function createBannerDraft(application?: BannerApplication, reuse = false): BannerDraft {
  return {
    fields: application
      ? {
          itemId: application.itemId,
          startTime: reuse ? 0 : application.startTime,
          imageUrl: application.imageUrl,
          feature: application.feature,
          update: application.update,
          activity: application.activity,
          extra: application.extra,
        }
      : { itemId: "", startTime: 0, imageUrl: "", feature: "", update: "", activity: "", extra: "" },
    editing: application && !reuse ? application : null,
    step: 1,
    imageName: application?.imageUrl ? "已有申请宣传图" : "",
    dirty: reuse,
  };
}
