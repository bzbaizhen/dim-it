export {};
declare global {
  interface Window {
    desktop?: {
      setShortcuts: (state: {
        bindings: Record<string, string[]>;
        enabled: Record<string, boolean>;
        labels: Record<string, string>;
        capturing: boolean;
      }) => void;
      editText: (action: "undo" | "redo") => void;
      setLanguage: (language: "zh" | "en") => void;
      openFile: () => Promise<{ name: string; bytes: Uint8Array } | null>;
      saveFile: (data: {
        name: string;
        bytes: Uint8Array;
        extension: string;
      }) => Promise<boolean>;
      onCommand: (callback: (command: string) => void) => () => void;
    };
  }
}
