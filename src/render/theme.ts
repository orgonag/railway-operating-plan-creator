/**
 * Theme: the colours and type of the drawing. Dark ink background, gold
 * facility boxes and labels, loco red, loaded amber, empty outlined grey.
 * Labels use JetBrains Mono and fall back to the system monospace font.
 */

export const theme = {
  ink: "#0e1013",
  paper: "#f2efe6",
  gold: "#d9c48c",
  steel: "#8a9199",
  rail: "#3b424b",
  loco: "#e8432f",
  loaded: "#e0ad4b",
  empty: "#7c848d",
  font: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
} as const;

export type Theme = typeof theme;
