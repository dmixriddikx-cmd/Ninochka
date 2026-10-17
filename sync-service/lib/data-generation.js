// Generation 3 starts an independent budget with no legacy migration. Legacy and generation-2 deployments
// continue to use the original root objects and cannot overwrite this data.
export const BUDGET_PATH = 'generation-3/family-budget.json';
export const INBOX_PATH = 'generation-3/family-expense-inbox.json';
export const historyPath = name => `generation-3/history/${name}`;
