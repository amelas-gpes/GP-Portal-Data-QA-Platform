import type { BIRow } from '../types';

export const REQUIRED_COLUMNS = [
  'Company Group Code',
  'Company Name',
  'Company Subcategory Type',
  'Investor Type',
  'Investor Group Name',
  'Investor No_',
  'Investor Short Code',
  'Posting Date',
  'Investor Total Commitments',
  'Contributions that affect remaining commitment',
  'Recallable Distributions',
  'Waiver',
  'Unfunded Capital Adjustment',
  'Investor Available Unfunded Commitments',
  'Actual Contributions',
  'Actual Distributions',
  'Placement fee and syndication costs',
  'Net Investment Income/(Loss)',
  'Realized Investment Gain/Loss',
  'Unrealized Investment Gain/Loss',
  'Transfer of Interest',
  'Capital Account Balance',
  'Carry Balance',
  'Carry Transfer',
  'Ending NAV - Gross Carry',
  'Carry Realized',
  'Carry Unrealized',
  'Carry Paid',
  'ITD Contributions',
  'ITD Gross Contributions',
  'Investments Value',
  'CAPCALLDIST Code',
  'Total Contributions',
  'Total Distributions',
  'Investment Strategy',
  'Accounting Basis',
  'Fund Currency Code',
  'Auditor',
  'Investor Mgt Fee Pct During IP',
  'Investor Mgt Fee Pct Thereafter',
  'Investor Mgt Fee % Thereafter Description',
  'Model Type',
  'Investor Carried Interest Pct',
  'Investor Carried Interest % Description',
  'Investor Hurdle Rate or Preferred Return',
  'Investor Hurdle Rate/Preferred Return Description',
  'Investor Side Letter Date',
  'Date of most recent partnership agreement',
  'Date operations commenced',
  'Investment Cost',
  'Investment Realized Distribution',
  'Special Profits',
  'Partner Transfer',
  'Partner Transfer Investment Activity',
  'Partner Transfer Contribution',
  'Actual Investment Activity',
] as const;

// Columns the BI schema knows about but that real exports may omit. When absent
// the import downgrades to a warning instead of an error, and display code falls
// back to a populated alternative (e.g. Investor Group Name).
export const OPTIONAL_COLUMNS = ['Investor Portal Display Name'] as const;

export const EXPECTED_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS] as const;

export const HEADER_TO_KEY = {
  'Company Group Code': 'companyGroupCode',
  'Company Name': 'companyName',
  'Company Subcategory Type': 'companySubcategoryType',
  'Investor Type': 'investorType',
  'Investor Portal Display Name': 'investorPortalDisplayName',
  'Investor Group Name': 'investorGroupName',
  'Investor No_': 'investorNo',
  'Investor Short Code': 'investorShortCode',
  'Posting Date': 'postingDate',
  'Investor Total Commitments': 'investorTotalCommitments',
  'Contributions that affect remaining commitment': 'contributionsAffectRemainingCommitment',
  'Recallable Distributions': 'recallableDistributions',
  Waiver: 'waiver',
  'Unfunded Capital Adjustment': 'unfundedCapitalAdjustment',
  'Investor Available Unfunded Commitments': 'investorAvailableUnfundedCommitments',
  'Actual Contributions': 'actualContributions',
  'Actual Distributions': 'actualDistributions',
  'Placement fee and syndication costs': 'placementFees',
  'Net Investment Income/(Loss)': 'netInvestmentIncome',
  'Realized Investment Gain/Loss': 'realizedGain',
  'Unrealized Investment Gain/Loss': 'unrealizedGain',
  'Transfer of Interest': 'transferOfInterest',
  'Capital Account Balance': 'capitalAccountBalance',
  'Carry Balance': 'carryBalance',
  'Carry Transfer': 'carryTransfer',
  'Ending NAV - Gross Carry': 'endingNavGrossCarry',
  'Carry Realized': 'carryRealized',
  'Carry Unrealized': 'carryUnrealized',
  'Carry Paid': 'carryPaid',
  'ITD Contributions': 'itdContributions',
  'ITD Gross Contributions': 'itdGrossContributions',
  'Investments Value': 'investmentsValue',
  'CAPCALLDIST Code': 'capCallDistCode',
  'Total Contributions': 'totalContributions',
  'Total Distributions': 'totalDistributions',
  'Investment Strategy': 'investmentStrategy',
  'Accounting Basis': 'accountingBasis',
  'Fund Currency Code': 'fundCurrencyCode',
  Auditor: 'auditor',
  'Investor Mgt Fee Pct During IP': 'managementFeePctDuringIP',
  'Investor Mgt Fee Pct Thereafter': 'managementFeePctThereafter',
  'Investor Mgt Fee % Thereafter Description': 'managementFeePctThereafterDescription',
  'Model Type': 'modelType',
  'Investor Carried Interest Pct': 'carriedInterestPct',
  'Investor Carried Interest % Description': 'carriedInterestPctDescription',
  'Investor Hurdle Rate or Preferred Return': 'hurdleRatePreferredReturn',
  'Investor Hurdle Rate/Preferred Return Description': 'hurdleRatePreferredReturnDescription',
  'Investor Side Letter Date': 'investorSideLetterDate',
  'Date of most recent partnership agreement': 'dateMostRecentPartnershipAgreement',
  'Date operations commenced': 'dateOperationsCommenced',
  'Investment Cost': 'investmentCost',
  'Investment Realized Distribution': 'investmentRealizedDistribution',
  'Special Profits': 'specialProfits',
  'Partner Transfer': 'partnerTransfer',
  'Partner Transfer Investment Activity': 'partnerTransferInvestmentActivity',
  'Partner Transfer Contribution': 'partnerTransferContribution',
  'Actual Investment Activity': 'actualInvestmentActivity',
} as const;

