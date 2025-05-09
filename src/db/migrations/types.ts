import { PoolClient } from 'pg';

export interface MigrationContext {
  client: PoolClient;
  releaseClient: boolean;
}

export interface Migration {
  name: string;
  up: (context: MigrationContext) => Promise<void>;
  down: (context: MigrationContext) => Promise<void>;
} 