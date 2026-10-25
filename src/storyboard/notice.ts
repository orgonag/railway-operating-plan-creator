import type { Deck } from "./model";

export const TOOL_CREDIT = "Tool by Orgo Nag";
export const NOTICE_LINES = [
  "Tool by Orgo Nag · Illustrations only; not engineering advice, design certification or verification of capacity, clearances or safety.",
  "Verify plans with qualified personnel and applicable railway rules before use.",
];
export const FULL_NOTICE =
  "This is a visual drawing and communication tool only. It does not provide engineering advice, certify a design, or calculate or confirm track capacity, clearances, equipment fit, or safe operating conditions. Drawings and animations are illustrative only. They do not replace qualified engineering review, railway operating rules, or site-specific safety procedures. Users are responsible for verifying their plans before putting them into practice.";
export function exportedPlan(deck: Deck): string {
  return JSON.stringify(
    {
      ...deck,
      tool: {
        name: "Railway Operating Plan Creator",
        author: "Orgo Nag",
        disclaimer: FULL_NOTICE,
      },
    },
    null,
    2,
  );
}