export const FIELD_TO_HEADER = Object.fromEntries(
  Object.entries(HEADER_TO_KEY).map(([header, key]) => [key, header]),
) as Record<string, string>;

export const NUMERIC_KEYS = [
  'investorTotalCommitments',
  'contributionsAffectRemainingCommitment',
  'recallableDistributions',
  'waiver',
  'unfundedCapitalAdjustment',
  'investorAvailableUnfundedCommitments',
  'actualContributions',
  'actualDistributions',
  'placementFees',
  'netInvestmentIncome',
  'realizedGain',
  'unrealizedGain',
  'transferOfInterest',
  'capitalAccountBalance',
  'carryBalance',
  'carryTransfer',
  'endingNavGrossCarry',
  'carryRealized',
  'carryUnrealized',
  'carryPaid',
  'itdContributions',
  'itdGrossContributions',
  'investmentsValue',
  'totalContributions',
  'totalDistributions',
  'managementFeePctDuringIP',
  'managementFeePctThereafter',
  'carriedInterestPct',
  'hurdleRatePreferredReturn',
  'investmentCost',
  'investmentRealizedDistribution',
  'specialProfits',
  'partnerTransfer',
  'partnerTransferInvestmentActivity',
  'partnerTransferContribution',
  'actualInvestmentActivity',
] as const satisfies ReadonlyArray<keyof BIRow>;

export type NumericKey = (typeof NUMERIC_KEYS)[number];

export const DATE_KEYS = [
  'postingDate',
  'investorSideLetterDate',
  'dateMostRecentPartnershipAgreement',
  'dateOperationsCommenced',
] as const satisfies ReadonlyArray<keyof BIRow>;

export const STRING_KEYS = [
  'companyGroupCode',
  'companyName',
  'companySubcategoryType',
  'investorType',
  'investorPortalDisplayName',
  'investorGroupName',
  'investorNo',
  'investorShortCode',
  'capCallDistCode',
  'investmentStrategy',
  'accountingBasis',
  'fundCurrencyCode',
  'auditor',
  'managementFeePctThereafterDescription',
  'modelType',
  'carriedInterestPctDescription',
  'hurdleRatePreferredReturnDescription',
] as const satisfies ReadonlyArray<keyof BIRow>;

export const MONEY_KEYS = NUMERIC_KEYS.filter(
  (key) =>
    ![
      'managementFeePctDuringIP',
      'managementFeePctThereafter',
      'carriedInterestPct',
      'hurdleRatePreferredReturn',
    ].includes(key),
) as NumericKey[];

export function fieldToKey(field: string): NumericKey | null {
  const direct = HEADER_TO_KEY[field as keyof typeof HEADER_TO_KEY];
  if (direct && NUMERIC_KEYS.includes(direct as NumericKey)) return direct as NumericKey;
  if (NUMERIC_KEYS.includes(field as NumericKey)) return field as NumericKey;
  return null;
}

export function isKnownField(field: string): boolean {
  return field in HEADER_TO_KEY || NUMERIC_KEYS.includes(field as NumericKey);
}

