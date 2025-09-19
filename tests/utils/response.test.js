const {
  sendResponse,
  sendSuccess,
  sendError,
  sendCreated,
  HTTP_STATUS,
} = require('../../src/utils/response');

describe('Response Utils', () => {
  let res;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('sendResponse', () => {
    it('should send success response with data', () => {
      const data = { user: 'test' };
      const message = 'Success';
      const statusCode = 200;

      sendResponse(res, data, message, statusCode);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Success',
        timestamp: expect.any(String),
        data: { user: 'test' },
      });
    });

    it('should send error response without data', () => {
      const message = 'Error occurred';
      const statusCode = 400;

      sendResponse(res, null, message, statusCode);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Error occurred',
        timestamp: expect.any(String),
      });
    });

    it('should include meta and pagination when provided', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const meta = { total: 2 };
      const pagination = { page: 1, limit: 10 };

      sendResponse(res, data, 'Success', 200, { meta, pagination });

      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Success',
        timestamp: expect.any(String),
        data,
        meta,
        pagination,
      });
    });

    it('should exclude timestamp when specified', () => {
      sendResponse(res, null, 'Success', 200, { includeTimestamp: false });

      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Success',
      });
    });
  });

  describe('sendSuccess', () => {
    it('should send success response with default message', () => {
      const data = { result: 'ok' };

      sendSuccess(res, data);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Success',
        timestamp: expect.any(String),
        data: { result: 'ok' },
      });
    });

    it('should send success response with custom message', () => {
      sendSuccess(res, null, 'Custom success message');

      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Custom success message',
        timestamp: expect.any(String),
      });
    });
  });

  describe('sendCreated', () => {
    it('should send created response with 201 status', () => {
      const data = { id: 1, name: 'New Item' };

      sendCreated(res, data);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Resource created successfully',
        timestamp: expect.any(String),
        data,
      });
    });

    it('should send created response with custom message', () => {
      sendCreated(res, null, 'User created successfully');

      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'User created successfully',
        timestamp: expect.any(String),
      });
    });
  });

  describe('sendError', () => {
    it('should send error response with default status', () => {
      sendError(res, 'Something went wrong');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Something went wrong',
        timestamp: expect.any(String),
      });
    });

    it('should send error response with custom status and code', () => {
      sendError(res, 'Validation failed', 400, { code: 'VALIDATION_ERROR' });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Validation failed',
        timestamp: expect.any(String),
        code: 'VALIDATION_ERROR',
      });
    });

    it('should include error details when provided', () => {
      const errors = [{ field: 'email', message: 'Invalid email' }];

      sendError(res, 'Validation failed', 400, {
        code: 'VALIDATION_ERROR',
        errors,
      });

      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Validation failed',
        timestamp: expect.any(String),
        code: 'VALIDATION_ERROR',
        errors,
      });
    });
  });

  describe('HTTP_STATUS constants', () => {
    it('should have correct status codes', () => {
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.CREATED).toBe(201);
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
      expect(HTTP_STATUS.FORBIDDEN).toBe(403);
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
      expect(HTTP_STATUS.UNPROCESSABLE_ENTITY).toBe(422);
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
    });
  });
});
