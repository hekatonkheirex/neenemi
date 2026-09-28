export type DesktopPdfResult = {
  saved: boolean;
  filePath?: string;
};

export type PrintOptions = {
  landscape?: boolean;
};

export async function printOrSaveCurrentPageAsPdf(defaultFileName: string, options: PrintOptions = {}): Promise<DesktopPdfResult | null> {
  const theme = document.documentElement.dataset.theme;
  // Screen colors are not guaranteed to contrast against the white PDF sheet.
  document.documentElement.dataset.theme = 'light';
  try {
    if (!window.dataSystemsDesktop) {
      window.print();
      return null;
    }

    return await window.dataSystemsDesktop.saveCurrentPageAsPdf({ defaultFileName, ...options });
  } finally {
    if (theme === undefined) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }
}

export async function printOrSaveHtmlReportAsPdf(html: string, defaultFileName: string): Promise<DesktopPdfResult | null> {
  const saveReport = window.dataSystemsDesktop?.saveStructuredReportAsPdf;
  if (saveReport) return saveReport({ html, defaultFileName });

  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('El navegador bloqueó la ventana del informe PDF.');

  printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true });
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  await printWindow.document.fonts?.ready;
  printWindow.focus();
  printWindow.print();
  return null;
}
