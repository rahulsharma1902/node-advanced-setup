const crypto = require('crypto');
const { promisify } = require('util');

// Async sleep function
const sleep = ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Generate random string
const generateRandomString = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Generate UUID v4
const generateUUID = () => {
  return crypto.randomUUID();
};

// Hash string with SHA256
const hashString = str => {
  return crypto.createHash('sha256').update(str).digest('hex');
};

// Validate email format
const isValidEmail = email => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Sanitize string (remove HTML tags)
const sanitizeString = str => {
  return str.replace(/<[^>]*>/g, '');
};

// Capitalize first letter
const capitalize = str => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// Convert string to slug
const slugify = str => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Deep clone object
const deepClone = obj => {
  return JSON.parse(JSON.stringify(obj));
};

// Check if object is empty
const isEmpty = obj => {
  if (obj === null || obj === undefined) return true;
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  if (typeof obj === 'string') return obj.trim().length === 0;
  return false;
};

// Debounce function
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Throttle function
const throttle = (func, limit) => {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// Retry function with exponential backoff
const retry = async (fn, maxAttempts = 3, baseDelay = 1000) => {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  throw lastError;
};

// Format bytes to human readable
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Parse JSON safely
const safeJsonParse = (str, defaultValue) => {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
};

// Get nested object property safely
const getNestedProperty = (obj, path) => {
  return path.split('.').reduce((current, key) => current?.[key], obj);
};

// Set nested object property
const setNestedProperty = (obj, path, value) => {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (!(key in current)) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
};

// Remove undefined properties from object
const removeUndefined = obj => {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
};

// Convert object to query string
const objectToQueryString = obj => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }
  return params.toString();
};

// Parse query string to object
const queryStringToObject = queryString => {
  const params = new URLSearchParams(queryString);
  const result = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
};

// Mask sensitive data
const maskSensitiveData = (str, visibleChars = 4) => {
  if (str.length <= visibleChars * 2) {
    return '*'.repeat(str.length);
  }
  const start = str.substring(0, visibleChars);
  const end = str.substring(str.length - visibleChars);
  const middle = '*'.repeat(str.length - visibleChars * 2);
  return start + middle + end;
};

// Generate random number in range
const randomInRange = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Check if string is valid JSON
const isValidJSON = str => {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
};

// Convert milliseconds to human readable time
const msToTime = ms => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

module.exports = {
  sleep,
  generateRandomString,
  generateUUID,
  hashString,
  isValidEmail,
  sanitizeString,
  capitalize,
  slugify,
  deepClone,
  isEmpty,
  debounce,
  throttle,
  retry,
  formatBytes,
  safeJsonParse,
  getNestedProperty,
  setNestedProperty,
  removeUndefined,
  objectToQueryString,
  queryStringToObject,
  maskSensitiveData,
  randomInRange,
  isValidJSON,
  msToTime,
};
