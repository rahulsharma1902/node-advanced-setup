const Bull = require('bull');
const { logInfo, logError, logWarning } = require('./logger');
const { config } = require('../config');

/**
 * Queue Manager
 * Handles background job processing with Bull Queue
 */
class QueueManager {
  constructor() {
    this.queues = new Map();
    this.processors = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize queue system
   */
  async initialize() {
    try {
      // Create default queues
      await this.createQueue('email', { concurrency: 5 });
      await this.createQueue('notification', { concurrency: 3 });
      await this.createQueue('file-processing', { concurrency: 2 });
      await this.createQueue('cleanup', { concurrency: 1 });
      await this.createQueue('analytics', { concurrency: 10 });

      // Register default processors
      this.registerProcessors();

      this.isInitialized = true;
      logInfo('Queue system initialized successfully');
    } catch (error) {
      logError(error, { context: 'Failed to initialize queue system' });
      throw error;
    }
  }

  /**
   * Create a new queue
   */
  async createQueue(name, options = {}) {
    try {
      const queueOptions = {
        redis: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db || 0,
        },
        defaultJobOptions: {
          removeOnComplete: options.removeOnComplete || 10,
          removeOnFail: options.removeOnFail || 5,
          attempts: options.attempts || 3,
          backoff: {
            type: 'exponential',
            delay: options.backoffDelay || 2000,
          },
        },
        settings: {
          stalledInterval: 30000,
          maxStalledCount: 1,
        },
      };

      const queue = new Bull(name, queueOptions);

      // Queue event handlers
      queue.on('ready', () => {
        logInfo(`Queue ${name} is ready`);
      });

      queue.on('error', error => {
        logError(error, { context: `Queue ${name} error` });
      });

      queue.on('waiting', jobId => {
        logInfo(`Job ${jobId} is waiting in queue ${name}`);
      });

      queue.on('active', job => {
        logInfo(`Job ${job.id} started processing in queue ${name}`, {
          jobData: job.data,
        });
      });

      queue.on('completed', (job, result) => {
        logInfo(`Job ${job.id} completed in queue ${name}`, {
          result,
          duration: Date.now() - job.processedOn,
        });
      });

      queue.on('failed', (job, error) => {
        logError(error, {
          context: `Job ${job.id} failed in queue ${name}`,
          jobData: job.data,
          attempts: job.attemptsMade,
        });
      });

      queue.on('stalled', job => {
        logWarning(`Job ${job.id} stalled in queue ${name}`, {
          jobData: job.data,
        });
      });

      this.queues.set(name, queue);
      return queue;
    } catch (error) {
      logError(error, { context: `Failed to create queue ${name}` });
      throw error;
    }
  }

  /**
   * Get queue by name
   */
  getQueue(name) {
    return this.queues.get(name);
  }

  /**
   * Add job to queue
   */
  async addJob(queueName, jobName, data, options = {}) {
    try {
      const queue = this.getQueue(queueName);
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      const jobOptions = {
        priority: options.priority || 0,
        delay: options.delay || 0,
        attempts: options.attempts || 3,
        removeOnComplete: options.removeOnComplete || 10,
        removeOnFail: options.removeOnFail || 5,
        ...options,
      };

      const job = await queue.add(jobName, data, jobOptions);

      logInfo(`Job ${job.id} added to queue ${queueName}`, {
        jobName,
        jobData: data,
        options: jobOptions,
      });

      return job;
    } catch (error) {
      logError(error, {
        context: `Failed to add job to queue ${queueName}`,
        jobName,
        data,
      });
      throw error;
    }
  }

  /**
   * Register job processors
   */
  registerProcessors() {
    // Email queue processors
    this.registerProcessor('email', 'send-email', this.processEmailJob);
    this.registerProcessor('email', 'send-bulk-email', this.processBulkEmailJob);
    this.registerProcessor('email', 'send-template-email', this.processTemplateEmailJob);

    // Notification queue processors
    this.registerProcessor('notification', 'send-push', this.processPushNotificationJob);
    this.registerProcessor('notification', 'send-sms', this.processSMSJob);
    this.registerProcessor('notification', 'send-slack', this.processSlackNotificationJob);

    // File processing queue processors
    this.registerProcessor('file-processing', 'resize-image', this.processImageResizeJob);
    this.registerProcessor('file-processing', 'generate-thumbnail', this.processThumbnailJob);
    this.registerProcessor('file-processing', 'upload-to-s3', this.processS3UploadJob);

    // Cleanup queue processors
    this.registerProcessor('cleanup', 'cleanup-temp-files', this.processCleanupTempFilesJob);
    this.registerProcessor('cleanup', 'cleanup-old-logs', this.processCleanupLogsJob);
    this.registerProcessor('cleanup', 'cleanup-expired-tokens', this.processCleanupTokensJob);

    // Analytics queue processors
    this.registerProcessor('analytics', 'track-event', this.processAnalyticsEventJob);
    this.registerProcessor('analytics', 'generate-report', this.processReportGenerationJob);
  }

