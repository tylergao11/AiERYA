/** Spirit is spendable run currency. Combat investment still determines spell power separately. */
export const ECONOMY = {
  preparationCostMultiplier: 2,
  strokePrice: 1, killIncome: .2, salvageShare: .8,
  wardLifetime: 240, wardShotWear: 1 / 320,
  reserveGrant: 30, incomeGrowth: .3,
  waveRecovery: 50,
  repairPrice: 12, repairHealth: 20,
} as const;
