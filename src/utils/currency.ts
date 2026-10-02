/** Formats a ZMW amount the way Zambians expect to see it: "K 8,500" */
export function formatZMW(amount: number): string {
  const rounded = Math.round(amount);
  return `K ${rounded.toLocaleString("en-US")}`;
}

export function formatRent(amount: number, frequency: "monthly" | "weekly" | "daily"): string {
  const suffix = frequency === "monthly" ? "/ month" : frequency === "weekly" ? "/ week" : "/ day";
  return `${formatZMW(amount)} ${suffix}`;
}