  /**
   * Register a job processor
   */
  registerProcessor(queueName, jobName, processor, concurrency = 1) {
    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const processorKey = `${queueName}:${jobName}`;
    this.processors.set(processorKey, processor);

    queue.process(jobName, concurrency, async job => {
      try {
        const result = await processor(job);
        return result;
      } catch (error) {
        logError(error, {
          context: `Processor error for ${processorKey}`,
          jobId: job.id,
          jobData: job.data,
        });
        throw error;
      }
    });

    logInfo(`Registered processor for ${processorKey} with concurrency ${concurrency}`);
  }

  /**
   * Email job processors
   */
  async processEmailJob(job) {
    const { to, subject, text, html, attachments } = job.data;

    // Import email service dynamically to avoid circular dependencies
    const { sendCustomEmail } = require('../services/email/email.service');

    const result = await sendCustomEmail({
      to,
      subject,
      text,
      html,
      attachments,
    });

    return result;
  }

  async processBulkEmailJob(job) {
    const { emails } = job.data;
    const { sendBulkEmails } = require('../services/email/email.service');

    const results = await sendBulkEmails(emails);
    return results;
  }

  async processTemplateEmailJob(job) {
    const { to, template, variables } = job.data;
    const { sendTemplateEmail } = require('../services/email/email.service');

    const result = await sendTemplateEmail(to, template, variables);
    return result;
  }

  /**
   * Notification job processors
   */
  async processPushNotificationJob(job) {
    const { userId, title, body, data } = job.data;

    // Implement push notification logic here
    logInfo('Processing push notification', { userId, title });

    return { success: true, userId, title };
  }

  async processSMSJob(job) {
    const { to, message } = job.data;
    const { createTwilioClient } = require('./httpClient');

    if (!process.env.TWILIO_ACCOUNT_SID) {
      throw new Error('Twilio not configured');
    }

    const twilio = createTwilioClient(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );

    const result = await twilio.post('/Messages.json', {
      From: process.env.TWILIO_PHONE_NUMBER,
      To: to,
      Body: message,
    });

    return result;
  }

  async processSlackNotificationJob(job) {
    const { channel, message, attachments } = job.data;
    const { createSlackClient } = require('./httpClient');

    if (!process.env.SLACK_BOT_TOKEN) {
      throw new Error('Slack not configured');
    }

    const slack = createSlackClient(process.env.SLACK_BOT_TOKEN);

    const result = await slack.post('/chat.postMessage', {
      channel,
      text: message,
      attachments,
    });

    return result;
  }

  /**
   * File processing job processors
   */
  async processImageResizeJob(job) {
    const { filePath, width, height, outputPath } = job.data;
    const sharp = require('sharp');

    await sharp(filePath).resize(width, height).toFile(outputPath);

    return { success: true, outputPath };
  }

  async processThumbnailJob(job) {
    const { filePath, outputPath } = job.data;
    const sharp = require('sharp');

    await sharp(filePath).resize(200, 200).toFile(outputPath);

    return { success: true, outputPath };
  }

  async processS3UploadJob(job) {
    const { filePath, bucketName, key } = job.data;
    const AWS = require('aws-sdk');
    const fs = require('fs');

    const s3 = new AWS.S3();
    const fileContent = fs.readFileSync(filePath);

    const params = {
      Bucket: bucketName,
      Key: key,
      Body: fileContent,
    };

    const result = await s3.upload(params).promise();
    return result;
  }

