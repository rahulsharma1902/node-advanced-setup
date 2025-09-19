const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const { logInfo, logError, logWarning } = require('./logger');
const { config } = require('../config');
const { addFileProcessingJob } = require('./queue');

/**
 * File Storage Manager
 * Handles file uploads, processing, and storage (local and cloud)
 */
class FileStorageManager {
  constructor() {
    this.uploadPath = config.upload?.path || 'uploads/';
    this.maxFileSize = config.upload?.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.allowedTypes = config.upload?.allowedTypes || [
      'jpg',
      'jpeg',
      'png',
      'gif',
      'pdf',
      'doc',
      'docx',
    ];

    // Initialize AWS S3 if configured
    if (config.aws?.accessKeyId) {
      this.s3 = new AWS.S3({
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
        region: config.aws.region,
      });
      this.s3Bucket = config.aws.s3Bucket;
    }

    // Ensure upload directory exists
    this.ensureUploadDirectory();
  }

  /**
   * Ensure upload directory exists
   */
  async ensureUploadDirectory() {
    try {
      await fs.mkdir(this.uploadPath, { recursive: true });
      await fs.mkdir(path.join(this.uploadPath, 'temp'), { recursive: true });
      await fs.mkdir(path.join(this.uploadPath, 'images'), { recursive: true });
      await fs.mkdir(path.join(this.uploadPath, 'documents'), { recursive: true });
      await fs.mkdir(path.join(this.uploadPath, 'thumbnails'), { recursive: true });
    } catch (error) {
      logError(error, { context: 'Failed to create upload directories' });
    }
  }

  /**
   * Get file extension from filename
   */
  getFileExtension(filename) {
    return path.extname(filename).toLowerCase().substring(1);
  }

  /**
   * Check if file type is allowed
   */
  isAllowedFileType(filename) {
    const extension = this.getFileExtension(filename);
    return this.allowedTypes.includes(extension);
  }

  /**
   * Generate unique filename
   */
  generateUniqueFilename(originalName) {
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);
    const timestamp = Date.now();
    const uuid = uuidv4().substring(0, 8);

