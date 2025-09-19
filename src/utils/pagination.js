const mongoose = require('mongoose');
const { logInfo, logError } = require('./logger');
const { cache } = require('./cache');

/**
 * Advanced Pagination Utility
 * Reusable pagination system for all APIs
 */
class PaginationManager {
  constructor() {
    this.defaultLimit = 10;
    this.maxLimit = 100;
    this.defaultPage = 1;
  }

  /**
   * Parse pagination parameters from request
   */
  parsePaginationParams(req) {
    const page = Math.max(1, parseInt(req.query.page) || this.defaultPage);
    const limit = Math.min(
      this.maxLimit,
      Math.max(1, parseInt(req.query.limit) || this.defaultLimit),
    );
    const skip = (page - 1) * limit;

    // Sort parameters
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    // Search parameters
    const search = req.query.search || '';
    const searchFields = req.query.searchFields ? req.query.searchFields.split(',') : [];

    return {
      page,
      limit,
      skip,
      sort,
      search,
      searchFields,
      originalQuery: req.query,
    };
  }

  /**
   * Build search query for MongoDB
   */
  buildSearchQuery(search, searchFields) {
    if (!search || !searchFields.length) {
      return {};
    }

    const searchRegex = new RegExp(search, 'i');
    const searchConditions = searchFields.map(field => ({
      [field]: searchRegex,
    }));

    return { $or: searchConditions };
  }

  /**
   * Build filter query from request parameters
   */
  buildFilterQuery(req, allowedFilters = []) {
    const filters = {};

    allowedFilters.forEach(filter => {
      if (req.query[filter] !== undefined) {
        const value = req.query[filter];

        // Handle different filter types
        if (value === 'true' || value === 'false') {
          filters[filter] = value === 'true';
        } else if (!isNaN(value)) {
          filters[filter] = Number(value);
        } else if (value.includes(',')) {
          // Handle array values
          filters[filter] = { $in: value.split(',') };
        } else {
          filters[filter] = value;
        }
      }
    });

    return filters;
  }

