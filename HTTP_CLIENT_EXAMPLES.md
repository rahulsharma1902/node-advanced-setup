# 🚀 HTTP Client Wrapper - Complete Usage Guide

## 📋 **Table of Contents**

1. [Basic Usage](#basic-usage)
2. [Authentication Methods](#authentication-methods)
3. [Error Handling & Retries](#error-handling--retries)
4. [File Upload/Download](#file-uploaddownload)
5. [Batch Requests](#batch-requests)
6. [Pre-configured Clients](#pre-configured-clients)
7. [Advanced Features](#advanced-features)
8. [Real-World Examples](#real-world-examples)

---

## 🔧 **Basic Usage**

### Simple HTTP Client

```javascript
const { createHttpClient } = require('./src/utils/httpClient');

// Create a basic client
const apiClient = createHttpClient('My API', {
  baseURL: 'https://api.example.com',
  timeout: 10000,
  retries: 3,
});

// Make requests
const users = await apiClient.get('/users');
const newUser = await apiClient.post('/users', { name: 'John', email: 'john@example.com' });
const updatedUser = await apiClient.put('/users/123', { name: 'John Doe' });
await apiClient.delete('/users/123');
```

---

## 🔐 **Authentication Methods**

### 1. Bearer Token Authentication

```javascript
const client = createHttpClient('Protected API', {
  baseURL: 'https://api.example.com',
  auth: {
    type: 'bearer',
    token: 'your-jwt-token-here',
  },
});

// Dynamic token (function)
const client = createHttpClient('Protected API', {
  baseURL: 'https://api.example.com',
  auth: {
    type: 'bearer',
    token: async () => {
      // Get token from database, cache, etc.
      return await getTokenFromDatabase();
    },
  },
});
```

### 2. Basic Authentication

```javascript
const client = createHttpClient('Basic Auth API', {
  baseURL: 'https://api.example.com',
  auth: {
    type: 'basic',
    username: 'your-username',
    password: 'your-password',
  },
});
```

### 3. API Key Authentication

```javascript
// API Key in Header
const client = createHttpClient('API Key Service', {
  baseURL: 'https://api.example.com',
  auth: {
    type: 'apikey',
    location: 'header',
    key: 'X-API-Key',
    apiKey: 'your-api-key',
  },
});

// API Key in Query Parameter
const client = createHttpClient('API Key Service', {
  baseURL: 'https://api.example.com',
  auth: {
    type: 'apikey',
    location: 'query',
    key: 'api_key',
    apiKey: 'your-api-key',
  },
});
```

### 4. OAuth2 Authentication

```javascript
const client = createHttpClient('OAuth2 API', {
  baseURL: 'https://api.example.com',
  auth: {
    type: 'oauth2',
    oauth2Token: async () => {
      return await getOAuth2Token();
    },
  },
});
```

### 5. Custom Authentication

```javascript
const client = createHttpClient('Custom Auth API', {
  baseURL: 'https://api.example.com',
  auth: {
    type: 'custom',
    customAuth: async config => {
      // Add custom authentication logic
      const signature = generateSignature(config.data);
      config.headers['X-Signature'] = signature;
      config.headers['X-Timestamp'] = Date.now();
    },
  },
});
```

### 6. Token Refresh Handling

```javascript
const client = createHttpClient('Auto Refresh API', {
  baseURL: 'https://api.example.com',
  auth: {
    type: 'bearer',
    token: 'initial-token',
    refreshToken: async () => {
      // Refresh token logic
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

---

## ⚠️ **Error Handling & Retries**

### Automatic Retry with Exponential Backoff

```javascript
const client = createHttpClient('Reliable API', {
  baseURL: 'https://api.example.com',
  retries: 5,
  retryDelay: 1000, // Start with 1 second
  timeout: 30000,
});

// The client will automatically retry:
// - Network errors (ECONNREFUSED, ENOTFOUND)
// - 5xx server errors
// - 429 rate limit errors
// With exponential backoff: 1s, 2s, 4s, 8s, 16s
```

### Custom Error Handling

```javascript
try {
  const data = await client.get('/users');
} catch (error) {
  if (error instanceof ExternalServiceError) {
    console.log('Service:', error.service);
    console.log('Status:', error.statusCode);
    console.log('Details:', error.details);
  }
}
```

---

## 📁 **File Upload/Download**

### File Upload with Progress

```javascript
const fs = require('fs');

const client = createHttpClient('File Service', {
  baseURL: 'https://upload.example.com',
});

// Upload file with progress tracking
const fileBuffer = fs.readFileSync('./document.pdf');

const result = await client.uploadFile('/upload', fileBuffer, {
  fieldName: 'document',
  fields: {
    category: 'legal',
    description: 'Contract document',
  },
  onProgress: progressEvent => {
    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
    console.log(`Upload progress: ${percentCompleted}%`);
  },
});
```

### File Download with Progress

```javascript
const fs = require('fs');

const fileStream = await client.downloadFile('/files/document.pdf', {
  onProgress: progressEvent => {
    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
    console.log(`Download progress: ${percentCompleted}%`);
  },
});

// Save to file
fileStream.pipe(fs.createWriteStream('./downloaded-document.pdf'));
```

---

## 🔄 **Batch Requests**

### Concurrent Batch Processing

```javascript
const requests = [
  { method: 'GET', url: '/users/1' },
  { method: 'GET', url: '/users/2' },
  { method: 'POST', url: '/users', data: { name: 'New User' } },
  { method: 'PUT', url: '/users/3', data: { name: 'Updated User' } },
];

const results = await client.batchRequests(requests, {
  concurrency: 3, // Process 3 requests at a time
  failFast: false, // Continue even if some requests fail
});

results.forEach((result, index) => {
  if (result.success) {
    console.log(`Request ${index} succeeded:`, result.data);
  } else {
    console.log(`Request ${index} failed:`, result.error);
  }
});
```

---

## 🏭 **Pre-configured Clients**

### Stripe Integration

```javascript
const { createStripeClient } = require('./src/utils/httpClient');

const stripe = createStripeClient('sk_test_your_stripe_key');

// Create customer
const customer = await stripe.post('/customers', {
  email: 'customer@example.com',
  name: 'John Doe',
});

// Create payment intent
const paymentIntent = await stripe.post('/payment_intents', {
  amount: 2000,
  currency: 'usd',
  customer: customer.id,
});
```

### Slack Integration

```javascript
const { createSlackClient } = require('./src/utils/httpClient');

const slack = createSlackClient('xoxb-your-bot-token');

// Send message
await slack.post('/chat.postMessage', {
  channel: '#general',
  text: 'Hello from Node.js!',
  username: 'Bot',
});

// Upload file
await slack.uploadFile('/files.upload', fileBuffer, {
  fieldName: 'file',
  fields: {
    channels: '#general',
    title: 'Important Document',
  },
});
```

### Twilio Integration

```javascript
const { createTwilioClient } = require('./src/utils/httpClient');

const twilio = createTwilioClient('ACxxxxx', 'your_auth_token');

// Send SMS
await twilio.post('/Messages.json', {
  From: '+1234567890',
  To: '+0987654321',
  Body: 'Hello from Node.js!',
});

// Make call
await twilio.post('/Calls.json', {
  From: '+1234567890',
  To: '+0987654321',
  Url: 'http://demo.twilio.com/docs/voice.xml',
});
```

### SendGrid Integration

```javascript
const { createSendGridClient } = require('./src/utils/httpClient');

const sendgrid = createSendGridClient('SG.your_api_key');

// Send email
await sendgrid.post('/mail/send', {
  personalizations: [
    {
      to: [{ email: 'recipient@example.com' }],
      subject: 'Hello from Node.js!',
    },
  ],
  from: { email: 'sender@example.com' },
  content: [
    {
      type: 'text/plain',
      value: 'Hello, World!',
    },
  ],
});
```

### Google API Integration

```javascript
const { createGoogleAPIClient } = require('./src/utils/httpClient');

const google = createGoogleAPIClient('your_google_api_key');

// Geocoding
const location = await google.get('/maps/api/geocode/json', {
  params: {
    address: '1600 Amphitheatre Parkway, Mountain View, CA',
  },
});

// YouTube search
const videos = await google.get('/youtube/v3/search', {
  params: {
    part: 'snippet',
    q: 'nodejs tutorial',
    type: 'video',
  },
});
```

---

## 🚀 **Advanced Features**

### Dynamic Configuration

```javascript
const client = createHttpClient('Dynamic API', {
  baseURL: 'https://api.example.com',
});

// Change authentication at runtime
client.setAuth({
  type: 'bearer',
  token: 'new-token',
});

// Update headers
client.setHeaders({
  'X-Custom-Header': 'custom-value',
  'X-Version': '2.0',
});

// Change base URL
client.setBaseURL('https://api-v2.example.com');
```

### Health Checks

```javascript
const client = createHttpClient('External Service', {
  baseURL: 'https://api.example.com',
});

// Check service health
const health = await client.healthCheck('/status');
if (health.healthy) {
  console.log('Service is healthy');
} else {
  console.log('Service is down:', health.error);
}
```

### Request/Response Interceptors

```javascript
const client = createHttpClient('Logged API', {
  baseURL: 'https://api.example.com',
});

// All requests and responses are automatically logged
// with sanitized headers (sensitive data redacted)
```

### Performance Monitoring

```javascript
// Get client statistics
const stats = client.getStats();
console.log('Client stats:', stats);

// Response headers include performance metrics:
// X-Response-Time: 150ms
// X-Response-Time-Precise: 149.234ms
// X-Memory-Usage: 45MB
```

---

## 🌍 **Real-World Examples**

### E-commerce Integration

```javascript
// Payment processing with Stripe
const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY);

const processPayment = async (amount, customerId) => {
  try {
    const paymentIntent = await stripe.post('/payment_intents', {
      amount: amount * 100, // Convert to cents
      currency: 'usd',
      customer: customerId,
      confirm: true,
    });

    return { success: true, paymentIntent };
  } catch (error) {
    console.error('Payment failed:', error.message);
    return { success: false, error: error.message };
  }
};
```

### Notification System

```javascript
// Multi-channel notifications
const slack = createSlackClient(process.env.SLACK_BOT_TOKEN);
const twilio = createTwilioClient(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
const sendgrid = createSendGridClient(process.env.SENDGRID_API_KEY);

const sendNotification = async (message, channels) => {
  const promises = [];

  if (channels.includes('slack')) {
    promises.push(
      slack.post('/chat.postMessage', {
        channel: '#alerts',
        text: message,
      }),
    );
  }

  if (channels.includes('sms')) {
    promises.push(
      twilio.post('/Messages.json', {
        From: process.env.TWILIO_PHONE,
        To: process.env.ADMIN_PHONE,
        Body: message,
      }),
    );
  }

  if (channels.includes('email')) {
    promises.push(
      sendgrid.post('/mail/send', {
        personalizations: [
          {
            to: [{ email: process.env.ADMIN_EMAIL }],
            subject: 'System Alert',
          },
        ],
        from: { email: process.env.FROM_EMAIL },
        content: [
          {
            type: 'text/plain',
            value: message,
          },
        ],
      }),
    );
  }

  const results = await Promise.allSettled(promises);
  return results;
};
```

### Data Synchronization

```javascript
// Sync data between multiple services
const crm = createHttpClient('CRM', {
  baseURL: 'https://crm.example.com/api',
  auth: { type: 'apikey', location: 'header', key: 'X-API-Key', apiKey: process.env.CRM_API_KEY },
});

const analytics = createHttpClient('Analytics', {
  baseURL: 'https://analytics.example.com/api',
  auth: { type: 'bearer', token: process.env.ANALYTICS_TOKEN },
});

const syncCustomerData = async customerId => {
  try {
    // Get customer from CRM
    const customer = await crm.get(`/customers/${customerId}`);

    // Send to analytics
    await analytics.post('/events', {
      event: 'customer_updated',
      customer_id: customerId,
      properties: customer,
      timestamp: new Date().toISOString(),
    });

    console.log(`Customer ${customerId} synced successfully`);
  } catch (error) {
    console.error(`Failed to sync customer ${customerId}:`, error.message);
  }
};
```

### Microservices Communication

```javascript
// Service-to-service communication
const userService = createHttpClient('User Service', {
  baseURL: 'http://user-service:3001',
  auth: { type: 'bearer', token: process.env.SERVICE_TOKEN },
  timeout: 5000,
  retries: 2,
});

const orderService = createHttpClient('Order Service', {
  baseURL: 'http://order-service:3002',
  auth: { type: 'bearer', token: process.env.SERVICE_TOKEN },
  timeout: 10000,
  retries: 3,
});

const createOrderWithUser = async (userId, orderData) => {
  try {
    // Get user details
    const user = await userService.get(`/users/${userId}`);

    // Create order with user info
    const order = await orderService.post('/orders', {
      ...orderData,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });

    return order;
  } catch (error) {
    throw new Error(`Failed to create order: ${error.message}`);
  }
};
```

---

## 🎯 **Best Practices**

### 1. **Environment-based Configuration**

```javascript
const createAPIClient = service => {
  const config = {
    development: {
      baseURL: `http://localhost:${service.port}`,
      timeout: 10000,
    },
    production: {
      baseURL: `https://${service.domain}`,
      timeout: 30000,
      retries: 5,
    },
  };

  return createHttpClient(service.name, config[process.env.NODE_ENV]);
};
```

### 2. **Error Handling Strategy**

```javascript
const handleAPIError = (error, context) => {
  if (error instanceof ExternalServiceError) {
    // Log structured error
    logError(error, { context, service: error.service });

    // Return user-friendly message
    return {
      success: false,
      message: 'External service temporarily unavailable',
      code: error.code,
    };
  }

  throw error; // Re-throw unexpected errors
};
```

### 3. **Circuit Breaker Pattern**

```javascript
class CircuitBreaker {
  constructor(client, options = {}) {
    this.client = client;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.failures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }

  async call(method, ...args) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await this.client[method](...args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }
}
```

---

## 🏆 **Summary**

This HTTP client wrapper provides:

✅ **Multiple Authentication Methods** - Bearer, Basic, API Key, OAuth2, Custom  
✅ **Automatic Retries** - Exponential backoff for failed requests  
✅ **Error Handling** - Comprehensive error types and logging  
✅ **File Operations** - Upload/download with progress tracking  
✅ **Batch Processing** - Concurrent request handling  
✅ **Pre-configured Clients** - Ready-to-use integrations  
✅ **Performance Monitoring** - Request timing and metrics  
✅ **Health Checks** - Service availability monitoring  
✅ **Circuit Breaker** - Fault tolerance patterns

**This wrapper makes 3rd party API integration simple, reliable, and maintainable across all your projects!** 🚀
