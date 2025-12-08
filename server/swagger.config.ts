import swaggerJsDoc from 'swagger-jsdoc';

const swaggerOptions: swaggerJsDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AssetVault IT Asset Management API',
      version: '1.0.0',
      description: 'Comprehensive API documentation for AssetVault ITAM platform',
      contact: {
        name: 'API Support',
        email: 'support@assetvault.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:5050',
        description: 'Development server',
      },
      {
        url: 'https://api.assetvault.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token obtained from /api/auth/login',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: {
              type: 'string',
              enum: ['super-admin', 'admin', 'it-manager', 'technician'],
            },
            tenantId: { type: 'string', format: 'uuid' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Asset: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            type: {
              type: 'string',
              enum: ['Hardware', 'Software', 'Peripherals', 'Others'],
            },
            category: { type: 'string' },
            manufacturer: { type: 'string' },
            model: { type: 'string' },
            serialNumber: { type: 'string' },
            status: {
              type: 'string',
              enum: ['in-stock', 'deployed', 'in-repair', 'disposed'],
            },
            tenantId: { type: 'string', format: 'uuid' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        ForbiddenError: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
    tags: [
      { name: 'Authentication', description: 'Authentication and authorization' },
      { name: 'Assets', description: 'Asset management operations' },
      { name: 'Users', description: 'User management' },
      { name: 'Tickets', description: 'Service desk ticketing' },
      { name: 'Compliance', description: 'Compliance and risk management' },
      { name: 'AI', description: 'AI-powered features and recommendations' },
      { name: 'Reports', description: 'Reporting and analytics' },
    ],
  },
  apis: [
    './server/routes/*.ts',
    './server/routes.legacy.ts',
  ],
};

export const swaggerSpec = swaggerJsDoc(swaggerOptions);
