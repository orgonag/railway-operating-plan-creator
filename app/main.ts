import { createStoryboard } from "../src/storyboard/editor";
import "./storyboard.css";
if (
  new URLSearchParams(location.search).has("legacy") ||
  location.hash.startsWith("#plan=")
) {
  void import("./legacy");
} else {
  const root = document.getElementById("app");
  if (root) createStoryboard(root);
}
