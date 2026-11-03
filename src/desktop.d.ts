export {};
declare global {
  interface Window {
    desktop?: {
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
