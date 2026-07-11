export {};

declare global {
  interface Window {
    cashflow?: {
      saveBillPdf: (args: {
        billId: string;
        billNumber: string;
      }) => Promise<{ ok: true; filePath: string; folder: string }>;
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<{
        status: string;
        version?: string;
        message?: string;
      }>;
      downloadUpdate: () => Promise<{ ok: boolean; message?: string }>;
      quitAndInstall: () => Promise<{ ok: true }>;
      onUpdateStatus: (
        callback: (payload: {
          status: string;
          version?: string;
          message?: string;
          percent?: number;
        }) => void,
      ) => () => void;
    };
  }
}
