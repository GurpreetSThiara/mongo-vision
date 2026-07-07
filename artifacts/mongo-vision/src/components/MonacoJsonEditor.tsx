import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback } from "react";

interface MonacoJsonEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  height?: string;
  className?: string;
  readOnly?: boolean;
  wordWrap?: boolean;
  onSave?: () => void;
}

export function MonacoJsonEditor({
  value,
  onChange,
  height = "250px",
  className,
  readOnly = false,
  wordWrap = true,
  onSave,
}: MonacoJsonEditorProps) {
  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      if (onSave) {
        editor.addAction({
          id: "json-save",
          label: "Save Document",
          keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
          run: () => onSave(),
        });
      }
    },
    [onSave],
  );

  return (
    <div className={`relative border border-input rounded-md overflow-hidden ${className || ""}`}>
      <Editor
        height={height}
        language="json"
        theme="vs-dark"
        value={value}
        onChange={onChange}
        onMount={handleEditorMount}
        options={{
          minimap: { enabled: false },
          fontSize: 12,
          fontFamily: "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          lineNumbers: "on",
          folding: true,
          readOnly,
          wordWrap: wordWrap ? "on" : "off",
          tabSize: 2,
          scrollbar: {
            vertical: "auto",
            horizontal: "auto",
          },
          renderLineHighlight: "all",
          matchBrackets: "always",
          bracketPairColorization: { enabled: true },
        }}
      />
    </div>
  );
}
