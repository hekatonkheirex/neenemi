export {};

declare global {
  interface Window {
    dataSystemsDesktop?: {
      saveCurrentPageAsPdf: (options?: { defaultFileName?: string; landscape?: boolean }) => Promise<{
        saved: boolean;
        filePath?: string;
      }>;
      saveStructuredReportAsPdf: (options: { defaultFileName?: string; html: string }) => Promise<{
        saved: boolean;
        filePath?: string;
      }>;
    };
  }
}
