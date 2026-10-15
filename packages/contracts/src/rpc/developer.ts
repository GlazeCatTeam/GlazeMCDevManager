// Developer level and platform overview capabilities; read-only data from the developer API

/** Optional account selector; capabilities default to the current account */
export interface AccountParams {
  /** Local account id; omit to use the current account. Never switches the UI's current account */
  account?: string | undefined;
}

export interface ContributionScore {
  /** Score as the platform formats it, e.g. "1280.5" */
  score: string;
  rank: number;
  /** Contribution class from the platform */
  grade: number;
}

export interface DeveloperLevel {
  level: number;
  /** Developer class (阶); moving up needs the class-upgrade task */
  levelClass: number;
  expFloor: number;
  expCeiling: number;
  totalExp: number;
  upgradeClassAchieve: boolean;
  /** Month the contribution scores belong to, as the platform sends it */
  contributionMonth: string | null;
  contribution: ContributionScore | null;
  netGameContribution: ContributionScore | null;
}

/** Diamonds and downloads for the whole account, as shown on the platform's home page */
export interface AnalyticsOverview {
  thisMonthDiamond: number;
  lastMonthDiamond: number;
  thisMonthDownload: number;
  lastMonthDownload: number;
  yesterdayDiamond: number;
  days14AverageDiamond: number;
  yesterdayDownload: number;
  days14AverageDownload: number;
}