  /**
   * Cleanup job processors
   */
  async processCleanupTempFilesJob(job) {
    const fs = require('fs').promises;
    const path = require('path');

    const tempDir = job.data.tempDir || './temp';
    const maxAge = job.data.maxAge || 24 * 60 * 60 * 1000; // 24 hours

    try {
      const files = await fs.readdir(tempDir);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);

        if (Date.now() - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      return { deletedCount };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { deletedCount: 0, message: 'Temp directory not found' };
      }
      throw error;
    }
  }

  async processCleanupLogsJob(job) {
    const fs = require('fs').promises;
    const path = require('path');

    const logDir = job.data.logDir || './logs';
    const maxAge = job.data.maxAge || 30 * 24 * 60 * 60 * 1000; // 30 days

    try {
      const files = await fs.readdir(logDir);
      let deletedCount = 0;

      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(logDir, file);
          const stats = await fs.stat(filePath);

          if (Date.now() - stats.mtime.getTime() > maxAge) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        }
      }

      return { deletedCount };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { deletedCount: 0, message: 'Log directory not found' };
      }
      throw error;
    }
  }

  async processCleanupTokensJob(job) {
    // Clean up expired JWT tokens from blacklist or database
    const { cache } = require('./cache');

    const pattern = 'blacklist:*';
    const keys = await cache.keys(pattern);
    let deletedCount = 0;

    for (const key of keys) {
      const exists = await cache.exists(key);
      if (!exists) {
        deletedCount++;
      }
    }

    return { deletedCount };
  }

  /**
   * Analytics job processors
   */
  async processAnalyticsEventJob(job) {
    const { event, userId, properties } = job.data;

    // Send to analytics service (e.g., Google Analytics, Mixpanel)
    logInfo('Processing analytics event', { event, userId, properties });

    return { success: true, event, userId };
  }

  async processReportGenerationJob(job) {
    const { reportType, dateRange, userId } = job.data;

    // Generate report logic here
    logInfo('Generating report', { reportType, dateRange, userId });

    return {
      success: true,
      reportType,
      generatedAt: new Date().toISOString(),
      downloadUrl: `/reports/${reportType}-${Date.now()}.pdf`,
    };
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName) {
    const queue = this.getQueue(queueName);
    if (!queue) {
      return null;
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      name: queueName,
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats() {
    const stats = {};

    for (const queueName of this.queues.keys()) {
      stats[queueName] = await this.getQueueStats(queueName);
    }

    return stats;
  }

  /**
   * Pause queue
   */
  async pauseQueue(queueName) {
    const queue = this.getQueue(queueName);
    if (queue) {
      await queue.pause();
      logInfo(`Queue ${queueName} paused`);
    }
  }

  /**
   * Resume queue
   */
  async resumeQueue(queueName) {
    const queue = this.getQueue(queueName);
    if (queue) {
      await queue.resume();
      logInfo(`Queue ${queueName} resumed`);
    }
  }

  /**
   * Clean queue
   */
  async cleanQueue(queueName, grace = 0, status = 'completed') {
    const queue = this.getQueue(queueName);
    if (queue) {
      const result = await queue.clean(grace, status);
      logInfo(`Cleaned ${result.length} jobs from queue ${queueName}`);
      return result;
    }
    return [];
  }

  /**
   * Close all queues
   */
  async close() {
    const closePromises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.all(closePromises);
    logInfo('All queues closed');
  }
}

// Create queue manager instance
const queueManager = new QueueManager();

/**
 * Helper functions for common queue operations
 */
const addEmailJob = (emailData, options = {}) => {
  return queueManager.addJob('email', 'send-email', emailData, options);
};

const addBulkEmailJob = (emails, options = {}) => {
  return queueManager.addJob('email', 'send-bulk-email', { emails }, options);
};

const addNotificationJob = (type, data, options = {}) => {
  return queueManager.addJob('notification', `send-${type}`, data, options);
};

const addFileProcessingJob = (type, data, options = {}) => {
  return queueManager.addJob('file-processing', type, data, options);
};

const addCleanupJob = (type, data, options = {}) => {
  return queueManager.addJob('cleanup', type, data, options);
};

const addAnalyticsJob = (type, data, options = {}) => {
  return queueManager.addJob('analytics', type, data, options);
};

module.exports = {
  queueManager,
  addEmailJob,
  addBulkEmailJob,
  addNotificationJob,
  addFileProcessingJob,
  addCleanupJob,
  addAnalyticsJob,
};
