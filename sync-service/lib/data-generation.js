// Generation 2 is an explicit writer barrier. Legacy immutable deployments
// continue to use the original root objects and cannot overwrite this data.
export const BUDGET_PATH = 'generation-2/family-budget.json';
export const INBOX_PATH = 'generation-2/family-expense-inbox.json';
export const historyPath = name => `generation-2/history/${name}`;
