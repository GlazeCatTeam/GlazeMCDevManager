import type { WorkSummary } from "@glaze/plugin-sdk";
import diamond from "../assets/minecraft/diamond.png?no-inline";
import emerald from "../assets/minecraft/emerald.png?no-inline";
import styles from "./WorkPrice.module.css";

/** Original Minecraft item textures, kept external for the desktop CSP */
export function CurrencyIcon({ type }: { type: "diamond" | "point" }) {
  const name = type === "point" ? "绿宝石" : "钻石";
  return (
    <img
      className={styles.icon}
      src={type === "point" ? emerald : diamond}
      alt={name}
      title={name}
      width={16}
      height={16}
      draggable={false}
    />
  );
}

/** Player-facing price with the original currency icon and a readable unit */
export function WorkPrice({ price, priceType }: Pick<WorkSummary, "price" | "priceType">) {
  if (priceType === "free" || price <= 0) return <>免费</>;
  return (
    <span className={styles.price}>
      <CurrencyIcon type={priceType === "point" ? "point" : "diamond"} /> {price}
    </span>
  );
}
