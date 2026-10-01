export const SLA_STATUSES = ['complies', 'partial', 'gap', 'na'] as const;
export type SlaStatus = (typeof SLA_STATUSES)[number];

export const SLA_RISKS = ['low', 'medium', 'high', 'critical'] as const;
export type SlaRisk = (typeof SLA_RISKS)[number];

export type SlaComplianceItem = {
  id: string;
  category: string;
  clientRequirement: string;
  clientSource: string;
  ourPosition: string;
  ourSource: string;
  status: SlaStatus;
  advice: string;
};

export type SlaAnalysis = {
  fileName: string;
  textExcerpt: string;
  source: 'reglas locales' | 'IA OpenRouter' | 'IA Gemini';
  usedFallback: boolean;
  analyzedAt: string;
  overallRisk: SlaRisk;
  complianceScore: number;
  summary: string;
  items: SlaComplianceItem[];
  criticalGaps: string[];
  recommendations: string[];
  negotiationPoints: string[];
};

export type SlaReferenceSection = {
  section: string;
  title: string;
  coverage: string;
};
