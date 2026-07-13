import { getAppSetting, setAppSetting } from "./app-settings";
import { format, isAfter, isBefore, isEqual, parseISO, startOfDay, endOfDay, isWithinInterval } from "date-fns";

export interface FinancialYearConfig {
  startMonth: number; // 4 for April
  startDay: number; // 1
  earlyClosedEnds: string[]; // e.g. ["2026-03-31"]
}

export const DEFAULT_FY_CONFIG: FinancialYearConfig = {
  startMonth: 4,
  startDay: 1,
  earlyClosedEnds: [],
};

export class PeriodLockedError extends Error {
  constructor(message = "This financial year is closed. You can view or export data, but cannot change it.") {
    super(message);
    this.name = "PeriodLockedError";
  }
}

/**
 * Gets the financial year range [start, end] that the given date falls into.
 * E.g. for Indian FY (Apr-Mar), a date of 2025-05-10 returns [2025-04-01, 2026-03-31].
 * A date of 2025-02-15 returns [2024-04-01, 2025-03-31].
 */
export function getFyRange(date: Date, config: FinancialYearConfig = DEFAULT_FY_CONFIG): { start: Date; end: Date; label: string } {
  const d = startOfDay(date);
  const month = d.getMonth() + 1; // 1-12
  const day = d.getDate();

  let startYear = d.getFullYear();

  if (month < config.startMonth || (month === config.startMonth && day < config.startDay)) {
    // Before the start month/day of the current calendar year's FY
    startYear -= 1;
  }

  const start = new Date(startYear, config.startMonth - 1, config.startDay);
  
  // End date is one day before the next start date
  const nextStart = new Date(startYear + 1, config.startMonth - 1, config.startDay);
  const end = new Date(nextStart.getTime() - 24 * 60 * 60 * 1000);

  const label = `${startYear}-${String(startYear + 1).slice(2)}`;

  return { start, end: endOfDay(end), label };
}

export async function getFinancialYearConfig(): Promise<FinancialYearConfig> {
  const cfg = await getAppSetting<FinancialYearConfig>("financialYear.config");
  return cfg || DEFAULT_FY_CONFIG;
}

export async function setFinancialYearConfig(config: FinancialYearConfig): Promise<void> {
  await setAppSetting("financialYear.config", config);
}

/**
 * Returns whether a date is locked (cannot be modified).
 */
export async function isDateLocked(date: Date, config?: FinancialYearConfig): Promise<boolean> {
  const cfg = config || (await getFinancialYearConfig());
  const { end } = getFyRange(date, cfg);
  
  // 1. Auto-lock: if the FY end has passed (before today's start of day)
  const today = startOfDay(new Date());
  if (isBefore(end, today)) {
    return true;
  }

  // 2. Early close: if the FY end date string is in the earlyClosedEnds array
  const endDateStr = format(end, "yyyy-MM-dd");
  if (cfg.earlyClosedEnds.includes(endDateStr)) {
    return true;
  }

  return false;
}

export async function assertDateWritable(date: Date, config?: FinancialYearConfig): Promise<void> {
  if (await isDateLocked(date, config)) {
    throw new PeriodLockedError();
  }
}

/**
 * Asserts that the entire period between start and end is writable.
 * e.g., for payroll periods or ranges.
 */
export async function assertPeriodWritable(start: Date, end: Date, config?: FinancialYearConfig): Promise<void> {
  await assertDateWritable(start, config);
  await assertDateWritable(end, config);
}

export async function getActiveFyRange(config?: FinancialYearConfig): Promise<{ start: Date; end: Date; label: string }> {
    const cfg = config || (await getFinancialYearConfig());
    let currentDate = new Date();
    
    // We keep shifting the target date forward until we find an unlocked FY
    let range = getFyRange(currentDate, cfg);
    
    while (await isDateLocked(range.start, cfg)) {
        // Shift date to the next FY
        currentDate = new Date(range.end.getTime() + 2 * 24 * 60 * 60 * 1000); 
        range = getFyRange(currentDate, cfg);
    }
    
    return range;
}
