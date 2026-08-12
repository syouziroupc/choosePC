export interface RevenueAssumptions {
  sessions: number;
  diagnosisStartRate: number;
  diagnosisCompletionRate: number;
  offerClickRate: number;
  externalPurchaseCvr: number;
  averageCommissionJpy: number;
  purchaseConsultationRate: number;
  purchaseCloseRate: number;
  averageOwnSaleGrossProfitJpy: number;
  repairLeadRate: number;
  repairCloseRate: number;
  averageRepairGrossProfitJpy: number;
  buybackLeadRate: number;
  buybackCloseRate: number;
  averageResaleGrossProfitJpy: number;
}

export interface RevenueForecast {
  affiliate: number;
  ownSales: number;
  repair: number;
  buyback: number;
  grossContribution: number;
}

export function forecastRevenue(a: RevenueAssumptions): RevenueForecast {
  const affiliate =
    a.sessions * a.diagnosisStartRate * a.diagnosisCompletionRate *
    a.offerClickRate * a.externalPurchaseCvr * a.averageCommissionJpy;
  const ownSales =
    a.sessions * a.purchaseConsultationRate * a.purchaseCloseRate *
    a.averageOwnSaleGrossProfitJpy;
  const repair =
    a.sessions * a.repairLeadRate * a.repairCloseRate *
    a.averageRepairGrossProfitJpy;
  const buyback =
    a.sessions * a.buybackLeadRate * a.buybackCloseRate *
    a.averageResaleGrossProfitJpy;
  return {
    affiliate,
    ownSales,
    repair,
    buyback,
    grossContribution: affiliate + ownSales + repair + buyback,
  };
}
