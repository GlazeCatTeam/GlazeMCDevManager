import { EmptyState, PageHeader, SegmentedControl, useSession } from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./PromotionPage.module.css";
import { ActivitiesView } from "./views/ActivitiesView";
import { BannerView } from "./views/BannerView";
import { DiscountView } from "./views/DiscountView";

const tabs = [
  { value: "review", label: "作品活动" },
  { value: "discount", label: "折扣特卖" },
  { value: "banner", label: "PE 轮播图申请" },
] as const;

/** Reset account-owned drafts and selections whenever the active account changes */
export function PromotionPage() {
  const { current } = useSession();
  return current ? (
    <AccountPromotion key={current.id} account={current.id} />
  ) : (
    <EmptyState title="请先登录开发者账号" hint="登录后参与作品活动、折扣特卖与轮播图推广" />
  );
}

/** Group the three promotion workflows under one workbench navigation entry */
function AccountPromotion({ account }: { account: string }) {
  const [tab, setTab] = useState<"review" | "discount" | "banner">("review");
  const [bannerVisited, setBannerVisited] = useState(false);
  return (
    <div className={styles.page}>
      <PageHeader title="活动推广" subtitle="让好作品被更多玩家看见" />
      <div className={styles.tabbar}>
        <SegmentedControl
          label="活动推广分类"
          options={tabs}
          value={tab}
          onChange={(value) => {
            setTab(value);
            if (value === "banner") setBannerVisited(true);
          }}
        />
        <span className={styles.muted}>手机版 PE · 北京时间</span>
      </div>
      {tab === "review" ? (
        <ActivitiesView account={account} />
      ) : tab === "discount" ? (
        <DiscountView account={account} />
      ) : null}
      {bannerVisited && (
        <div hidden={tab !== "banner"}>
          <BannerView account={account} />
        </div>
      )}
    </div>
  );
}
