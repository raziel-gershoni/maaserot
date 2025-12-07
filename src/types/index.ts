export interface FixedCharityData {
  name: string;
  amount: number;
}

export interface MonthStateData {
  totalMaaser: number;
  fixedCharitiesTotal: number;
  extraToGive: number;
  fixedCharitiesSnapshot: FixedCharityData[];
}

export interface IncomeData {
  amount: number;
  percentage: number;
  description?: string;
}
