const i18n = require('i18n');
const path = require('path');
const { logInfo, logError } = require('./logger');
const { cache } = require('./cache');

/**
 * Internationalization (i18n) Manager
 * Handles multi-language support for the application
 */
class I18nManager {
  constructor() {
    this.supportedLocales = ['en', 'hi', 'es', 'fr', 'de', 'ja', 'zh', 'ar'];
    this.defaultLocale = 'en';
    this.fallbackLocale = 'en';
    this.isInitialized = false;
  }

  /**
   * Initialize i18n system
   */
  initialize() {
    try {
      i18n.configure({
        locales: this.supportedLocales,
        defaultLocale: this.defaultLocale,
        fallbacks: {
          hi: 'en',
          es: 'en',
          fr: 'en',
          de: 'en',
          ja: 'en',
          zh: 'en',
          ar: 'en',
        },
        directory: path.join(__dirname, '../locales'),
        objectNotation: true,
        updateFiles: false, // Don't update files in production
        syncFiles: false,
        api: {
          __: 't',
          __n: 'tn',
        },
        register: global,
        logDebugFn: msg => logInfo('i18n debug', { message: msg }),
        logWarnFn: msg => logError(new Error(msg), { context: 'i18n warning' }),
        logErrorFn: msg => logError(new Error(msg), { context: 'i18n error' }),
        missingKeyFn: (locale, value) => {
          logError(new Error(`Missing translation key: ${value}`), {
            locale,
            key: value,
          });
          return `[${locale}:${value}]`;
        },
        mustacheConfig: {
          tags: ['{{', '}}'],
          disable: false,
        },
      });

      this.isInitialized = true;
      logInfo('i18n system initialized successfully', {
        supportedLocales: this.supportedLocales,
        defaultLocale: this.defaultLocale,
      });
    } catch (error) {
      logError(error, { context: 'Failed to initialize i18n system' });
      throw error;
    }
  }

  /**
   * Get user's preferred language from request
   */
  detectLanguage(req) {
    // Priority order:
    // 1. Query parameter (?lang=hi)
    // 2. Header (Accept-Language)
    // 3. User profile language
    // 4. Cookie
    // 5. Default locale

    let detectedLocale = this.defaultLocale;

    // 1. Check query parameter
    if (req.query.lang && this.supportedLocales.includes(req.query.lang)) {
      detectedLocale = req.query.lang;
    }
    // 2. Check custom header
    else if (
      req.headers['x-language'] &&
      this.supportedLocales.includes(req.headers['x-language'])
    ) {
      detectedLocale = req.headers['x-language'];
    }
    // 3. Check user profile
    else if (req.user && req.user.language && this.supportedLocales.includes(req.user.language)) {
      detectedLocale = req.user.language;
    }
    // 4. Check cookie
    else if (
      req.cookies &&
      req.cookies.language &&
      this.supportedLocales.includes(req.cookies.language)
    ) {
      detectedLocale = req.cookies.language;
    }
    // 5. Check Accept-Language header
    else if (req.headers['accept-language']) {
      const acceptedLanguages = req.headers['accept-language']
        .split(',')
        .map(lang => lang.split(';')[0].trim().toLowerCase());

      for (const lang of acceptedLanguages) {
        // Check exact match
        if (this.supportedLocales.includes(lang)) {
          detectedLocale = lang;
          break;
        }
        // Check language code only (en-US -> en)
        const langCode = lang.split('-')[0];
        if (this.supportedLocales.includes(langCode)) {
          detectedLocale = langCode;
          break;
        }
      }
    }

    return detectedLocale;
  }

  /**
   * Middleware for Express to handle i18n
   */
  middleware() {
    return (req, res, next) => {
      if (!this.isInitialized) {
        return next();
      }

      // Detect user's language
      const locale = this.detectLanguage(req);

      // Set locale for this request
      i18n.setLocale(req, locale);
      i18n.setLocale(res, locale);

      // Add locale info to request
      req.locale = locale;
      req.isRTL = this.isRTLLanguage(locale);

      // Add translation functions to request
      req.t = (key, params) => this.translate(key, params, locale);
      req.tn = (singular, plural, count, params) =>
        this.translatePlural(singular, plural, count, params, locale);

      // Add helper functions to response locals for templates
      res.locals.t = req.t;
      res.locals.tn = req.tn;
      res.locals.locale = locale;
      res.locals.isRTL = req.isRTL;

      next();
    };
  }

  /**
   * Translate a key
   */
  translate(key, params = {}, locale = this.defaultLocale) {
    try {
      // Try to get from cache first
      const cacheKey = `i18n:${locale}:${key}:${JSON.stringify(params)}`;

      return cache
        .get(cacheKey)
        .then(cached => {
          if (cached) return cached;

          const translation = i18n.__({ phrase: key, locale }, params);

          // Cache the translation for 1 hour
          cache.set(cacheKey, translation, 3600);

          return translation;
        })
        .catch(() => {
          // Fallback if cache fails
          return i18n.__({ phrase: key, locale }, params);
        });
    } catch (error) {
      logError(error, { context: 'Translation error', key, locale });
      return key; // Return key as fallback
    }
  }

  /**
   * Translate with pluralization
   */
  translatePlural(singular, plural, count, params = {}, locale = this.defaultLocale) {
    try {
      return i18n.__n(
        {
          singular,
          plural,
          count,
          locale,
        },
        count,
        params,
      );
    } catch (error) {
      logError(error, { context: 'Plural translation error', singular, plural, count, locale });
      return count === 1 ? singular : plural;
    }
  }

