export type MaintenanceRuleSeed = {
  name: string;
  usefulLife: number;
  optimalBase: number;
  maxWaste: number;
};

/**
 * Límites que el Gestor de Mantenimiento antiguo cargaba en una instalación
 * nueva. Se mantienen como respaldo cuando se importa un export de
 * contadores antes de importar la fuente CSV/XLSX.
 */
export const DEFAULT_MAINTENANCE_RULES: readonly MaintenanceRuleSeed[] = [
  { name: 'CANON iR 1435 / 1435IF', usefulLife: 300_000, optimalBase: 3_250, maxWaste: 0.7 },
  { name: 'CANON iR 1643 / 1643IF / 1643i / 1643P', usefulLife: 500_000, optimalBase: 13_000, maxWaste: 0.7 },
  { name: 'CANON iR 1730 / 1740', usefulLife: 500_000, optimalBase: 13_000, maxWaste: 0.7 },
  { name: 'CANON iR-ADV DX 4745', usefulLife: 1_500_000, optimalBase: 22_750, maxWaste: 0.68 },
  { name: 'CANON iR-ADV 400 / 4245 / 4535 / 4551 / 4745', usefulLife: 1_500_000, optimalBase: 16_000, maxWaste: 0.7 },
  { name: 'CANON iR-ADV 500 / 500i', usefulLife: 1_500_000, optimalBase: 22_750, maxWaste: 0.7 },
  { name: 'CANON iR-ADV 525 / 527 / 529', usefulLife: 3_000_000, optimalBase: 22_750, maxWaste: 0.68 },
  { name: 'CANON iR-ADV 715 / DX 717', usefulLife: 3_000_000, optimalBase: 22_750, maxWaste: 0.68 },
  { name: 'CANON iR-ADV 8295', usefulLife: 5_000_000, optimalBase: 35_000, maxWaste: 0.65 },
  { name: 'CANON iR-ADV DX 8795', usefulLife: 8_000_000, optimalBase: 65_000, maxWaste: 0.65 },
  { name: 'CANON IRC3025 / IRC3125 / IRC3226 / IRC3326', usefulLife: 1_000_000, optimalBase: 10_400, maxWaste: 0.7 },
  { name: 'CANON iR-ADV C356 / C3525 / C3535 / C3935 / C5235 / C5535 / C5540 / C5550 / C5560', usefulLife: 1_000_000, optimalBase: 10_400, maxWaste: 0.7 },
  { name: 'CANON imagePRESS C750', usefulLife: 3_000_000, optimalBase: 30_000, maxWaste: 0.65 },
  { name: 'CANON iR-ADV DX C5840', usefulLife: 1_500_000, optimalBase: 16_000, maxWaste: 0.7 },
  { name: 'CANON imageCLASS X C1538 / MFC1538', usefulLife: 500_000, optimalBase: 6_500, maxWaste: 0.7 },
  { name: 'CANON LBP253 / LBP352 / LBP1238 / I-SENSYS X 1238', usefulLife: 300_000, optimalBase: 3_250, maxWaste: 0.7 },
  { name: 'CANON iR2630 / DX 617 / 617', usefulLife: 1_000_000, optimalBase: 10_400, maxWaste: 0.7 },
  { name: 'PANTUM (cualquier modelo)', usefulLife: 300_000, optimalBase: 3_250, maxWaste: 0.7 },
  { name: 'CANON IF 710 / IR IF 710', usefulLife: 300_000, optimalBase: 2_000, maxWaste: 0.7 },
  { name: 'CANON IF C5100', usefulLife: 1_500_000, optimalBase: 20_000, maxWaste: 0.7 },
];
