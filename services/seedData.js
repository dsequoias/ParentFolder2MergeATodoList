/**
 * Seed data for TodosTB (matches TodoDB.db / insert_10_TodosTB.sql).
 * Loaded when TodosTB is empty so the app shows TodoDB.db-style data.
 */
export const TODOS_SEED = [
  { Task: 'Call client', Date: '2026-02-15', Time: '09:00:00', Completed: 1, Notes: 'Follow up on project proposal', CompletDateTime: '2026-02-15 09:00:00' },
  { Task: 'Prepare presentation', Date: '2026-02-18', Time: '14:30:00', Completed: 0, Notes: 'Quarterly review slides', CompletDateTime: null },
  { Task: 'Review contract', Date: '2026-02-12', Time: '11:00:00', Completed: 1, Notes: 'Legal review and sign-off', CompletDateTime: '2026-02-12 11:00:00' },
  { Task: 'Team standup', Date: '2026-02-17', Time: '10:00:00', Completed: 0, Notes: 'Daily sync meeting', CompletDateTime: null },
  { Task: 'Ship release', Date: '2026-02-10', Time: '16:00:00', Completed: 1, Notes: 'Version 2.0 deployment', CompletDateTime: '2026-02-10 16:00:00' },
  { Task: 'Update documentation', Date: '2026-02-20', Time: '13:00:00', Completed: 0, Notes: 'API docs and user guide', CompletDateTime: null },
  { Task: 'Budget review', Date: '2026-02-14', Time: '15:30:00', Completed: 1, Notes: 'Monthly financial review', CompletDateTime: '2026-02-14 15:30:00' },
  { Task: 'Interview candidate', Date: '2026-02-19', Time: '10:30:00', Completed: 0, Notes: 'Software engineer position', CompletDateTime: null },
  { Task: 'Order supplies', Date: '2026-02-11', Time: '08:45:00', Completed: 1, Notes: 'Office and team supplies', CompletDateTime: '2026-02-11 08:45:00' },
  { Task: 'Plan sprint', Date: '2026-02-21', Time: '09:30:00', Completed: 0, Notes: 'Next two-week sprint planning', CompletDateTime: null },
];
