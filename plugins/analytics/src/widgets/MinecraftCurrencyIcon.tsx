import diamond from "../assets/minecraft/diamond.png?no-inline";
import emerald from "../assets/minecraft/emerald.png?no-inline";
import styles from "./StatStrip.module.css";

/** Use original local item textures without smoothing or data URLs */
export function MinecraftCurrencyIcon({ currency }: { currency: "diamonds" | "emeralds" }) {
  return (
    <img
      src={currency === "diamonds" ? diamond : emerald}
      alt=""
      aria-hidden="true"
      className={styles.currencyIcon}
      width={32}
      height={32}
      draggable={false}
    />
  );
}
