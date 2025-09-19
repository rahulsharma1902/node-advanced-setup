# 🚀 **Complete Usage Guide - Queue, Cache, File Storage aur Sabhi Features**

## 📋 **Table of Contents**

1. [Queue System - Background Jobs](#queue-system)
2. [Cache System - Redis Caching](#cache-system)
3. [File Storage - Upload aur Management](#file-storage)
4. [HTTP Client - 3rd Party APIs](#http-client)
5. [Performance Monitoring](#performance-monitoring)
6. [API Versioning](#api-versioning)

---

## 🔄 **Queue System - Background Jobs**

### **Kya hai Queue System?**

Queue system ka matlab hai ki aap heavy tasks ko background mein run kar sakte ho. Jaise email send karna, image resize karna, notifications bhejna - ye sab user ko wait nahi karvana padega.

### **Basic Setup**

```javascript
// src/index.js mein queue initialize karo
const { queueManager } = require('./utils/queue');

// Server start karne se pehle queue initialize karo
async function startServer() {
  await queueManager.initialize();
  // ... rest of server code
}
```

### **Email Queue - Examples**

#### **1. Simple Email Bhejna**

```javascript
// Kisi bhi controller mein use karo
const { addEmailJob } = require('../utils/queue');

// User registration ke baad welcome email
const registerUser = async (req, res) => {
  // User create karo
  const user = await User.create(userData);

  // Background mein email bhejo - user ko wait nahi karvana
  await addEmailJob({
    to: user.email,
    subject: 'Welcome to Our App!',
    text: 'Thank you for joining us!',
    html: '<h1>Welcome!</h1><p>Thank you for joining us!</p>',
  });

  // Immediately response bhejo
  sendSuccess(res, { user }, 'User registered successfully');
};
```

#### **2. Bulk Emails Bhejna**

```javascript
// Newsletter ya promotional emails ke liye
const sendNewsletter = async (req, res) => {
  const users = await User.find({ subscribed: true });

  const emails = users.map(user => ({
    to: user.email,
    subject: 'Monthly Newsletter',
    html: `<h1>Hi ${user.name}!</h1><p>Here's your newsletter...</p>`,
  }));

  // Bulk email job add karo
  await addBulkEmailJob(emails);

  sendSuccess(res, null, 'Newsletter queued successfully');
};
```

#### **3. Template Email with Variables**

```javascript
// Password reset email
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  const resetToken = generateResetToken();

  // Template email bhejo
  await addEmailJob({
    to: user.email,
    template: 'password-reset',
    variables: {
      name: user.name,
      resetLink: `${process.env.APP_URL}/reset-password?token=${resetToken}`,
      expiryTime: '1 hour',
    },
  });

  sendSuccess(res, null, 'Reset link sent to your email');
};
```

### **Notification Queue - Examples**

#### **1. SMS Notification**

```javascript
const { addNotificationJob } = require('../utils/queue');

// Order confirmation SMS
const confirmOrder = async (req, res) => {
  const order = await Order.create(orderData);

  // SMS bhejo
  await addNotificationJob('sms', {
    to: user.phone,
    message: `Your order #${order.id} has been confirmed! Total: ₹${order.total}`,
  });

  sendSuccess(res, { order }, 'Order confirmed');
};
```

#### **2. Slack Notification**

```javascript
// Error notification team ko bhejne ke liye
const notifyError = async (error, context) => {
  await addNotificationJob('slack', {
    channel: '#alerts',
    message: `🚨 Error occurred: ${error.message}`,
    attachments: [
      {
        color: 'danger',
        fields: [
          {
            title: 'Context',
            value: JSON.stringify(context),
            short: false,
          },
        ],
      },
    ],
  });
};
```

### **File Processing Queue - Examples**

#### **1. Image Resize Karna**

```javascript
const { addFileProcessingJob } = require('../utils/queue');

// Profile picture upload ke baad resize karo
const uploadProfilePicture = async (req, res) => {
  const file = req.processedFile; // File upload middleware se milega

  // Background mein different sizes create karo
  await addFileProcessingJob('resize-image', {
    filePath: file.path,
    width: 300,
    height: 300,
    outputPath: `uploads/profiles/medium-${file.filename}`,
  });

  await addFileProcessingJob('resize-image', {
    filePath: file.path,
    width: 100,
    height: 100,
    outputPath: `uploads/profiles/small-${file.filename}`,
  });

  sendSuccess(res, { file }, 'Profile picture uploaded');
};
```

### **Cleanup Queue - Examples**

#### **1. Temporary Files Cleanup**

```javascript
// Daily cleanup job
const scheduleCleanup = () => {
  // Har raat 2 baje temp files clean karo
  cron.schedule('0 2 * * *', async () => {
    await addCleanupJob('cleanup-temp-files', {
      tempDir: './uploads/temp',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  });
};
```

### **Queue Monitoring**

#### **Queue Stats Dekhna**

```javascript
// Admin dashboard mein queue status show karo
const getQueueStats = async (req, res) => {
  const stats = await queueManager.getAllQueueStats();

  sendSuccess(res, stats, 'Queue statistics');
};

// Response example:
// {
//   "email": {
//     "waiting": 5,
//     "active": 2,
//     "completed": 100,
//     "failed": 3
//   },
//   "notification": {
//     "waiting": 0,
//     "active": 1,
//     "completed": 50,
//     "failed": 0
//   }
// }
```

---

## 💾 **Cache System - Redis Caching**

### **Kya hai Cache?**

Cache matlab data ko temporarily store karna taaki next time jaldi mil jaye. Database queries kam karne ke liye use karte hain.

### **Basic Cache Usage**

#### **1. Simple Get/Set**

```javascript
const { cache } = require('../utils/cache');

// Data cache mein store karo
await cache.set('user:123', userData, 3600); // 1 hour ke liye

// Cache se data retrieve karo
const cachedUser = await cache.get('user:123');
if (cachedUser) {
  return sendSuccess(res, cachedUser, 'User data from cache');
}
```

#### **2. Function Results Cache Karna**

```javascript
const { cacheFunction } = require('../utils/cache');

// Expensive function ko cache karo
const getExpensiveData = async userId => {
  // Heavy database query
  const data = await User.aggregate([
    // Complex aggregation pipeline
  ]);
  return data;
};

// Function ko cache wrapper se wrap karo
const cachedGetExpensiveData = cacheFunction(getExpensiveData, 1800, 'expensive-data');

// Use karo - pehli baar database se, baad mein cache se milega
const data = await cachedGetExpensiveData(userId);
```

#### **3. Route Level Caching**

```javascript
const { cacheMiddleware } = require('../utils/cache');

// Route ko cache karo
router.get(
  '/api/products',
  cacheMiddleware(600), // 10 minutes cache
  async (req, res) => {
    const products = await Product.find();
    sendSuccess(res, products, 'Products list');
  },
);

// Custom cache key ke saath
router.get(
  '/api/user/:id/posts',
  cacheMiddleware(300, req => `user-posts:${req.params.id}`),
  async (req, res) => {
    const posts = await Post.find({ userId: req.params.id });
    sendSuccess(res, posts, 'User posts');
  },
);
```

### **Advanced Cache Examples**

#### **1. Counter/Statistics Cache**

```javascript
// Page views count karna
const incrementPageViews = async pageId => {
  const views = await cache.incr(`page-views:${pageId}`);

  // Har 100 views pe database update karo
  if (views % 100 === 0) {
    await Page.findByIdAndUpdate(pageId, {
      $inc: { views: 100 },
    });
  }

  return views;
};
```

#### **2. Session Management**

```javascript
// User session cache mein store karo
const createUserSession = async (userId, sessionData) => {
  const sessionId = generateSessionId();

  await cache.set(
    `session:${sessionId}`,
    {
      userId,
      ...sessionData,
      createdAt: new Date(),
    },
    86400,
  ); // 24 hours

  return sessionId;
};

// Session validate karo
const validateSession = async sessionId => {
  const session = await cache.get(`session:${sessionId}`);
  if (!session) {
    throw new Error('Invalid session');
  }

  // Session extend karo
  await cache.expire(`session:${sessionId}`, 86400);
  return session;
};
```

#### **3. Rate Limiting with Cache**

```javascript
// API rate limiting
const checkRateLimit = async (userId, limit = 100) => {
  const key = `rate-limit:${userId}`;
  const current = await cache.incr(key);

  if (current === 1) {
    // First request - set expiry
    await cache.expire(key, 3600); // 1 hour
  }

  if (current > limit) {
    throw new Error('Rate limit exceeded');
  }

  return { current, limit, remaining: limit - current };
};
```

---

## 📁 **File Storage - Upload aur Management**

### **Basic File Upload**

#### **1. Single File Upload**

```javascript
const { uploadSingle } = require('../utils/fileStorage');

// Route mein middleware use karo
router.post(
  '/upload-avatar',
  uploadSingle('avatar', {
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['jpg', 'jpeg', 'png'],
    uploadToCloud: true, // S3 mein upload karo
  }),
  async (req, res) => {
    const file = req.processedFile;

    // User profile update karo
    await User.findByIdAndUpdate(req.user.id, {
      avatar: file.s3Url || file.path,
      avatarThumbnail: file.thumbnailS3Url,
    });

    sendSuccess(
      res,
      {
        url: file.s3Url,
        thumbnail: file.thumbnailS3Url,
      },
      'Avatar uploaded successfully',
    );
  },
);
```

#### **2. Multiple Files Upload**

```javascript
const { uploadMultiple } = require('../utils/fileStorage');

// Gallery upload
router.post(
  '/upload-gallery',
  uploadMultiple('images', 10, {
    // Max 10 files
    resize: { width: 1200, height: 800, quality: 85 },
  }),
  async (req, res) => {
    const files = req.processedFiles;

    // Database mein save karo
    const gallery = await Gallery.create({
      userId: req.user.id,
      images: files.map(file => ({
        url: file.s3Url || file.path,
        thumbnail: file.thumbnailS3Url,
        filename: file.filename,
        size: file.size,
      })),
    });

    sendSuccess(res, gallery, 'Gallery uploaded successfully');
  },
);
```

### **Advanced File Processing**

#### **1. Image Processing with Queue**

```javascript
const { processImageAsync } = require('../utils/fileStorage');

// Large image ko background mein process karo
const uploadLargeImage = async (req, res) => {
  const file = req.processedFile;

  // Different sizes ke liye jobs create karo
  const jobs = [
    processImageAsync(file, { width: 1920, height: 1080 }), // Full HD
    processImageAsync(file, { width: 1280, height: 720 }), // HD
    processImageAsync(file, { width: 640, height: 480 }), // SD
  ];

  // Jobs queue mein add karo
  await Promise.all(jobs);

  sendSuccess(res, { file }, 'Image processing started');
};
```

#### **2. File Validation**

```javascript
// Custom file validation
const uploadDocument = uploadSingle('document', {
  fileFilter: (req, file, cb) => {
    // Only PDF files allow karo
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  maxFileSize: 10 * 1024 * 1024, // 10MB
});
```

### **File Management**

#### **1. File Delete Karna**

```javascript
const { fileStorage } = require('../utils/fileStorage');

const deleteFile = async (req, res) => {
  const { fileId } = req.params;
  const file = await File.findById(fileId);

  // Local aur S3 dono se delete karo
  const result = await fileStorage.deleteFile({
    path: file.localPath,
    s3Key: file.s3Key,
    thumbnailPath: file.thumbnailPath,
  });

  // Database se bhi remove karo
  await File.findByIdAndDelete(fileId);

  sendSuccess(res, result, 'File deleted successfully');
};
```

#### **2. Storage Statistics**

```javascript
// Admin dashboard ke liye storage stats
const getStorageStats = async (req, res) => {
  const stats = await fileStorage.getStorageStats();

  sendSuccess(res, stats, 'Storage statistics');
};

// Response example:
// {
//   "local": {
//     "totalFiles": 1250,
//     "totalSize": 2147483648, // bytes
//     "categories": {
//       "images": { "files": 800, "size": 1073741824 },
//       "documents": { "files": 450, "size": 1073741824 }
//     }
//   },
//   "s3": {
//     "configured": true,
//     "bucket": "my-app-files"
//   }
// }
```

---

## 🌐 **HTTP Client - 3rd Party APIs**

### **Basic API Calls**

#### **1. Simple GET Request**

```javascript
const { createHttpClient } = require('../utils/httpClient');

// External API client banao
const weatherAPI = createHttpClient('Weather API', {
  baseURL: 'https://api.openweathermap.org/data/2.5',
  auth: {
    type: 'apikey',
    location: 'query',
    key: 'appid',
    apiKey: process.env.WEATHER_API_KEY,
  },
});

// Weather data fetch karo
const getWeather = async city => {
  try {
    const data = await weatherAPI.get('/weather', {
      params: { q: city },
    });
    return data;
  } catch (error) {
    console.log('Weather API error:', error.message);
    throw error;
  }
};
```

#### **2. POST Request with Data**

```javascript
// User ko external service mein create karo
const createExternalUser = async userData => {
  const crmAPI = createHttpClient('CRM API', {
    baseURL: 'https://api.crm.com/v1',
    auth: {
      type: 'bearer',
      token: process.env.CRM_API_TOKEN,
    },
  });

  const result = await crmAPI.post('/users', {
    name: userData.name,
    email: userData.email,
    phone: userData.phone,
  });

  return result;
};
```

### **Pre-configured Clients**

#### **1. Stripe Payment**

```javascript
const { createStripeClient } = require('../utils/httpClient');

const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY);

// Payment intent create karo
const createPayment = async (amount, customerId) => {
  const paymentIntent = await stripe.post('/payment_intents', {
    amount: amount * 100, // Paisa to cents
    currency: 'inr',
    customer: customerId,
    confirm: true,
  });

  return paymentIntent;
};
```

#### **2. Slack Notifications**

```javascript
const { createSlackClient } = require('../utils/httpClient');

const slack = createSlackClient(process.env.SLACK_BOT_TOKEN);

// Team ko message bhejo
const notifyTeam = async (message, channel = '#general') => {
  await slack.post('/chat.postMessage', {
    channel,
    text: message,
    username: 'App Bot',
    icon_emoji: ':robot_face:',
  });
};
```

### **Advanced Features**

#### **1. Automatic Token Refresh**

```javascript
// JWT token automatic refresh karo
const apiClient = createHttpClient('Protected API', {
  baseURL: 'https://api.example.com',
  auth: {
    type: 'bearer',
    token: 'initial-token',
    refreshToken: async () => {
      // Token refresh karo
      const response = await fetch('/auth/refresh', {
        method: 'POST',
        headers: { 'Refresh-Token': refreshToken },
      });
      const { accessToken } = await response.json();
      return accessToken;
    },
  },
});
```

#### **2. Batch Requests**

```javascript
// Multiple APIs ko parallel call karo
const fetchUserData = async userId => {
  const requests = [
    { method: 'GET', url: `/users/${userId}` },
    { method: 'GET', url: `/users/${userId}/posts` },
    { method: 'GET', url: `/users/${userId}/followers` },
  ];

  const results = await apiClient.batchRequests(requests, {
    concurrency: 3,
    failFast: false,
  });

  return {
    user: results[0].success ? results[0].data : null,
    posts: results[1].success ? results[1].data : [],
    followers: results[2].success ? results[2].data : [],
  };
};
```

---

## ⚡ **Performance Monitoring**

### **Request Performance Tracking**

#### **1. Middleware Setup**

```javascript
const { performanceMonitoring, metricsCollection } = require('../utils/performance');

// App mein middleware add karo
app.use(performanceMonitoring);
app.use(metricsCollection);
```

#### **2. Performance Metrics Dekhna**

```javascript
const { getPerformanceMetrics } = require('../utils/performance');

// Admin dashboard endpoint
router.get('/admin/metrics', async (req, res) => {
  const metrics = getPerformanceMetrics(req, res);
  // Response headers mein performance data automatically add ho jayega
});

// Response headers example:
// X-Response-Time: 150ms
// X-Memory-Usage: 45MB
// X-CPU-Time: 12.5ms
```

### **Database Query Monitoring**

#### **1. Query Performance Track Karna**

```javascript
// Controller mein database queries monitor karo
const getUserPosts = async (req, res) => {
  const startTime = Date.now();

  const posts = await Post.find({ userId: req.params.id });

  const queryTime = Date.now() - startTime;
  req.logDbQuery('Post.find', queryTime);

  sendSuccess(res, posts, 'User posts');
};
```

---

## 🔄 **API Versioning**

### **Version-based Routing**

#### **1. URL Path Versioning**

```javascript
const { apiVersioning, versionSpecific } = require('../utils/versioning');

// App level versioning middleware
app.use(apiVersioning);

// Version specific routes
router.get('/users/:id', versionSpecific('v1', getUserV1), versionSpecific('v2', getUserV2));

// V1 handler
const getUserV1 = async (req, res) => {
  const user = await User.findById(req.params.id);
  // V1 format mein response
  sendSuccess(res, {
    id: user._id,
    name: user.name,
    email: user.email,
  });
};

// V2 handler - more detailed response
const getUserV2 = async (req, res) => {
  const user = await User.findById(req.params.id);
  // V2 format mein response
  sendSuccess(res, {
    id: user._id,
    profile: {
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    },
    metadata: {
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
    },
  });
};
```

#### **2. Header-based Versioning**

```javascript
// Client request mein header bheje
// X-API-Version: v2

// Ya Accept header mein
// Accept: application/vnd.api+json;version=2
```

---

## 🎯 **Real-World Usage Examples**

### **Complete User Registration Flow**

```javascript
const registerUser = async (req, res) => {
  try {
    // 1. User create karo
    const user = await User.create(req.body);

    // 2. Welcome email queue mein add karo
    await addEmailJob({
      to: user.email,
      template: 'welcome',
      variables: { name: user.name },
    });

    // 3. User data cache mein store karo
    await cache.set(`user:${user._id}`, user, 3600);

    // 4. Analytics event track karo
    await addAnalyticsJob('track-event', {
      event: 'user_registered',
      userId: user._id,
      properties: {
        source: req.body.source || 'direct',
        timestamp: new Date(),
      },
    });

    // 5. External CRM mein sync karo
    await addNotificationJob('slack', {
      channel: '#new-users',
      message: `🎉 New user registered: ${user.name} (${user.email})`,
    });

    sendSuccess(res, { user }, 'User registered successfully');
  } catch (error) {
    logError(error, { context: 'User registration failed' });
    sendError(res, 'Registration failed', 500);
  }
};
```

### **File Upload with Processing**

```javascript
const uploadProductImage = async (req, res) => {
  try {
    const file = req.processedFile;

    // 1. Product update karo
    const product = await Product.findByIdAndUpdate(req.params.id, {
      image: file.s3Url,
      thumbnail: file.thumbnailS3Url,
    });

    // 2. Cache clear karo
    await cache.del(`product:${product._id}`);
    await cache.del('products:list');

    // 3. Image processing jobs add karo
    await addFileProcessingJob('resize-image', {
      filePath: file.path,
      width: 800,
      height: 600,
      outputPath: `products/medium-${file.filename}`,
    });

    // 4. Search index update karo
    await addAnalyticsJob('update-search-index', {
      productId: product._id,
      imageUrl: file.s3Url,
    });

    sendSuccess(res, { product }, 'Product image updated');
  } catch (error) {
    logError(error, { context: 'Product image upload failed' });
    sendError(res, 'Upload failed', 500);
  }
};
```

---

## 🔧 **Configuration Tips**

### **Environment Variables Setup**

```bash
# .env file mein ye sab add karo

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-redis-password

# Queue Configuration
QUEUE_CONCURRENCY=5
QUEUE_MAX_ATTEMPTS=3

# File Storage
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_S3_BUCKET=your-bucket-name

# External APIs
STRIPE_SECRET_KEY=sk_test_your-stripe-key
SLACK_BOT_TOKEN=xoxb-your-slack-token
TWILIO_ACCOUNT_SID=your-twilio-sid
```

### **Production Deployment**

```javascript
// Production mein queue workers alag process mein run karo
if (process.env.NODE_ENV === 'production') {
  // Main app process
  if (process.env.PROCESS_TYPE === 'web') {
    // Only web server start karo
    startWebServer();
  }

  // Worker process
  if (process.env.PROCESS_TYPE === 'worker') {
    // Only queue workers start karo
    await queueManager.initialize();
  }
}
```

---

## 🎉 **Summary**

Is guide mein humne dekha:

✅ **Queue System** - Background jobs ke liye  
✅ **Cache System** - Fast data access ke liye  
✅ **File Storage** - Upload aur management ke liye  
✅ **HTTP Client** - External APIs ke liye  
✅ **Performance Monitoring** - App performance track karne ke liye  
✅ **API Versioning** - Future-proof APIs ke liye

**Sab kuch ready hai! Ab aap kisi bhi project mein ye features use kar sakte ho. Happy coding! 🚀**
