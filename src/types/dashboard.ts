export type DashboardResponse = {
  data: {
    metrics: {
      todayRevenue: number;
      pendingPayments: number;
      cashInHand: number;
      lowStockItems: Array<{
        _id: string;
        name: string;
        quantity: number;
        lowStockThreshold: number;
      }>;
    };
    revenueWeek: {
      weekOffset: number;
      days: { key: string; label: string; revenue: number }[];
    };
    categoryPie: {
      rows: { id: string; name: string; value: number; color?: string | null }[];
      total: number;
      range: string;
    };
    traffic: {
      hours: { hour: number; count: number }[];
      peak: { hour: number; count: number };
    };
    credit: {
      highestDues: unknown[];
      longestSincePayment: unknown[];
    };
  };
};