  /**
   * Execute paginated query for Mongoose models
   */
  async paginateMongoose(Model, options = {}) {
    try {
      const {
        req,
        baseQuery = {},
        searchFields = [],
        allowedFilters = [],
        populate = '',
        select = '',
        cacheKey = null,
        cacheTTL = 300, // 5 minutes
      } = options;

      // Parse pagination parameters
      const paginationParams = this.parsePaginationParams(req);
      const { page, limit, skip, sort, search } = paginationParams;

      // Build queries
      const searchQuery = this.buildSearchQuery(search, searchFields);
      const filterQuery = this.buildFilterQuery(req, allowedFilters);

      // Combine all queries
      const finalQuery = {
        ...baseQuery,
        ...searchQuery,
        ...filterQuery,
      };

      // Check cache if enabled
      if (cacheKey) {
        const cacheKeyFull = `${cacheKey}:${JSON.stringify(finalQuery)}:${page}:${limit}:${JSON.stringify(sort)}`;
        const cachedResult = await cache.get(cacheKeyFull);
        if (cachedResult) {
          logInfo('Pagination cache hit', { cacheKey: cacheKeyFull });
          return cachedResult;
        }
      }

      // Execute queries in parallel
      const [data, totalCount] = await Promise.all([
        Model.find(finalQuery)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .populate(populate)
          .select(select)
          .lean(),
        Model.countDocuments(finalQuery),
      ]);

      // Calculate pagination metadata
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      const result = {
        data,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage,
          hasPrevPage,
          nextPage: hasNextPage ? page + 1 : null,
          prevPage: hasPrevPage ? page - 1 : null,
        },
        meta: {
          search,
          searchFields,
          filters: filterQuery,
          sort,
          query: finalQuery,
        },
      };

      // Cache result if enabled
      if (cacheKey) {
        const cacheKeyFull = `${cacheKey}:${JSON.stringify(finalQuery)}:${page}:${limit}:${JSON.stringify(sort)}`;
        await cache.set(cacheKeyFull, result, cacheTTL);
      }

      return result;
    } catch (error) {
      logError(error, { context: 'Pagination error', model: Model.modelName });
      throw error;
    }
  }

  /**
   * Execute paginated aggregation pipeline
   */
  async paginateAggregate(Model, pipeline, options = {}) {
    try {
      const { req, cacheKey = null, cacheTTL = 300 } = options;

      const paginationParams = this.parsePaginationParams(req);
      const { page, limit, skip, sort } = paginationParams;

      // Check cache if enabled
      if (cacheKey) {
        const cacheKeyFull = `${cacheKey}:agg:${JSON.stringify(pipeline)}:${page}:${limit}`;
        const cachedResult = await cache.get(cacheKeyFull);
        if (cachedResult) {
          return cachedResult;
        }
      }

      // Add pagination stages to pipeline
      const paginatedPipeline = [
        ...pipeline,
        {
          $facet: {
            data: [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
            totalCount: [{ $count: 'count' }],
          },
        },
      ];

      const [result] = await Model.aggregate(paginatedPipeline);

      const data = result.data || [];
      const totalCount = result.totalCount[0]?.count || 0;
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      const finalResult = {
        data,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage,
          hasPrevPage,
          nextPage: hasNextPage ? page + 1 : null,
          prevPage: hasPrevPage ? page - 1 : null,
        },
        meta: {
          pipeline,
          sort,
        },
      };

      // Cache result if enabled
      if (cacheKey) {
        const cacheKeyFull = `${cacheKey}:agg:${JSON.stringify(pipeline)}:${page}:${limit}`;
        await cache.set(cacheKeyFull, finalResult, cacheTTL);
      }

      return finalResult;
    } catch (error) {
      logError(error, { context: 'Aggregation pagination error' });
      throw error;
    }
  }

  /**
   * Simple array pagination (for in-memory data)
   */
  paginateArray(array, req) {
    const paginationParams = this.parsePaginationParams(req);
    const { page, limit, skip, search, searchFields } = paginationParams;

    let filteredArray = [...array];

    // Apply search if provided
    if (search && searchFields.length > 0) {
      const searchLower = search.toLowerCase();
      filteredArray = filteredArray.filter(item =>
        searchFields.some(field => {
          const fieldValue = this.getNestedValue(item, field);
          return fieldValue && fieldValue.toString().toLowerCase().includes(searchLower);
        }),
      );
    }

    const totalCount = filteredArray.length;
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Apply pagination
    const data = filteredArray.slice(skip, skip + limit);

    return {
      data,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null,
      },
      meta: {
        search,
        searchFields,
      },
    };
  }

  /**
   * Get nested object value by path
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Generate pagination links for API responses
   */
  generatePaginationLinks(req, pagination) {
    const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
    const queryParams = { ...req.query };

    const links = {};

    // First page
    if (pagination.currentPage > 1) {
      queryParams.page = 1;
      links.first = `${baseUrl}?${new URLSearchParams(queryParams).toString()}`;
    }

    // Previous page
    if (pagination.hasPrevPage) {
      queryParams.page = pagination.prevPage;
      links.prev = `${baseUrl}?${new URLSearchParams(queryParams).toString()}`;
    }

    // Next page
    if (pagination.hasNextPage) {
      queryParams.page = pagination.nextPage;
      links.next = `${baseUrl}?${new URLSearchParams(queryParams).toString()}`;
    }

    // Last page
    if (pagination.currentPage < pagination.totalPages) {
      queryParams.page = pagination.totalPages;
      links.last = `${baseUrl}?${new URLSearchParams(queryParams).toString()}`;
    }

    return links;
  }

  /**
   * Format paginated response
   */
  formatResponse(result, req, message = 'Data retrieved successfully') {
    const links = this.generatePaginationLinks(req, result.pagination);

    return {
      success: true,
      message,
      data: result.data,
      pagination: {
        ...result.pagination,
        links,
      },
      meta: result.meta || {},
    };
  }
}

// Create pagination manager instance
const paginationManager = new PaginationManager();

/**
 * Express middleware for automatic pagination
 */
const paginationMiddleware = (options = {}) => {
  return (req, res, next) => {
    // Add pagination helper to request
    req.paginate = async (Model, paginationOptions = {}) => {
      const mergedOptions = { ...options, ...paginationOptions, req };
      return await paginationManager.paginateMongoose(Model, mergedOptions);
    };

    // Add array pagination helper
    req.paginateArray = array => {
      return paginationManager.paginateArray(array, req);
    };

    // Add response formatter
    req.sendPaginated = (result, message) => {
      const formattedResponse = paginationManager.formatResponse(result, req, message);
      return res.json(formattedResponse);
    };

    next();
  };
};

/**
 * Quick pagination function for simple use cases
 */
const paginate = async (Model, req, options = {}) => {
  const mergedOptions = { ...options, req };
  const result = await paginationManager.paginateMongoose(Model, mergedOptions);
  return paginationManager.formatResponse(result, req);
};

/**
 * Quick array pagination function
 */
const paginateArray = (array, req, message = 'Data retrieved successfully') => {
  const result = paginationManager.paginateArray(array, req);
  return paginationManager.formatResponse(result, req, message);
};

/**
 * Pagination validation schema for Joi
 */
const paginationSchema = {
  page: require('joi').number().integer().min(1).default(1),
  limit: require('joi').number().integer().min(1).max(100).default(10),
  sortBy: require('joi').string().default('createdAt'),
  sortOrder: require('joi').string().valid('asc', 'desc').default('desc'),
  search: require('joi').string().allow('').default(''),
  searchFields: require('joi').string().default(''),
};

module.exports = {
  paginationManager,
  PaginationManager,
  paginationMiddleware,
  paginate,
  paginateArray,
  paginationSchema,
};
