import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

declare global {
  interface Window {
    MonacoEnvironment: monaco.Environment;
  }
}

// Self-host Monaco instead of the @monaco-editor/react default of fetching
// it from a CDN at runtime, which fails offline, behind a strict CSP, or in
// air-gapped deployments.
window.MonacoEnvironment = {
  getWorker(_workerId, label) {
    switch (label) {
      case "json":
        return new JsonWorker();
      case "typescript":
      case "javascript":
        return new TsWorker();
      default:
        return new EditorWorker();
    }
  },
};

loader.config({ monaco });
