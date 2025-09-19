# 🚀 **Advanced Features Complete Guide**

## 📋 **Table of Contents**

1. [Multi-Language Support (i18n)](#multi-language-support-i18n)
2. [Real-time WebSocket System](#real-time-websocket-system)
3. [Two-Factor Authentication (2FA)](#two-factor-authentication-2fa)
4. [Database Migrations](#database-migrations)
5. [Advanced Monitoring & Sentry](#advanced-monitoring--sentry)
6. [Reusable Pagination System](#reusable-pagination-system)
7. [Usage Examples](#usage-examples)
8. [Best Practices](#best-practices)

---

## 🌍 **Multi-Language Support (i18n)**

### **Kya hai ye?**

Ye system aapke app ko multiple languages mein support karne ke liye hai. Users apni preferred language mein app use kar sakte hain.

### **Supported Languages:**

- **English (en)** - Default language
- **Hindi (hi)** - हिंदी भाषा
- **Spanish (es)** - Español
- **French (fr)** - Français
- **German (de)** - Deutsch
- **Japanese (ja)** - 日本語
- **Chinese (zh)** - 中文
- **Arabic (ar)** - العربية

### **Kaise use kare?**

#### **1. Basic Usage:**

```javascript
const { i18nManager } = require('./src/utils/i18n');

// Simple translation
const message = i18nManager.translate('errors.user_not_found', {}, 'hi');
console.log(message); // "उपयोगकर्ता नहीं मिला"

// With variables
const welcomeMsg = i18nManager.translate('auth.welcome', { appName: 'MyApp' }, 'en');
console.log(welcomeMsg); // "Welcome to MyApp"
```

#### **2. Express Middleware mein:**

```javascript
const express = require('express');
const { i18nMiddleware } = require('./src/utils/i18n');

const app = express();

// i18n middleware add karo
app.use(i18nMiddleware);

// Route mein use karo
app.get('/api/users/:id', (req, res) => {
  const user = findUser(req.params.id);

  if (!user) {
    // Automatically user ki language mein response milega
    return sendLocalizedError(res, 'user_not_found', 404);
  }

  res.json(user);
});
```

#### **3. Language Detection:**

System automatically detect karta hai user ki language:

- **Query Parameter:** `?lang=hi`
- **Header:** `Accept-Language: hi,en;q=0.9`
- **User Profile:** Database mein stored preference
- **Cookie:** `language=hi`

### **Naye translations add kaise kare?**

#### **English file mein add karo:**

```javascript
// src/locales/en.json
{
  "myFeature": {
    "success": "Operation completed successfully",
    "error": "Something went wrong with {{feature}}"
  }
}
```

#### **Hindi file mein add karo:**

```javascript
// src/locales/hi.json
{
  "myFeature": {
    "success": "ऑपरेशन सफलतापूर्वक पूरा हुआ",
    "error": "{{feature}} के साथ कुछ गलत हुआ"
  }
}
```

---

## 🌐 **Real-time WebSocket System**

### **Kya hai ye?**

Ye system real-time communication provide karta hai - jaise chat, notifications, live updates etc.

### **Features:**

- **Real-time Chat** - Group aur private messaging
- **Live Notifications** - Instant push notifications
- **Typing Indicators** - Kaun type kar raha hai
- **Presence System** - Online/offline status
- **Room Management** - Join/leave rooms
- **Voice/Video Call Support** - WebRTC signaling
- **Screen Sharing** - Screen share events

### **Kaise use kare?**

#### **1. Server Setup:**

```javascript
// src/index.js mein
const { webSocketManager } = require('./src/utils/websocket');
const server = require('http').createServer(app);

// WebSocket initialize karo
webSocketManager.initialize(server);

server.listen(3000, () => {
  console.log('Server with WebSocket running on port 3000');
});
```

#### **2. Client Side Connection:**

```javascript
// Frontend mein
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token-here',
  },
});

// Connection events
socket.on('connected', data => {
  console.log('Connected:', data.message);
  console.log('Your language:', data.language);
});

// Join a room
socket.emit('join_room', { roomId: 'general-chat' });

// Send message
socket.emit('send_message', {
  roomId: 'general-chat',
  message: 'Hello everyone!',
  messageType: 'text',
});

// Receive messages
socket.on('new_message', messageData => {
  console.log('New message:', messageData);
});
```

#### **3. Server Side Usage:**

```javascript
const { webSocketManager } = require('./src/utils/websocket');

// Send notification to specific user
await webSocketManager.sendNotificationToUser(userId, {
  type: 'order_update',
  title: 'Order Shipped',
  message: 'Your order has been shipped!',
  data: { orderId: '12345' },
});

// Broadcast to all users in a room
webSocketManager.broadcastToRoom('general-chat', 'announcement', {
  message: 'Server maintenance in 10 minutes',
  type: 'warning',
});

// Get connection stats
const stats = webSocketManager.getConnectionStats();
console.log('Active users:', stats.activeUsers);
```

### **Available Events:**

#### **Client to Server:**

- `join_room` - Room join karne ke liye
- `leave_room` - Room leave karne ke liye
- `send_message` - Message bhejne ke liye
- `send_private_message` - Private message ke liye
- `typing_start/typing_stop` - Typing indicators
- `get_online_users` - Online users list

#### **Server to Client:**

- `connected` - Connection successful
- `new_message` - Naya message aaya
- `user_joined_room` - Koi user room mein aaya
- `user_left_room` - Koi user room se gaya
- `notification` - Notification received
- `online_users` - Online users list

---

## 🔐 **Two-Factor Authentication (2FA)**

### **Kya hai ye?**

2FA extra security layer hai jo login ke time additional verification mangta hai.

### **Supported Methods:**

- **TOTP (Time-based OTP)** - Google Authenticator, Authy
- **SMS OTP** - Phone number pe OTP
- **Email OTP** - Email pe OTP
- **Backup Codes** - Emergency access codes

### **Kaise setup kare?**

#### **1. TOTP Setup:**

```javascript
const { twoFactorManager } = require('./src/utils/twoFactor');

// 2FA setup start karo
const setup = await twoFactorManager.setup2FA(userId, userEmail, 'totp');

// Response mein milega:
// - setup.secret (store in database)
// - setup.qrCode (show to user)
// - setup.backupCodes (show to user, store hashed version)

// User ko QR code scan karwao aur verification code mangwao
const verificationCode = '123456'; // User se input

// Setup complete karo
const result = await twoFactorManager.complete2FASetup(userId, verificationCode, 'totp');

if (result.success) {
  // Database mein save karo:
  // - user.twoFactor.enabled = true
  // - user.twoFactor.method = 'totp'
  // - user.twoFactor.secret = setup.secret
  // - user.twoFactor.backupCodes = hashedBackupCodes
  console.log('2FA enabled successfully!');
}
```

#### **2. SMS OTP Setup:**

```javascript
// SMS 2FA setup
const setup = await twoFactorManager.setup2FA(userId, userEmail, 'sms');

// User ka phone number verify karo
await twoFactorManager.generateSMSOTP(userId, phoneNumber, userLanguage);

// User se OTP mangwao
const otpCode = '123456'; // User input
const result = await twoFactorManager.complete2FASetup(userId, otpCode, 'sms');
```

#### **3. Login Time Verification:**

```javascript
// Login ke time 2FA check karo
const user = await User.findOne({ email });

if (user.twoFactor.enabled) {
  // 2FA required hai

  if (user.twoFactor.method === 'totp') {
    // TOTP verification
    const totpCode = '123456'; // User input
    const verification = await twoFactorManager.verify2FA(
      userId,
      totpCode,
      'totp',
      user.twoFactor.secret,
      user.twoFactor.backupCodes,
    );

    if (verification.success) {
      // Login successful
      if (verification.usedBackupCode) {
        // Backup code use hua hai, user ko inform karo
        console.log('Backup code used!');
      }
    }
  }

  if (user.twoFactor.method === 'sms') {
    // SMS OTP bhejo
    await twoFactorManager.generateSMSOTP(userId, user.phoneNumber, user.language);

    // User se OTP mangwao
    const smsCode = '123456'; // User input
    const verification = await twoFactorManager.verify2FA(userId, smsCode, 'sms');
  }
}
```

#### **4. Trusted Devices:**

```javascript
// Device ko trust karo (30 days ke liye)
await twoFactorManager.trustDevice(userId, req.get('User-Agent'), req.ip);

// Check karo ki device trusted hai ya nahi
const is2FARequired = await twoFactorManager.is2FARequired(userId, req.get('User-Agent'), req.ip);

if (!is2FARequired) {
  // 2FA skip kar sakte hain
  console.log('Trusted device, 2FA skipped');
}
```

---

## 🗄️ **Database Migrations**

### **Kya hai ye?**

Database schema changes ko manage karne ka systematic way hai. Production mein safely database update kar sakte hain.

### **Kaise use kare?**

#### **1. Migration Create karo:**

```javascript
const { migrationManager } = require('./src/utils/migrations');

// Initialize migration system
await migrationManager.initialize();

// Naya migration create karo
const migration = await migrationManager.createMigration(
  'add_user_preferences',
  'Add user preferences table and update user schema',
);

console.log('Migration created:', migration.filename);
// Output: 20231219T123456789Z_add_user_preferences.js
```

#### **2. Migration File Edit karo:**

```javascript
// migrations/20231219T123456789Z_add_user_preferences.js

module.exports = {
  async up() {
    const db = mongoose.connection.db;

    try {
      // New collection create karo
      await db.createCollection('user_preferences');

      // Index add karo
      await db.collection('user_preferences').createIndex({ userId: 1 }, { unique: true });

      // Existing users mein default preferences add karo
      await db.collection('users').updateMany(
        { preferences: { $exists: false } },
        {
          $set: {
            preferences: {
              language: 'en',
              theme: 'light',
              notifications: true,
            },
          },
        },
      );

      console.log('User preferences migration completed');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  },

  async down() {
    const db = mongoose.connection.db;

    try {
      // Rollback changes
      await db.collection('user_preferences').drop();

      await db.collection('users').updateMany({}, { $unset: { preferences: 1 } });

      console.log('User preferences migration rolled back');
    } catch (error) {
      console.error('Rollback failed:', error);
      throw error;
    }
  },
};
```

#### **3. Migrations Run karo:**

```javascript
// All pending migrations run karo
const result = await migrationManager.migrate();
console.log(`${result.migrationsRun} migrations completed`);

// Migration status check karo
const status = await migrationManager.getStatus();
console.log('Total migrations:', status.total);
console.log('Executed:', status.executed);
console.log('Pending:', status.pending);

// Last migration rollback karo
const rollbackResult = await migrationManager.rollback(1);
console.log(`${rollbackResult.migrationsRolledBack} migrations rolled back`);
```

#### **4. CLI Commands:**

```bash
# Package.json mein add karo
"scripts": {
  "migrate": "node -e \"require('./src/utils/migrations').migrationManager.initialize().then(() => require('./src/utils/migrations').migrationManager.migrate())\"",
  "migrate:rollback": "node -e \"require('./src/utils/migrations').migrationManager.initialize().then(() => require('./src/utils/migrations').migrationManager.rollback(1))\"",
  "migrate:status": "node -e \"require('./src/utils/migrations').migrationManager.initialize().then(() => require('./src/utils/migrations').migrationManager.getStatus().then(console.log))\""
}

# Use karo
npm run migrate
npm run migrate:status
npm run migrate:rollback
```

---

## 📊 **Advanced Monitoring & Sentry**

### **Kya hai ye?**

Production mein app ki health monitor karne aur errors track karne ka system hai.

### **Features:**

- **Error Tracking** - Sentry integration
- **Performance Monitoring** - Response time, memory, CPU
- **Real-time Alerts** - Threshold-based alerts
- **Health Checks** - System health monitoring
- **Custom Transactions** - Performance tracking

### **Kaise setup kare?**

#### **1. Environment Variables:**

```bash
# .env file mein add karo
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_PROFILES_SAMPLE_RATE=0.1
```

#### **2. Initialize karo:**

```javascript
// src/index.js mein
const { monitoringManager } = require('./src/utils/monitoring');

// Monitoring initialize karo
monitoringManager.initialize();

// Express middleware add karo
app.use(monitoringManager.requestMonitoring());

// Error handler add karo (last mein)
app.use(monitoringManager.errorHandler());
```

#### **3. Manual Error Tracking:**

```javascript
const { monitoringManager } = require('./src/utils/monitoring');

try {
  // Risky operation
  const result = await riskyDatabaseOperation();
} catch (error) {
  // Error capture karo
  monitoringManager.captureException(error, {
    level: 'error',
    tags: {
      operation: 'database',
      table: 'users',
    },
    extra: {
      userId: req.user.id,
      operation: 'update_profile',
    },
  });

  throw error;
}
```

#### **4. Custom Messages:**

```javascript
// Important events log karo
monitoringManager.captureMessage('User subscription upgraded', 'info', {
  tags: { feature: 'billing' },
  extra: {
    userId: user.id,
    plan: 'premium',
    amount: 99.99,
  },
});
```

#### **5. Performance Tracking:**

```javascript
// Custom transaction create karo
const transaction = monitoringManager.startTransaction('user-registration', 'auth');

try {
  // User registration process
  const user = await createUser(userData);
  await sendWelcomeEmail(user.email);

  // Transaction successful
  transaction.setStatus('ok');
} catch (error) {
  transaction.setStatus('internal_error');
  throw error;
} finally {
  monitoringManager.finishTransaction(transaction);
}
```

#### **6. Health Check Endpoint:**

```javascript
// Health check route add karo
app.get('/health', async (req, res) => {
  const health = await monitoringManager.healthCheck();

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json(health);
});
```

#### **7. Metrics Dashboard:**

```javascript
// Metrics endpoint
app.get('/metrics', async (req, res) => {
  const metrics = monitoringManager.getMetrics();
  res.json(metrics);
});

// Response example:
{
  "requests": 1250,
  "errors": 15,
  "errorRate": "1.20%",
  "avgResponseTime": 145,
  "memoryUsage": {
    "rss": 52428800,
    "heapTotal": 29360128,
    "heapUsed": 18874392
  },
  "uptime": 3600,
  "nodeVersion": "v18.17.0"
}
```

---

## 📄 **Reusable Pagination System**

### **Kya hai ye?**

Ye system har API response mein pagination provide karta hai. Data ko pages mein divide karta hai aur search, filter, sort ki facility deta hai.

### **Features:**

- **Automatic Pagination** - Page, limit, skip calculations
- **Search & Filter** - Multiple fields mein search aur custom filters
- **Sorting** - Any field pe ascending/descending sort
- **Caching** - Redis caching for better performance
- **Links Generation** - Next, previous, first, last page links
- **Multiple Data Sources** - MongoDB, Aggregation, Arrays support

### **Kaise use kare?**

#### **1. Simple Usage (Sabse Easy):**

```javascript
const { paginate } = require('./src/utils/pagination');
const User = require('./src/models/User');

// Route mein
app.get('/api/users', async (req, res) => {
  try {
    // Bas ek line mein pagination ho gaya!
    const result = await paginate(User, req, {
      searchFields: ['name', 'email'],
      allowedFilters: ['status', 'role'],
      populate: 'profile',
      select: 'name email status role createdAt',
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### **2. Middleware Usage (Recommended):**

```javascript
const { paginationMiddleware } = require('./src/utils/pagination');

// Middleware add karo
app.use(paginationMiddleware());

// Route mein use karo
app.get('/api/users', async (req, res) => {
  try {
    // req.paginate helper available hai
    const result = await req.paginate(User, {
      searchFields: ['name', 'email', 'phone'],
      allowedFilters: ['status', 'role', 'isActive'],
      populate: 'profile department',
      select: 'name email status role profile department createdAt',
      cacheKey: 'users_list',
      cacheTTL: 600, // 10 minutes cache
    });

    // Direct response bhej sakte hain
    return req.sendPaginated(result, 'Users retrieved successfully');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### **3. Advanced Usage with Custom Query:**

```javascript
app.get('/api/users/advanced', async (req, res) => {
  try {
    const result = await req.paginate(User, {
      baseQuery: {
        isDeleted: false,
        createdAt: { $gte: new Date('2023-01-01') },
      },
      searchFields: ['name', 'email', 'phone', 'address.city'],
      allowedFilters: ['status', 'role', 'department', 'isActive'],
      populate: [
        { path: 'profile', select: 'avatar bio' },
        { path: 'department', select: 'name code' },
      ],
      select: 'name email status role profile department createdAt updatedAt',
      cacheKey: 'advanced_users',
      cacheTTL: 300,
    });

    return req.sendPaginated(result, 'Advanced user search completed');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### **4. Array Pagination (In-memory data):**

```javascript
app.get('/api/stats/summary', async (req, res) => {
  try {
    // Koi bhi array ko paginate kar sakte hain
    const statsData = [
      { metric: 'users', value: 1250, trend: 'up' },
      { metric: 'orders', value: 890, trend: 'down' },
      { metric: 'revenue', value: 45000, trend: 'up' },
      // ... more data
    ];

    const result = req.paginateArray(statsData);
    return req.sendPaginated(result, 'Stats retrieved successfully');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### **5. Aggregation Pipeline Pagination:**

```javascript
const { paginationManager } = require('./src/utils/pagination');

app.get('/api/analytics/users', async (req, res) => {
  try {
    const pipeline = [
      {
        $match: { isActive: true },
      },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'userId',
          as: 'orders',
        },
      },
      {
        $addFields: {
          totalOrders: { $size: '$orders' },
          totalSpent: { $sum: '$orders.amount' },
        },
      },
      {
        $project: {
          name: 1,
          email: 1,
          totalOrders: 1,
          totalSpent: 1,
          joinedAt: '$createdAt',
        },
      },
    ];

    const result = await paginationManager.paginateAggregate(User, pipeline, {
      req,
      cacheKey: 'user_analytics',
      cacheTTL: 900, // 15 minutes
    });

    return req.sendPaginated(result, 'User analytics retrieved');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### **Query Parameters:**

#### **Basic Parameters:**

- `?page=2` - Page number (default: 1)
- `?limit=20` - Items per page (default: 10, max: 100)
- `?sortBy=createdAt` - Sort field (default: createdAt)
- `?sortOrder=desc` - Sort direction (asc/desc, default: desc)

#### **Search Parameters:**

- `?search=john` - Search term
- `?searchFields=name,email` - Fields to search in

#### **Filter Parameters:**

- `?status=active` - Single filter
- `?role=admin,user` - Multiple values filter
- `?isActive=true` - Boolean filter

#### **Example Complete URL:**

```
GET /api/users?page=2&limit=15&search=john&searchFields=name,email&status=active&role=admin&sortBy=name&sortOrder=asc
```

### **Response Format:**

```javascript
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789012345",
      "name": "John Doe",
      "email": "john@example.com",
      "status": "active",
      "role": "admin",
      "createdAt": "2023-12-19T10:30:00.000Z"
    }
    // ... more users
  ],
  "pagination": {
    "currentPage": 2,
    "totalPages": 8,
    "totalCount": 150,
    "limit": 15,
    "hasNextPage": true,
    "hasPrevPage": true,
    "nextPage": 3,
    "prevPage": 1,
    "links": {
      "first": "http://localhost:3000/api/users?page=1&limit=15&search=john",
      "prev": "http://localhost:3000/api/users?page=1&limit=15&search=john",
      "next": "http://localhost:3000/api/users?page=3&limit=15&search=john",
      "last": "http://localhost:3000/api/users?page=8&limit=15&search=john"
    }
  },
  "meta": {
    "search": "john",
    "searchFields": ["name", "email"],
    "filters": {
      "status": "active"
    },
    "sort": {
      "name": 1
    }
  }
}
```

### **Validation Schema (Joi):**

```javascript
const { paginationSchema } = require('./src/utils/pagination');
const { celebrate, Joi } = require('celebrate');

// Route validation mein use karo
app.get(
  '/api/users',
  celebrate({
    query: Joi.object({
      ...paginationSchema,
      status: Joi.string().valid('active', 'inactive'),
      role: Joi.string().valid('admin', 'user', 'moderator'),
    }),
  }),
  async (req, res) => {
    // Validated pagination parameters
    const result = await req.paginate(User, {
      searchFields: ['name', 'email'],
      allowedFilters: ['status', 'role'],
    });

    return req.sendPaginated(result);
  },
);
```

### **Performance Tips:**

#### **1. Caching Enable karo:**

```javascript
const result = await req.paginate(User, {
  cacheKey: 'users_list',
  cacheTTL: 600, // 10 minutes
  searchFields: ['name', 'email'],
});
```

#### **2. Select Only Required Fields:**

```javascript
const result = await req.paginate(User, {
  select: 'name email status createdAt', // Only needed fields
  searchFields: ['name', 'email'],
});
```

#### **3. Use Indexes:**

```javascript
// MongoDB mein indexes create karo
db.users.createIndex({ name: 'text', email: 'text' }); // For search
db.users.createIndex({ status: 1 }); // For filters
db.users.createIndex({ createdAt: -1 }); // For sorting
```

### **Real-world Examples:**

#### **E-commerce Products:**

```javascript
app.get('/api/products', async (req, res) => {
  const result = await req.paginate(Product, {
    searchFields: ['name', 'description', 'brand'],
    allowedFilters: ['category', 'brand', 'inStock', 'featured'],
    populate: 'category brand reviews',
    select: 'name price description images category brand rating inStock',
    baseQuery: { isActive: true },
    cacheKey: 'products_list',
    cacheTTL: 300,
  });

  return req.sendPaginated(result, 'Products retrieved successfully');
});

// Usage: /api/products?search=laptop&category=electronics&brand=apple&inStock=true&sortBy=price&sortOrder=asc
```

#### **Blog Posts:**

```javascript
app.get('/api/posts', async (req, res) => {
  const result = await req.paginate(Post, {
    searchFields: ['title', 'content', 'tags'],
    allowedFilters: ['status', 'category', 'featured'],
    populate: 'author category',
    select: 'title excerpt content author category tags featured publishedAt',
    baseQuery: { status: 'published' },
    cacheKey: 'blog_posts',
    cacheTTL: 600,
  });

  return req.sendPaginated(result, 'Blog posts retrieved successfully');
});
```

#### **Order Management:**

```javascript
app.get('/api/orders', async (req, res) => {
  const result = await req.paginate(Order, {
    searchFields: ['orderNumber', 'customer.name', 'customer.email'],
    allowedFilters: ['status', 'paymentStatus', 'shippingMethod'],
    populate: 'customer products.product',
    select: 'orderNumber customer products total status paymentStatus createdAt',
    baseQuery: { isDeleted: false },
    cacheKey: `orders_${req.user.role}`,
    cacheTTL: 180,
  });

  return req.sendPaginated(result, 'Orders retrieved successfully');
});
```

---

## 💡 **Usage Examples**

### **Complete User Registration with All Features:**

```javascript
const express = require('express');
const { i18nMiddleware, sendLocalizedSuccess, sendLocalizedError } = require('./src/utils/i18n');
const { twoFactorManager } = require('./src/utils/twoFactor');
const { webSocketManager } = require('./src/utils/websocket');
const { monitoringManager } = require('./src/utils/monitoring');

const router = express.Router();

// i18n middleware
router.use(i18nMiddleware);

router.post('/register', async (req, res) => {
  const transaction = monitoringManager.startTransaction('user-registration', 'auth');

  try {
    const { email, password, phoneNumber, language } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendLocalizedError(res, 'email_already_exists', 400);
    }

    // Create user
    const user = new User({
      email,
      password: await bcrypt.hash(password, 12),
      phoneNumber,
      language: language || req.locale,
      twoFactor: { enabled: false },
    });

    await user.save();

    // Send welcome notification via WebSocket (if user connects later)
    setTimeout(async () => {
      await webSocketManager.sendNotificationToUser(user._id, {
        type: 'welcome',
        title: 'Welcome!',
        message: 'Welcome to our platform!',
        data: { userId: user._id },
      });
    }, 1000);

    // Log successful registration
    monitoringManager.captureMessage('User registered successfully', 'info', {
      tags: { feature: 'auth' },
      extra: { userId: user._id, language: user.language },
    });

    transaction.setStatus('ok');

    return sendLocalizedSuccess(res, 'user_created', {
      user: {
        id: user._id,
        email: user.email,
        language: user.language,
      },
    });
  } catch (error) {
    transaction.setStatus('internal_error');
    monitoringManager.captureException(error, {
      level: 'error',
      tags: { operation: 'user-registration' },
    });

    return sendLocalizedError(res, 'server_error', 500);
  } finally {
    monitoringManager.finishTransaction(transaction);
  }
});
```

### **2FA Setup Complete Flow:**

```javascript
router.post('/setup-2fa', authenticateToken, async (req, res) => {
  try {
    const { method } = req.body; // 'totp', 'sms', or 'email'
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Setup 2FA
    const setup = await twoFactorManager.setup2FA(userId, userEmail, method);

    if (method === 'totp') {
      return res.json({
        success: true,
        qrCode: setup.qrCode,
        secret: setup.secret, // Don't send this in production
        backupCodes: setup.backupCodes,
        message: 'Scan QR code with your authenticator app',
      });
    }

    if (method === 'sms') {
      // Send SMS OTP
      await twoFactorManager.generateSMSOTP(userId, req.user.phoneNumber, req.locale);
      return res.json({
        success: true,
        message: 'OTP sent to your phone number',
      });
    }

    if (method === 'email') {
      // Send Email OTP
      await twoFactorManager.generateEmailOTP(userId, userEmail, req.locale);
      return res.json({
        success: true,
        message: 'OTP sent to your email',
      });
    }
  } catch (error) {
    monitoringManager.captureException(error);
    return sendLocalizedError(res, 'server_error', 500);
  }
});

router.post('/verify-2fa-setup', authenticateToken, async (req, res) => {
  try {
    const { code, method } = req.body;
    const userId = req.user.id;

    const result = await twoFactorManager.complete2FASetup(userId, code, method);

    if (result.success) {
      // Update user in database
      await User.findByIdAndUpdate(userId, {
        'twoFactor.enabled': true,
        'twoFactor.method': method,
        'twoFactor.secret': result.secret, // Only for TOTP
        'twoFactor.backupCodes': result.hashedBackupCodes, // Only for TOTP
      });

      // Send notification
      await webSocketManager.sendNotificationToUser(userId, {
        type: 'security',
        title: '2FA Enabled',
        message: 'Two-factor authentication has been enabled for your account',
      });

      return sendLocalizedSuccess(res, 'two_factor_enabled', {
        backupCodes: result.backupCodes, // Show to user once
      });
    } else {
      return sendLocalizedError(res, 'otp_invalid', 400);
    }
  } catch (error) {
    monitoringManager.captureException(error);
    return sendLocalizedError(res, 'server_error', 500);
  }
});
```

---

## 🎯 **Best Practices**

### **1. i18n Best Practices:**

```javascript
// ✅ Good - Use descriptive keys
i18nManager.translate('auth.login.success', {}, language);

// ❌ Bad - Generic keys
i18nManager.translate('success', {}, language);

// ✅ Good - Use variables for dynamic content
i18nManager.translate('user.welcome', { name: user.name }, language);

// ✅ Good - Provide fallback
const message = i18nManager.translate('custom.message', {}, language) || 'Default message';
```

### **2. WebSocket Best Practices:**

```javascript
// ✅ Good - Always authenticate WebSocket connections
// ✅ Good - Use rooms for organized communication
// ✅ Good - Handle disconnections gracefully
// ✅ Good - Validate all incoming data

// ❌ Bad - Don't send sensitive data via WebSocket
// ❌ Bad - Don't trust client-side data without validation
```

### **3. 2FA Best Practices:**

```javascript
// ✅ Good - Always hash backup codes before storing
const hashedCodes = twoFactorManager.hashBackupCodes(backupCodes);

// ✅ Good - Rate limit 2FA attempts
const rateLimit = await twoFactorManager.checkRateLimit(userId, method);
if (!rateLimit.allowed) {
  return res.status(429).json({ error: 'Too many attempts' });
}

// ✅ Good - Log 2FA events for security
monitoringManager.captureMessage('2FA verification failed', 'warning', {
  tags: { security: '2fa' },
  extra: { userId, method, attempts: rateLimit.attemptsRemaining },
});
```

### **4. Migration Best Practices:**

```javascript
// ✅ Good - Always provide rollback logic
// ✅ Good - Test migrations on staging first
// ✅ Good - Use descriptive migration names
// ✅ Good - Keep migrations small and focused

// ❌ Bad - Don't modify existing migrations after deployment
// ❌ Bad - Don't skip migration testing
```

### **5. Monitoring Best Practices:**

```javascript
// ✅ Good - Set appropriate log levels
monitoringManager.captureMessage('User action', 'info'); // For info
monitoringManager.captureException(error, { level: 'error' }); // For errors

// ✅ Good - Add context to errors
monitoringManager.captureException(error, {
  tags: { feature: 'payment', method: 'stripe' },
  extra: { userId, amount, currency },
});

// ✅ Good - Monitor business metrics
monitoringManager.captureMessage('Subscription created', 'info', {
  tags: { business: 'revenue' },
  extra: { plan: 'premium', amount: 99.99 },
});
```

---

## 🚀 **Quick Start Checklist**

### **Setup karne ke liye:**

1. **Environment Variables set karo:**

   ```bash
   # .env file mein
   SENTRY_DSN=your-sentry-dsn
   REDIS_URL=redis://localhost:6379
   MONGODB_URI=mongodb://localhost:27017/yourdb
   ```

2. **Dependencies install karo:**

   ```bash
   npm install
   ```

3. **Initialize karo:**

   ```javascript
   // src/index.js mein
   const { i18nManager } = require('./src/utils/i18n');
   const { webSocketManager } = require('./src/utils/websocket');
   const { migrationManager } = require('./src/utils/migrations');
   const { monitoringManager } = require('./src/utils/monitoring');

   // Initialize all systems
   await i18nManager.initialize();
   await migrationManager.initialize();
   monitoringManager.initialize();
   webSocketManager.initialize(server);
   ```

4. **Middleware add karo:**

   ```javascript
   app.use(i18nMiddleware);
   app.use(monitoringManager.requestMonitoring());
   app.use(monitoringManager.errorHandler()); // Last mein
   ```

5. **Test karo:**
   ```bash
   npm run dev
   ```

### **Production mein deploy karne se pehle:**

1. **Migrations run karo:**

   ```bash
   npm run migrate
   ```

2. **Health check test karo:**

   ```bash
   curl http://localhost:3000/health
   ```

3. **Sentry test karo:**

   ```javascript
   monitoringManager.captureMessage('Test deployment', 'info');
   ```

4. **WebSocket test karo:**
   ```javascript
   // Browser console mein
   const socket = io('http://localhost:3000', {
     auth: { token: 'your-jwt-token' },
   });
   ```

---

## 🎉 **Congratulations!**

Ab aapke paas complete enterprise-ready Node.js setup hai with:

- ✅ Multi-language support
- ✅ Real-time communication
- ✅ Advanced security with 2FA
- ✅ Database migrations
- ✅ Production monitoring

**Happy Coding! 🚀**

---

## 📞 **Support**

Agar koi problem aaye to:

1. Documentation check karo
2. Logs check karo (`npm run logs`)
3. Health endpoint check karo (`/health`)
4. Sentry dashboard check karo

**Remember:** Production mein deploy karne se pehle sab kuch test kar lena! 😊
