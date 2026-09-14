/** Phone stays one column. Tablet may use two cards when the row has room. */
export function savedSenderCardColumns(tablet: boolean): 1 | 2 {
  return tablet ? 2 : 1;
}

export function savedSenderCardWidth(tablet: boolean): "100%" | "48%" {
  return tablet ? "48%" : "100%";
}
