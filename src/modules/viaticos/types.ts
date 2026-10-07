export const TRAVEL_TRANSPORTS = ['MOVIL PROPIO', 'MOVIL DATA', 'MOVIL RENTADO', 'BUS'] as const;
export type TravelTransport = (typeof TRAVEL_TRANSPORTS)[number];

export const TRAVEL_STATUSES = ['pending', 'review', 'approved'] as const;
export type TravelStatus = (typeof TRAVEL_STATUSES)[number];

export const TRAVEL_SOURCES = ['xlsx', 'manual'] as const;
export type TravelSource = (typeof TRAVEL_SOURCES)[number];

export const TRAVEL_SOURCE_TYPES = ['viaticos'] as const;
export type TravelSourceType = (typeof TRAVEL_SOURCE_TYPES)[number];

export type BusFareReference = {
  destination: string;
  aliases: string[];
  outbound: number | null;
  returnFare: number | null;
  company: string;
};

export type TollRouteReference = {
  route: string;
  aliases: string[];
  checkpoints: string[];
  total: number;
};

export type TravelCostCatalog = {
  source: string;
  dailyAllowance: number;
  hotelPerNight: number;
  busFares: BusFareReference[];
  tollRoutes: TollRouteReference[];
};

export type TravelCostEstimate = {
  dailyAllowance: number;
  lodging: number;
  tolls: number | null;
  busFare: number | null;
  busOutbound: number | null;
  busReturn: number | null;
  tollRoute: TollRouteReference | null;
  busReference: BusFareReference | null;
};

export type TravelTripInput = {
  recordedAt: string;
  serviceNumber: string;
  customerName: string;
  destination: string;
  transport: TravelTransport;
  technician: string;
  driver: string;
  advance: number;
  allowance: number;
  lodging: number;
  tolls: number;
  otherCost: number;
  vehiclePayment: number;
  technicianPayment: number;
  distanceKm: number;
  fuelCost: number;
  notes: string;
};

export type TravelSourceOperational = {
  serviceCostBase?: string;
  mobile?: string;
  averageConsumptionPer100Km?: string;
  fuelCostPerLiter?: string;
  serviceCostCalculated?: string;
  totalServiceCost?: string;
  totalFuelCost?: string;
  serviceCostAllocation?: string;
};

export type ParsedTravelTrip = TravelTripInput & {
  source: 'xlsx';
  sourceRecordKey: string;
  sourceRow: number;
  sourceSheetName?: string;
  sourceOperational?: TravelSourceOperational;
  totalCost: number;
};

export type TravelTrip = TravelTripInput & {
  id: string;
  totalCost: number;
  status: TravelStatus;
  source: TravelSource;
  sourceFileName: string;
  sourceSheetName: string;
  sourceRowNumber: number;
  sourceBatchId: string | null;
  sourceOperational?: TravelSourceOperational;
  createdAt: string;
  updatedAt: string;
};

export type HistoricalSummary = {
  year: number;
  partial: boolean;
  services: number;
  trips: number;
  distanceKm: number;
  fuelCost: number;
  vehicleCost: number;
  technicianCost: number;
  renditions: number;
  serviceCost: number;
  generalCost: number;
  averageMonthlyCost: number;
  averageCostPerService: number;
  monthlyServices: number[];
  monthlyTrips: number[];
  transportTrips: {
    data: number;
    bus: number;
    own: number;
  };
  source: string;
};

export type TravelImportResult = {
  sourceType: TravelSourceType;
  accepted: number;
  duplicates: number;
  historicalSnapshots: number;
  sourceSheets: number;
};

export type TravelSummary = {
  operationalYear: number | null;
  sourceName: string | null;
  sourceImportedAt: string | null;
  records: number;
  totalCost: number;
  averageCost: number;
  pending: number;
  review: number;
  approved: number;
  firstDate: string | null;
  lastDate: string | null;
  monthlyTotals: number[];
  transportTotals: Array<{ key: TravelTransport; records: number; totalCost: number }>;
  topDestinations: Array<{ destination: string; records: number; totalCost: number }>;
};

export type TravelQuery = {
  query?: string;
  status?: TravelStatus;
  transport?: TravelTransport;
  month?: string;
  limit?: number;
};
