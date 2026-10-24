declare module "*?raw" {
  const text: string;
  export default text;
}

interface Window {
  /** The mounted editor, for the browser smoke tests. */
  ropcEditor?: import("../src/editor/editor").Editor;
}