  /**
   * Check if language is RTL (Right-to-Left)
   */
  isRTLLanguage(locale) {
    const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
    return rtlLanguages.includes(locale);
  }

  /**
   * Format date according to locale
   */
  formatDate(date, locale = this.defaultLocale, options = {}) {
    try {
      const defaultOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        ...options,
      };

      return new Intl.DateTimeFormat(locale, defaultOptions).format(new Date(date));
    } catch (error) {
      logError(error, { context: 'Date formatting error', date, locale });
      return date.toString();
    }
  }

  /**
   * Format number according to locale
   */
  formatNumber(number, locale = this.defaultLocale, options = {}) {
    try {
      return new Intl.NumberFormat(locale, options).format(number);
    } catch (error) {
      logError(error, { context: 'Number formatting error', number, locale });
      return number.toString();
    }
  }

  /**
   * Format currency according to locale
   */
  formatCurrency(amount, currency = 'USD', locale = this.defaultLocale) {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
      }).format(amount);
    } catch (error) {
      logError(error, { context: 'Currency formatting error', amount, currency, locale });
      return `${currency} ${amount}`;
    }
  }

  /**
   * Get localized error message
   */
  getErrorMessage(errorCode, params = {}, locale = this.defaultLocale) {
    const key = `errors.${errorCode}`;
    return this.translate(key, params, locale);
  }

  /**
   * Get localized success message
   */
  getSuccessMessage(messageCode, params = {}, locale = this.defaultLocale) {
    const key = `success.${messageCode}`;
    return this.translate(key, params, locale);
  }

  /**
   * Get all translations for a locale (for frontend)
   */
  async getTranslations(locale = this.defaultLocale) {
    try {
      // Try to get from cache first
      const cacheKey = `i18n:translations:${locale}`;
      const cached = await cache.get(cacheKey);

      if (cached) {
        return cached;
      }

      // Load translations from file
      const translations = i18n.getCatalog(locale);

      // Cache for 24 hours
      await cache.set(cacheKey, translations, 86400);

      return translations;
    } catch (error) {
      logError(error, { context: 'Failed to get translations', locale });
      return {};
    }
  }

  /**
   * Add new translation dynamically
   */
  addTranslation(locale, key, value) {
    try {
      i18n.setLocale(locale);
      i18n.__(key, value);

      // Clear cache for this locale
      const pattern = `i18n:${locale}:*`;
      cache.keys(pattern).then(keys => {
        keys.forEach(key => cache.del(key));
      });

      logInfo('Translation added', { locale, key, value });
    } catch (error) {
      logError(error, { context: 'Failed to add translation', locale, key, value });
    }
  }

  /**
   * Get supported locales with their native names
   */
  getSupportedLocales() {
    return {
      en: { name: 'English', nativeName: 'English', rtl: false },
      hi: { name: 'Hindi', nativeName: 'हिन्दी', rtl: false },
      es: { name: 'Spanish', nativeName: 'Español', rtl: false },
      fr: { name: 'French', nativeName: 'Français', rtl: false },
      de: { name: 'German', nativeName: 'Deutsch', rtl: false },
      ja: { name: 'Japanese', nativeName: '日本語', rtl: false },
      zh: { name: 'Chinese', nativeName: '中文', rtl: false },
      ar: { name: 'Arabic', nativeName: 'العربية', rtl: true },
    };
  }

  /**
   * Validate locale
   */
  isValidLocale(locale) {
    return this.supportedLocales.includes(locale);
  }

  /**
   * Get locale statistics
   */
  async getLocaleStats() {
    try {
      const stats = {};

      for (const locale of this.supportedLocales) {
        const translations = await this.getTranslations(locale);
        stats[locale] = {
          totalKeys: Object.keys(translations).length,
          completeness:
            locale === this.defaultLocale
              ? 100
              : Math.round(
                  (Object.keys(translations).length /
                    Object.keys(await this.getTranslations(this.defaultLocale)).length) *
                    100,
                ),
        };
      }

      return stats;
    } catch (error) {
      logError(error, { context: 'Failed to get locale stats' });
      return {};
    }
  }
}

// Create i18n manager instance
const i18nManager = new I18nManager();

/**
 * Enhanced response utilities with i18n support
 */
const sendLocalizedResponse = (res, data, messageKey, statusCode = 200, params = {}) => {
  const locale = res.locals.locale || 'en';
  const message = i18nManager.translate(messageKey, params, locale);

  res.status(statusCode).json({
    status: statusCode >= 400 ? 'error' : 'success',
    message,
    timestamp: new Date().toISOString(),
    locale,
    ...(data && { data }),
  });
};

const sendLocalizedError = (res, errorCode, statusCode = 500, params = {}) => {
  const locale = res.locals.locale || 'en';
  const message = i18nManager.getErrorMessage(errorCode, params, locale);

  res.status(statusCode).json({
    status: 'error',
    message,
    timestamp: new Date().toISOString(),
    locale,
    code: errorCode,
  });
};

const sendLocalizedSuccess = (res, data, messageCode, params = {}) => {
  const locale = res.locals.locale || 'en';
  const message = i18nManager.getSuccessMessage(messageCode, params, locale);

  res.status(200).json({
    status: 'success',
    message,
    timestamp: new Date().toISOString(),
    locale,
    data,
  });
};

module.exports = {
  i18nManager,
  sendLocalizedResponse,
  sendLocalizedError,
  sendLocalizedSuccess,
  i18n,
};
