import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const workspaceState = sqliteTable('workspace_state', {
  owner: text('owner').primaryKey(),
  data: text('data').notNull(),
  version: integer('version').notNull().default(1),
});
