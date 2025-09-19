const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const { logInfo, logError, logWarning } = require('./logger');
const { cache } = require('./cache');

/**
 * Database Migration Manager
 * Handles database schema migrations and versioning
 */
class MigrationManager {
  constructor() {
    this.migrationsPath = path.join(process.cwd(), 'migrations');
    this.migrationCollection = 'migrations';
    this.isInitialized = false;
  }

  /**
   * Initialize migration system
   */
  async initialize() {
    try {
      // Ensure migrations directory exists
      await this.ensureMigrationsDirectory();

      // Create migrations collection if it doesn't exist
      await this.ensureMigrationsCollection();

      this.isInitialized = true;
      logInfo('Migration system initialized successfully');
    } catch (error) {
      logError(error, { context: 'Failed to initialize migration system' });
      throw error;
    }
  }

  /**
   * Ensure migrations directory exists
   */
  async ensureMigrationsDirectory() {
    try {
      await fs.mkdir(this.migrationsPath, { recursive: true });
      logInfo('Migrations directory ensured', { path: this.migrationsPath });
    } catch (error) {
      logError(error, { context: 'Failed to create migrations directory' });
      throw error;
    }
  }

  /**
   * Ensure migrations collection exists
   */
  async ensureMigrationsCollection() {
    try {
      const db = mongoose.connection.db;
      const collections = await db.listCollections({ name: this.migrationCollection }).toArray();

      if (collections.length === 0) {
        await db.createCollection(this.migrationCollection);
        logInfo('Migrations collection created');
      }
    } catch (error) {
      logError(error, { context: 'Failed to ensure migrations collection' });
      throw error;
    }
  }

  /**
   * Create a new migration file
   */
  async createMigration(name, description = '') {
    try {
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
      const filename = `${timestamp}_${name.toLowerCase().replace(/\s+/g, '_')}.js`;
      const filepath = path.join(this.migrationsPath, filename);

      const migrationTemplate = this.generateMigrationTemplate(name, description);

      await fs.writeFile(filepath, migrationTemplate, 'utf8');

      logInfo('Migration file created', { filename, filepath });

      return {
        filename,
        filepath,
        timestamp,
        name,
      };
    } catch (error) {
      logError(error, { context: 'Failed to create migration file', name });
      throw error;
    }
  }

  /**
   * Generate migration template
   */
  generateMigrationTemplate(name, description) {
    return `/**
 * Migration: ${name}
 * Description: ${description}
 * Created: ${new Date().toISOString()}
 */

const mongoose = require('mongoose');

module.exports = {
  /**
   * Migration up - apply changes
   */
  async up() {
    const db = mongoose.connection.db;
    
    try {
      // Add your migration logic here
      console.log('Running migration: ${name}');
      
      // Example: Create new collection
      // await db.createCollection('new_collection');
      
      // Example: Add index
      // await db.collection('users').createIndex({ email: 1 }, { unique: true });
      
      // Example: Update documents
      // await db.collection('users').updateMany(
      //   { status: { $exists: false } },
      //   { $set: { status: 'active' } }
      // );
      
      console.log('Migration ${name} completed successfully');
    } catch (error) {
      console.error('Migration ${name} failed:', error);
      throw error;
    }
  },

  /**
   * Migration down - rollback changes
   */
  async down() {
    const db = mongoose.connection.db;
    
    try {
      // Add your rollback logic here
      console.log('Rolling back migration: ${name}');
      
      // Example: Drop collection
      // await db.collection('new_collection').drop();
      
      // Example: Drop index
      // await db.collection('users').dropIndex({ email: 1 });
      
      // Example: Revert document updates
      // await db.collection('users').updateMany(
      //   { status: 'active' },
      //   { $unset: { status: 1 } }
      // );
      
      console.log('Migration ${name} rolled back successfully');
    } catch (error) {
      console.error('Migration ${name} rollback failed:', error);
      throw error;
    }
  }
};`;
  }

