export interface CycleRange {
  start: Date;
  end: Date;
  label: string;
}

export function getCurrentCycleStartDay(): number {
  return 11;
}

export function getCycleRange(referenceDate: Date, cycleStartDay: number): CycleRange {
  const day = referenceDate.getDate();
  const month = referenceDate.getMonth();
  const year = referenceDate.getFullYear();

  let startMonth: number;
  let startYear: number;

  if (day >= cycleStartDay) {
    startMonth = month;
    startYear = year;
  } else {
    startMonth = month - 1;
    startYear = year;
    if (startMonth < 0) {
      startMonth = 11;
      startYear -= 1;
    }
  }

  const start = new Date(startYear, startMonth, cycleStartDay, 0, 0, 0, 0);
  const end = new Date(startYear, startMonth + 1, cycleStartDay - 1, 23, 59, 59, 999);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const label = `${monthNames[startMonth]} ${startYear}`;

  return { start, end, label };
}

export function getCurrentCycle(cycleStartDay: number): CycleRange {
  return getCycleRange(new Date(), cycleStartDay);
}

export function getLastNMonths(n: number, cycleStartDay: number): CycleRange[] {
  const ranges: CycleRange[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, cycleStartDay);
    ranges.push(getCycleRange(ref, cycleStartDay));
  }
  return ranges.reverse();
}

export function isInRange(dateStr: string, range: CycleRange): boolean {
  const d = new Date(dateStr);
  return d >= range.start && d <= range.end;
}

export function formatCycleRange(range: CycleRange): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  return `${range.start.toLocaleDateString('en-GB', opts)} → ${range.end.toLocaleDateString('en-GB', opts)}`;
}
