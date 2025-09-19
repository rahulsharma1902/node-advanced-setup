const { sendError, HTTP_STATUS } = require('../utils/response');
const { logWarning } = require('../utils/logger');

/**
 * Supported API versions
 */
const SUPPORTED_VERSIONS = ['v1', 'v2'];
const DEFAULT_VERSION = 'v1';
const LATEST_VERSION = 'v2';

/**
 * API versioning middleware
 * Supports versioning via:
 * 1. URL path: /api/v1/users
 * 2. Accept header: Accept: application/vnd.api+json;version=1
 * 3. Custom header: X-API-Version: v1
 * 4. Query parameter: ?version=v1
 */
const apiVersioning = (req, res, next) => {
  let version = DEFAULT_VERSION;

  // 1. Check URL path first (highest priority)
  const pathVersion = req.path.match(/^\/api\/(v\d+)\//);
  if (pathVersion) {
    version = pathVersion[1];
  }
  // 2. Check custom header
  else if (req.headers['x-api-version']) {
    version = req.headers['x-api-version'].toLowerCase();
    if (!version.startsWith('v')) {
      version = `v${version}`;
    }
  }
  // 3. Check Accept header
  else if (req.headers.accept) {
    const acceptVersion = req.headers.accept.match(/version=(\d+)/);
    if (acceptVersion) {
      version = `v${acceptVersion[1]}`;
    }
  }
  // 4. Check query parameter (lowest priority)
  else if (req.query.version) {
    version = req.query.version.toLowerCase();
    if (!version.startsWith('v')) {
      version = `v${version}`;
    }
  }

  // Validate version
  if (!SUPPORTED_VERSIONS.includes(version)) {
    logWarning('Unsupported API version requested', {
      requestedVersion: version,
      supportedVersions: SUPPORTED_VERSIONS,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    return sendError(
      res,
      `API version '${version}' is not supported. Supported versions: ${SUPPORTED_VERSIONS.join(', ')}`,
      HTTP_STATUS.BAD_REQUEST,
      {
        code: 'UNSUPPORTED_API_VERSION',
        details: {
          requestedVersion: version,
          supportedVersions: SUPPORTED_VERSIONS,
          latestVersion: LATEST_VERSION,
        },
      },
    );
  }

  // Add version info to request
  req.apiVersion = version;
  req.isLatestVersion = version === LATEST_VERSION;

  // Add version headers to response
  res.set({
    'X-API-Version': version,
    'X-API-Latest-Version': LATEST_VERSION,
    'X-API-Supported-Versions': SUPPORTED_VERSIONS.join(', '),
  });

  // Warn about deprecated versions
  if (version === 'v1' && LATEST_VERSION !== 'v1') {
    res.set(
      'X-API-Deprecation-Warning',
      `API version ${version} is deprecated. Please upgrade to ${LATEST_VERSION}`,
    );

    logWarning('Deprecated API version used', {
      version,
      latestVersion: LATEST_VERSION,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
    });
  }

  next();
};

/**
 * Version-specific middleware factory
 * @param {string} targetVersion - Target version (e.g., 'v1', 'v2')
 * @param {Function} handler - Handler function for this version
 * @returns {Function} Middleware function
 */
const versionSpecific = (targetVersion, handler) => {
  return (req, res, next) => {
    if (req.apiVersion === targetVersion) {
      return handler(req, res, next);
    }
    next();
  };
};

/**
 * Minimum version requirement middleware
 * @param {string} minVersion - Minimum required version
 * @returns {Function} Middleware function
 */
const requireMinVersion = minVersion => {
  return (req, res, next) => {
    const currentVersionNum = parseInt(req.apiVersion.replace('v', ''));
    const minVersionNum = parseInt(minVersion.replace('v', ''));

    if (currentVersionNum < minVersionNum) {
      return sendError(
        res,
        `This endpoint requires API version ${minVersion} or higher. Current version: ${req.apiVersion}`,
        HTTP_STATUS.BAD_REQUEST,
        {
          code: 'VERSION_TOO_LOW',
          details: {
            currentVersion: req.apiVersion,
            minimumVersion: minVersion,
            latestVersion: LATEST_VERSION,
          },
        },
      );
    }

    next();
  };
};

/**
 * Version compatibility middleware
 * Handles backward compatibility for specific endpoints
 */
const handleVersionCompatibility = (req, res, next) => {
  // Example: Transform v1 request format to v2 format
  if (req.apiVersion === 'v1') {
    // Handle v1 specific transformations
    if (req.body && req.body.user_name) {
      req.body.name = req.body.user_name;
      delete req.body.user_name;
    }

    // Add v1 compatibility flag
    req.isV1Compatible = true;
  }

  // Example: Handle v2 specific features
  if (req.apiVersion === 'v2') {
    // Enable v2 features
    req.supportsAdvancedFeatures = true;
  }

  next();
};

/**
 * Response transformation based on API version
 */
const transformResponse = version => {
  return (req, res, next) => {
    const originalJson = res.json;

    res.json = function (data) {
      // Transform response based on version
      if (version === 'v1' && data && data.data) {
        // V1 format: flatten some nested objects
        if (data.data.profile) {
          data.data = { ...data.data, ...data.data.profile };
          delete data.data.profile;
        }
      }

      if (version === 'v2' && data && data.data) {
        // V2 format: add additional metadata
        data.meta = {
          ...data.meta,
          apiVersion: version,
          responseTime: Date.now() - req.startTime,
        };
      }

      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * API version deprecation notice
 */
const deprecationNotice = (version, deprecationDate, sunsetDate) => {
  return (req, res, next) => {
    if (req.apiVersion === version) {
      const headers = {
        'X-API-Deprecation-Date': deprecationDate,
        'X-API-Sunset-Date': sunsetDate,
        'X-API-Deprecation-Info': `API version ${version} is deprecated and will be removed on ${sunsetDate}`,
      };

      res.set(headers);

      logWarning('Deprecated API version accessed', {
        version,
        deprecationDate,
        sunsetDate,
        ip: req.ip,
        endpoint: req.originalUrl,
      });
    }

    next();
  };
};

/**
 * Get version info for health checks
 */
const getVersionInfo = () => {
  return {
    supportedVersions: SUPPORTED_VERSIONS,
    defaultVersion: DEFAULT_VERSION,
    latestVersion: LATEST_VERSION,
    versioningMethods: [
      'URL path (/api/v1/endpoint)',
      'X-API-Version header',
      'Accept header (application/vnd.api+json;version=1)',
      'Query parameter (?version=v1)',
    ],
  };
};

module.exports = {
  apiVersioning,
  versionSpecific,
  requireMinVersion,
  handleVersionCompatibility,
  transformResponse,
  deprecationNotice,
  getVersionInfo,
  SUPPORTED_VERSIONS,
  DEFAULT_VERSION,
  LATEST_VERSION,
};
