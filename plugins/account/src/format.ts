// Display formats for account timestamps

/** "14:02" */
export function timeOfDay(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "10/12" */
export function monthDay(epochMs: number): string {
  const date = new Date(epochMs);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
