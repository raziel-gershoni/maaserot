import { FixedCharityData, MonthStateData } from '@/types';

export function calculateMonthState(
  incomes: { amount: number; percentage: number }[],
  fixedCharities: FixedCharityData[],
  isPaidAlready: boolean
): MonthStateData {
  const totalMaaser = incomes.reduce(
    (sum, i) => sum + Math.round(i.amount * (i.percentage / 100)),
    0
  );

  // If already marked paid this month, no fixed charity deduction for new income
  const fixedCharitiesTotal = isPaidAlready
    ? 0
    : fixedCharities.reduce((sum, c) => sum + c.amount, 0);

  const extraToGive = Math.max(0, totalMaaser - fixedCharitiesTotal);

  return {
    totalMaaser,
    fixedCharitiesTotal,
    extraToGive,
    fixedCharitiesSnapshot: fixedCharities,
  };
}

export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatCurrency(agorot: number, locale: string = 'he'): string {
  const shekels = agorot / 100;
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    style: 'currency',
    currency: 'ILS',
  }).format(shekels);
}

export function parseCurrency(value: string): number {
  // Remove currency symbols and parse to agorot (cents)
  const cleaned = value.replace(/[^\d.]/g, '');
  const shekels = parseFloat(cleaned) || 0;
  return Math.round(shekels * 100);
}
