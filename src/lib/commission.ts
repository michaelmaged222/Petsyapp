import type { SaleSource } from './supabase';

export const SALE_SOURCE_OPTIONS: { value: SaleSource; label: string }[] = [
  { value: 'new_client_marketing', label: 'New Client — Marketing' },
  { value: 'referral', label: 'Referral' },
  { value: 'returning_client', label: 'Returning Client' },
  { value: 'direct_walkin', label: 'Direct / Walk-in' },
];

export const SALE_SOURCE_LABELS: Record<SaleSource, string> = {
  new_client_marketing: 'New Client — Marketing',
  referral: 'Referral',
  returning_client: 'Returning Client',
  direct_walkin: 'Direct / Walk-in',
};

interface Bracket {
  threshold: number;
  commission: number;
  label: string;
}

export const COMMISSION_BRACKETS: Bracket[] = [
  { threshold: 15000, commission: 10000, label: 'Up to 15,000 AED' },
  { threshold: 25000, commission: 15000, label: 'Up to 25,000 AED' },
  { threshold: 35000, commission: 20000, label: 'Up to 35,000 AED' },
  { threshold: 45000, commission: 25000, label: 'Up to 45,000 AED' },
  { threshold: 55000, commission: 30000, label: 'Up to 55,000 AED' },
  { threshold: 65000, commission: 35000, label: 'Up to 65,000 AED' },
  { threshold: 75000, commission: 40000, label: 'Up to 75,000 AED' },
  { threshold: 85000, commission: 50000, label: 'Up to 85,000 AED' },
];

export function getCommissionForProfit(netProfit: number): {
  commission: number;
  bracketLabel: string;
  nextBracket: Bracket | null;
  progressToNext: number;
} {
  let earned: Bracket | null = null;
  for (const b of COMMISSION_BRACKETS) {
    if (netProfit >= b.threshold) {
      earned = b;
    } else {
      break;
    }
  }

  if (!earned) {
    const first = COMMISSION_BRACKETS[0];
    return {
      commission: 0,
      bracketLabel: 'No commission earned yet',
      nextBracket: first,
      progressToNext: Math.min((netProfit / first.threshold) * 100, 100),
    };
  }

  const idx = COMMISSION_BRACKETS.indexOf(earned);
  const next = idx < COMMISSION_BRACKETS.length - 1 ? COMMISSION_BRACKETS[idx + 1] : null;

  let progress = 100;
  if (next) {
    const range = next.threshold - earned.threshold;
    const into = netProfit - earned.threshold;
    progress = Math.min((into / range) * 100, 100);
  }

  return {
    commission: earned.commission,
    bracketLabel: earned.label,
    nextBracket: next,
    progressToNext: progress,
  };
}

export function formatEGP(amount: number): string {
  return `EGP ${Math.round(amount).toLocaleString('en-US')}`;
}