    return `${baseName}-${timestamp}-${uuid}${extension}`;
  }

  /**
   * Get file category based on extension
   */
  getFileCategory(filename) {
    const extension = this.getFileExtension(filename);

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) {
      return 'images';
    } else if (['pdf', 'doc', 'docx', 'txt', 'rtf'].includes(extension)) {
      return 'documents';
    } else if (['mp4', 'avi', 'mov', 'wmv', 'flv'].includes(extension)) {
      return 'videos';
    } else if (['mp3', 'wav', 'flac', 'aac'].includes(extension)) {
      return 'audio';
    }

    return 'misc';
  }

  /**
   * Create multer storage configuration
   */
  createMulterStorage(destination = 'temp') {
    return multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = path.join(this.uploadPath, destination);
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueName = this.generateUniqueFilename(file.originalname);
        cb(null, uniqueName);
      },
    });
  }

  /**
   * Create multer upload middleware
   */
  createUploadMiddleware(options = {}) {
    const storage = this.createMulterStorage(options.destination);

    return multer({
      storage,
      limits: {
        fileSize: options.maxFileSize || this.maxFileSize,
        files: options.maxFiles || 5,
      },
      fileFilter: (req, file, cb) => {
        // Check file type
        if (!this.isAllowedFileType(file.originalname)) {
          const error = new Error(
            `File type not allowed: ${this.getFileExtension(file.originalname)}`,
          );
          error.code = 'INVALID_FILE_TYPE';
          return cb(error, false);
        }

        // Additional custom validation
        if (options.fileFilter) {
          return options.fileFilter(req, file, cb);
        }

        cb(null, true);
      },
    });
  }

  /**
   * Process uploaded file
   */
  async processUploadedFile(file, options = {}) {
    try {
      const fileInfo = {
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
        extension: this.getFileExtension(file.originalname),
        category: this.getFileCategory(file.originalname),
        uploadedAt: new Date(),
      };

      // Move file to appropriate category folder
      const categoryPath = path.join(this.uploadPath, fileInfo.category);
      const newPath = path.join(categoryPath, file.filename);

      await fs.rename(file.path, newPath);
      fileInfo.path = newPath;

      // Process image files
      if (fileInfo.category === 'images') {
        await this.processImage(fileInfo, options);
      }

      // Upload to cloud storage if configured
      if (options.uploadToCloud !== false && this.s3) {
        await this.uploadToS3(fileInfo);
      }

      logInfo('File processed successfully', {
        filename: fileInfo.filename,
        size: fileInfo.size,
        category: fileInfo.category,
      });

      return fileInfo;
    } catch (error) {
      logError(error, { context: 'Failed to process uploaded file', filename: file.filename });
      throw error;
    }
  }

  /**
   * Process image file (resize, generate thumbnails)
   */
  async processImage(fileInfo, options = {}) {
    try {
      const imagePath = fileInfo.path;
      const thumbnailPath = path.join(this.uploadPath, 'thumbnails', fileInfo.filename);

      // Generate thumbnail
      await sharp(imagePath)
        .resize(200, 200, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);

      fileInfo.thumbnailPath = thumbnailPath;

      // Resize image if requested
      if (options.resize) {
        const { width, height, quality = 85 } = options.resize;
        const resizedPath = path.join(path.dirname(imagePath), `resized-${fileInfo.filename}`);

        await sharp(imagePath)
          .resize(width, height, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality })
          .toFile(resizedPath);

        fileInfo.resizedPath = resizedPath;
      }

      // Get image metadata
      const metadata = await sharp(imagePath).metadata();
      fileInfo.metadata = {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        channels: metadata.channels,
        hasAlpha: metadata.hasAlpha,
      };

      return fileInfo;
    } catch (error) {
      logError(error, { context: 'Failed to process image', filename: fileInfo.filename });
      throw error;
    }
  }

  /**
   * Upload file to AWS S3
   */
  async uploadToS3(fileInfo) {
    if (!this.s3 || !this.s3Bucket) {
      logWarning('S3 not configured, skipping cloud upload');
      return null;
    }

    try {
      const fileContent = await fs.readFile(fileInfo.path);
      const s3Key = `${fileInfo.category}/${fileInfo.filename}`;

      const uploadParams = {
        Bucket: this.s3Bucket,
        Key: s3Key,
        Body: fileContent,
        ContentType: fileInfo.mimetype,
        Metadata: {
          originalName: fileInfo.originalName,
          uploadedAt: fileInfo.uploadedAt.toISOString(),
        },
      };

      const result = await this.s3.upload(uploadParams).promise();

      fileInfo.s3Url = result.Location;
      fileInfo.s3Key = s3Key;

      // Upload thumbnail if exists
      if (fileInfo.thumbnailPath) {
        const thumbnailContent = await fs.readFile(fileInfo.thumbnailPath);
        const thumbnailKey = `thumbnails/${fileInfo.filename}`;

        const thumbnailParams = {
          Bucket: this.s3Bucket,
          Key: thumbnailKey,
          Body: thumbnailContent,
          ContentType: 'image/jpeg',
        };

        const thumbnailResult = await this.s3.upload(thumbnailParams).promise();
        fileInfo.thumbnailS3Url = thumbnailResult.Location;
      }

      logInfo('File uploaded to S3 successfully', {
        filename: fileInfo.filename,
        s3Url: fileInfo.s3Url,
      });

      return result;
    } catch (error) {
      logError(error, { context: 'Failed to upload file to S3', filename: fileInfo.filename });
      throw error;
    }
  }

  /**
   * Delete file from local storage
   */
  async deleteLocalFile(filePath) {
    try {
      await fs.unlink(filePath);
      logInfo('Local file deleted', { filePath });
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logWarning('File not found for deletion', { filePath });
        return true;
      }
      logError(error, { context: 'Failed to delete local file', filePath });
      return false;
    }
  }

  /**
   * Delete file from S3
   */
  async deleteS3File(s3Key) {
    if (!this.s3 || !this.s3Bucket) {
      return false;
    }

    try {
      const deleteParams = {
        Bucket: this.s3Bucket,
        Key: s3Key,
      };

      await this.s3.deleteObject(deleteParams).promise();
      logInfo('S3 file deleted', { s3Key });
      return true;
    } catch (error) {
      logError(error, { context: 'Failed to delete S3 file', s3Key });
      return false;
    }
  }

  /**
   * Delete file completely (local and S3)
   */
  async deleteFile(fileInfo) {
    const results = {
      local: false,
      s3: false,
      thumbnail: false,
    };

    // Delete local file
    if (fileInfo.path) {
      results.local = await this.deleteLocalFile(fileInfo.path);
    }

    // Delete thumbnail
    if (fileInfo.thumbnailPath) {
      results.thumbnail = await this.deleteLocalFile(fileInfo.thumbnailPath);
    }

    // Delete S3 file
    if (fileInfo.s3Key) {
      results.s3 = await this.deleteS3File(fileInfo.s3Key);
    }

    return results;
  }

  /**
   * Get file URL (local or S3)
   */
  getFileUrl(fileInfo, type = 'original') {
    if (type === 'thumbnail' && fileInfo.thumbnailS3Url) {
      return fileInfo.thumbnailS3Url;
    }

    if (fileInfo.s3Url) {
      return fileInfo.s3Url;
    }

    // Return local URL
    const relativePath = path.relative(process.cwd(), fileInfo.path);
    return `/${relativePath.replace(/\\/g, '/')}`;
  }

  /**
   * Get signed URL for S3 file (for private files)
   */
  getSignedUrl(s3Key, expiresIn = 3600) {
    if (!this.s3 || !this.s3Bucket) {
      return null;
    }

    const params = {
      Bucket: this.s3Bucket,
      Key: s3Key,
      Expires: expiresIn,
    };

    return this.s3.getSignedUrl('getObject', params);
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFiles(maxAge = 24 * 60 * 60 * 1000) {
    try {
      const tempDir = path.join(this.uploadPath, 'temp');
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

      logInfo('Temporary files cleaned up', { deletedCount });
      return deletedCount;
    } catch (error) {
      logError(error, { context: 'Failed to cleanup temporary files' });
      return 0;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    try {
      const stats = {
        local: {
          totalFiles: 0,
          totalSize: 0,
          categories: {},
        },
        s3: {
          configured: !!this.s3,
          bucket: this.s3Bucket,
        },
      };

      // Calculate local storage stats
      const categories = ['images', 'documents', 'videos', 'audio', 'misc'];

      for (const category of categories) {
        const categoryPath = path.join(this.uploadPath, category);

        try {
          const files = await fs.readdir(categoryPath);
          let categorySize = 0;

          for (const file of files) {
            const filePath = path.join(categoryPath, file);
            const fileStats = await fs.stat(filePath);
            categorySize += fileStats.size;
          }

          stats.local.categories[category] = {
            files: files.length,
            size: categorySize,
          };

          stats.local.totalFiles += files.length;
          stats.local.totalSize += categorySize;
        } catch (error) {
          stats.local.categories[category] = { files: 0, size: 0 };
        }
      }

      return stats;
    } catch (error) {
      logError(error, { context: 'Failed to get storage stats' });
      return null;
    }
  }
}

// Create file storage manager instance
const fileStorage = new FileStorageManager();

/**
 * Express middleware for file uploads
 */
const uploadMiddleware = (options = {}) => {
  const upload = fileStorage.createUploadMiddleware(options);

  return (req, res, next) => {
    const uploadHandler = options.multiple
      ? upload.array(options.fieldName || 'files', options.maxFiles || 5)
      : upload.single(options.fieldName || 'file');

    uploadHandler(req, res, async error => {
      if (error) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            status: 'error',
            message: 'File too large',
            maxSize: fileStorage.maxFileSize,
          });
        }

        if (error.code === 'INVALID_FILE_TYPE') {
          return res.status(400).json({
            status: 'error',
            message: error.message,
            allowedTypes: fileStorage.allowedTypes,
          });
        }

        return res.status(400).json({
          status: 'error',
          message: error.message,
        });
      }

      // Process uploaded files
      try {
        if (req.files) {
          // Multiple files
          req.processedFiles = [];
          for (const file of req.files) {
            const processedFile = await fileStorage.processUploadedFile(file, options);
            req.processedFiles.push(processedFile);
          }
        } else if (req.file) {
          // Single file
          req.processedFile = await fileStorage.processUploadedFile(req.file, options);
        }

        next();
      } catch (processError) {
        logError(processError, { context: 'File processing error' });
        res.status(500).json({
          status: 'error',
          message: 'Failed to process uploaded file',
        });
      }
    });
  };
};

/**
 * Helper functions
 */
const uploadSingle = (fieldName = 'file', options = {}) => {
  return uploadMiddleware({ ...options, fieldName, multiple: false });
};

const uploadMultiple = (fieldName = 'files', maxFiles = 5, options = {}) => {
  return uploadMiddleware({ ...options, fieldName, maxFiles, multiple: true });
};

const processImageAsync = async (fileInfo, options = {}) => {
  return addFileProcessingJob('resize-image', {
    filePath: fileInfo.path,
    width: options.width,
    height: options.height,
    outputPath: options.outputPath,
  });
};

const uploadToS3Async = async fileInfo => {
  return addFileProcessingJob('upload-to-s3', {
    filePath: fileInfo.path,
    bucketName: fileStorage.s3Bucket,
    key: `${fileInfo.category}/${fileInfo.filename}`,
  });
};

module.exports = {
  fileStorage,
  uploadMiddleware,
  uploadSingle,
  uploadMultiple,
  processImageAsync,
  uploadToS3Async,
  FileStorageManager,
};
