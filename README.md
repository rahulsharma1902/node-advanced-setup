# 🚀 Reusable Node.js Setup

A comprehensive, production-ready Node.js boilerplate with JavaScript, Express, and modern development tools. This setup is designed to be 100% reusable across different projects with a perfect 10/10 structure.

## ✨ Features

### 🏗️ Architecture & Structure

- **JavaScript ES6+** - Modern JavaScript with clean syntax
- **Express.js** - Fast, unopinionated web framework
- **Modular Architecture** - Clean separation of concerns
- **CommonJS Modules** - Standard Node.js module system
- **Environment Configuration** - Comprehensive config management

### 🛡️ Security & Middleware

- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **Rate Limiting** - Request throttling
- **Input Validation** - Joi schema validation
- **Error Handling** - Comprehensive error management

### 📊 Database & Caching

- **MongoDB** - Document database with Mongoose
- **Redis** - In-memory caching and sessions
- **Connection Pooling** - Optimized database connections
- **Health Checks** - Database monitoring

### 🔐 Authentication & Authorization

- **JWT** - JSON Web Token authentication
- **Bcrypt** - Password hashing
- **Refresh Tokens** - Secure token management
- **Role-based Access** - Authorization middleware

### 📝 Logging & Monitoring

- **Winston** - Structured logging
- **Morgan** - HTTP request logging
- **Daily Rotate** - Log file rotation
- **Performance Tracking** - Request timing

### 🧪 Testing & Quality

- **Jest** - Testing framework
- **Supertest** - HTTP assertion testing
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Coverage Reports** - Test coverage tracking

### 🐳 DevOps & Deployment

- **Docker** - Containerization with multi-stage builds
- **Docker Compose** - Development environment
- **GitHub Actions** - CI/CD pipeline
- **Health Checks** - Application monitoring

## 📁 Project Structure

```
├── src/
│   ├── config/           # Configuration management
│   ├── controllers/      # Route controllers
│   ├── database/         # Database connections
│   ├── middleware/       # Custom middleware
│   ├── models/          # Database models
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Utility functions
│   ├── validators/      # Input validation schemas
│   └── index.js         # Application entry point
├── tests/               # Test files
├── docs/               # Documentation
├── scripts/            # Build and deployment scripts
├── .github/            # GitHub Actions workflows
├── docker-compose.yml  # Development environment
├── Dockerfile          # Container configuration
└── README.md           # This file
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm 8+
- MongoDB (optional, can use Docker)
- Redis (optional, can use Docker)

### Installation

1. **Clone or copy this setup to your project:**

   ```bash
   # Copy all files to your new project directory
   cp -r reusable-node-setup/* your-new-project/
   cd your-new-project
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

### Using Docker (Recommended)

1. **Start with Docker Compose:**
   ```bash
   docker-compose up --build
   ```

This will start:

- Node.js application on `http://localhost:3000`
- MongoDB on `localhost:27017`
- Redis on `localhost:6379`
- Mongo Express UI on `http://localhost:8081`
- Redis Commander UI on `http://localhost:8082`

## 📚 Available Scripts

### Development

```bash
npm run dev          # Start development server with hot reload
npm run start        # Start production server
```

### Code Quality

```bash
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm run format       # Format code with Prettier
npm run format:check # Check code formatting
```

### Testing

```bash
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

### Docker

```bash
npm run docker:build # Build Docker image
npm run docker:run   # Run Docker container
npm run docker:dev   # Start development environment
```

### Database

```bash
npm run migrate      # Run database migrations
npm run seed         # Seed database with sample data
npm run db:reset     # Reset database
```

## 🔧 Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Application
NODE_ENV=development
PORT=3000
APP_NAME=Your App Name
APP_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb://localhost:27017/your_db
REDIS_HOST=localhost
REDIS_PORT=6379

# Security
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret-key
BCRYPT_ROUNDS=12

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### JavaScript Configuration

The setup uses modern JavaScript features:

- ES6+ syntax with async/await
- CommonJS modules (require/module.exports)
- Strict ESLint rules for code quality
- Prettier for consistent formatting

### Database Configuration

Supports multiple databases:

- **MongoDB** (default) - Document database
- **PostgreSQL** - Relational database (template included)
- **MySQL** - Relational database (template included)

## 🛠️ Customization

### Adding New Routes

1. Create controller in `src/controllers/`
2. Create route file in `src/routes/`
3. Add validation schemas in `src/validators/`
4. Register routes in `src/routes/index.js`

### Adding Middleware

1. Create middleware in `src/middleware/`
2. Export from middleware file
3. Apply in `src/index.js` or specific routes

### Database Models

1. Create model in `src/models/`
2. Define schema and interfaces
3. Export model for use in controllers

## 🧪 Testing

The setup includes comprehensive testing configuration:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

Test files should be placed in:

- `tests/` directory for integration tests
- `src/**/*.test.js` for unit tests

## 🐳 Docker Deployment

### Development

```bash
docker-compose up --build
```

### Production

```bash
# Build production image
docker build --target production -t your-app .

# Run production container
docker run -p 3000:3000 --env-file .env your-app
```

## 🔄 CI/CD

GitHub Actions workflow includes:

- **Code Quality** - Linting, formatting
- **Testing** - Unit and integration tests
- **Security** - Dependency scanning
- **Build** - Docker image creation
- **Deploy** - Automated deployment

## 📖 API Documentation

Once running, visit:

- **Health Check**: `GET /api/health`
- **API Info**: `GET /api/info`
- **Documentation**: `GET /api/docs` (if Swagger enabled)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Express.js team for the excellent framework
- Node.js community for amazing tools
- All open-source contributors

---

**Made with ❤️ for reusable, scalable Node.js applications by @rahulsharma1902**