  /**
   * Get all migration files
   */
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      const migrationFiles = files
        .filter(file => file.endsWith('.js'))
        .sort()
        .map(file => {
          const [timestamp, ...nameParts] = file.replace('.js', '').split('_');
          return {
            filename: file,
            filepath: path.join(this.migrationsPath, file),
            timestamp,
            name: nameParts.join('_'),
          };
        });

      return migrationFiles;
    } catch (error) {
      logError(error, { context: 'Failed to get migration files' });
      return [];
    }
  }

  /**
   * Get executed migrations from database
   */
  async getExecutedMigrations() {
    try {
      const db = mongoose.connection.db;
      const migrations = await db
        .collection(this.migrationCollection)
        .find({})
        .sort({ executedAt: 1 })
        .toArray();

      return migrations;
    } catch (error) {
      logError(error, { context: 'Failed to get executed migrations' });
      return [];
    }
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations() {
    try {
      const allMigrations = await this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();
      const executedFilenames = new Set(executedMigrations.map(m => m.filename));

      const pendingMigrations = allMigrations.filter(
        migration => !executedFilenames.has(migration.filename),
      );

      return pendingMigrations;
    } catch (error) {
      logError(error, { context: 'Failed to get pending migrations' });
      return [];
    }
  }

  /**
   * Run a single migration
   */
  async runMigration(migrationFile, direction = 'up') {
    try {
      const startTime = Date.now();

      // Load migration module
      const migrationPath = migrationFile.filepath;
      delete require.cache[require.resolve(migrationPath)];
      const migration = require(migrationPath);

      // Execute migration
      if (direction === 'up') {
        await migration.up();

        // Record migration execution
        await this.recordMigrationExecution(migrationFile);
      } else {
        await migration.down();

        // Remove migration record
        await this.removeMigrationRecord(migrationFile);
      }

      const duration = Date.now() - startTime;

      logInfo(`Migration ${direction} completed`, {
        filename: migrationFile.filename,
        direction,
        duration,
      });

      return { success: true, duration };
    } catch (error) {
      logError(error, {
        context: `Migration ${direction} failed`,
        filename: migrationFile.filename,
      });
      throw error;
    }
  }

  /**
   * Record migration execution in database
   */
  async recordMigrationExecution(migrationFile) {
    try {
      const db = mongoose.connection.db;
      await db.collection(this.migrationCollection).insertOne({
        filename: migrationFile.filename,
        name: migrationFile.name,
        timestamp: migrationFile.timestamp,
        executedAt: new Date(),
        version: process.env.npm_package_version || '1.0.0',
      });
    } catch (error) {
      logError(error, { context: 'Failed to record migration execution' });
      throw error;
    }
  }

  /**
   * Remove migration record from database
   */
  async removeMigrationRecord(migrationFile) {
    try {
      const db = mongoose.connection.db;
      await db.collection(this.migrationCollection).deleteOne({
        filename: migrationFile.filename,
      });
    } catch (error) {
      logError(error, { context: 'Failed to remove migration record' });
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async migrate() {
    try {
      const pendingMigrations = await this.getPendingMigrations();

      if (pendingMigrations.length === 0) {
        logInfo('No pending migrations to run');
        return { migrationsRun: 0, results: [] };
      }

      logInfo(`Running ${pendingMigrations.length} pending migrations`);

      const results = [];

      for (const migration of pendingMigrations) {
        try {
          const result = await this.runMigration(migration, 'up');
          results.push({
            filename: migration.filename,
            success: true,
            duration: result.duration,
          });
        } catch (error) {
          results.push({
            filename: migration.filename,
            success: false,
            error: error.message,
          });

          // Stop on first failure
          logError(error, { context: 'Migration failed, stopping execution' });
          break;
        }
      }

      const successCount = results.filter(r => r.success).length;

      logInfo('Migration batch completed', {
        total: pendingMigrations.length,
        successful: successCount,
        failed: results.length - successCount,
      });

      return {
        migrationsRun: successCount,
        results,
      };
    } catch (error) {
      logError(error, { context: 'Failed to run migrations' });
      throw error;
    }
  }

  /**
   * Rollback last migration
   */
  async rollback(count = 1) {
    try {
      const executedMigrations = await this.getExecutedMigrations();

      if (executedMigrations.length === 0) {
        logInfo('No migrations to rollback');
        return { migrationsRolledBack: 0, results: [] };
      }

      // Get last N migrations to rollback
      const migrationsToRollback = executedMigrations.slice(-count).reverse(); // Rollback in reverse order

      logInfo(`Rolling back ${migrationsToRollback.length} migrations`);

      const results = [];

      for (const executedMigration of migrationsToRollback) {
        try {
          // Find migration file
          const migrationFiles = await this.getMigrationFiles();
          const migrationFile = migrationFiles.find(f => f.filename === executedMigration.filename);

          if (!migrationFile) {
            throw new Error(`Migration file not found: ${executedMigration.filename}`);
          }

          const result = await this.runMigration(migrationFile, 'down');
          results.push({
            filename: migrationFile.filename,
            success: true,
            duration: result.duration,
          });
        } catch (error) {
          results.push({
            filename: executedMigration.filename,
            success: false,
            error: error.message,
          });

          // Stop on first failure
          logError(error, { context: 'Rollback failed, stopping execution' });
          break;
        }
      }

      const successCount = results.filter(r => r.success).length;

      logInfo('Rollback batch completed', {
        total: migrationsToRollback.length,
        successful: successCount,
        failed: results.length - successCount,
      });

      return {
        migrationsRolledBack: successCount,
        results,
      };
    } catch (error) {
      logError(error, { context: 'Failed to rollback migrations' });
      throw error;
    }
  }

  /**
   * Get migration status
   */
  async getStatus() {
    try {
      const allMigrations = await this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();
      const pendingMigrations = await this.getPendingMigrations();

      const executedMap = new Map(executedMigrations.map(m => [m.filename, m]));

      const status = allMigrations.map(migration => ({
        filename: migration.filename,
        name: migration.name,
        timestamp: migration.timestamp,
        executed: executedMap.has(migration.filename),
        executedAt: executedMap.get(migration.filename)?.executedAt || null,
      }));

      return {
        total: allMigrations.length,
        executed: executedMigrations.length,
        pending: pendingMigrations.length,
        migrations: status,
      };
    } catch (error) {
      logError(error, { context: 'Failed to get migration status' });
      throw error;
    }
  }

  /**
   * Validate migration files
   */
  async validateMigrations() {
    try {
      const migrationFiles = await this.getMigrationFiles();
      const validationResults = [];

      for (const migrationFile of migrationFiles) {
        try {
          // Try to load migration
          const migrationPath = migrationFile.filepath;
          delete require.cache[require.resolve(migrationPath)];
          const migration = require(migrationPath);

          // Check if required methods exist
          const hasUp = typeof migration.up === 'function';
          const hasDown = typeof migration.down === 'function';

          validationResults.push({
            filename: migrationFile.filename,
            valid: hasUp && hasDown,
            hasUp,
            hasDown,
            error: null,
          });
        } catch (error) {
          validationResults.push({
            filename: migrationFile.filename,
            valid: false,
            hasUp: false,
            hasDown: false,
            error: error.message,
          });
        }
      }

      const validCount = validationResults.filter(r => r.valid).length;

      logInfo('Migration validation completed', {
        total: migrationFiles.length,
        valid: validCount,
        invalid: migrationFiles.length - validCount,
      });

      return {
        total: migrationFiles.length,
        valid: validCount,
        invalid: migrationFiles.length - validCount,
        results: validationResults,
      };
    } catch (error) {
      logError(error, { context: 'Failed to validate migrations' });
      throw error;
    }
  }

  /**
   * Reset migrations (DANGEROUS - only for development)
   */
  async reset() {
    try {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Migration reset is not allowed in production');
      }

      const db = mongoose.connection.db;
      await db.collection(this.migrationCollection).deleteMany({});

      logWarning('All migration records reset - USE WITH CAUTION');

      return { success: true, message: 'Migration records reset' };
    } catch (error) {
      logError(error, { context: 'Failed to reset migrations' });
      throw error;
    }
  }
}

// Create migration manager instance
const migrationManager = new MigrationManager();

module.exports = {
  migrationManager,
  MigrationManager,
};
