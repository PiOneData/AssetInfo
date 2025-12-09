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
        AccessRequest: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            tenantId: { type: 'string', format: 'uuid' },
            requesterId: { type: 'string', format: 'uuid' },
            requesterName: { type: 'string' },
            requesterEmail: { type: 'string', format: 'email' },
            appId: { type: 'string', format: 'uuid' },
            appName: { type: 'string' },
            accessType: {
              type: 'string',
              enum: ['viewer', 'member', 'admin', 'owner'],
            },
            justification: { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending', 'approved', 'denied', 'provisioned', 'failed'],
            },
            durationType: {
              type: 'string',
              enum: ['permanent', 'temporary'],
            },
            durationHours: { type: 'integer', nullable: true },
            riskScore: { type: 'integer', minimum: 0, maximum: 100 },
            riskLevel: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            riskFactors: {
              type: 'array',
              items: { type: 'string' },
            },
            sodConflicts: {
              type: 'array',
              items: { type: 'object' },
            },
            approverId: { type: 'string', format: 'uuid', nullable: true },
            approverName: { type: 'string', nullable: true },
            approvedAt: { type: 'string', format: 'date-time', nullable: true },
            approverNotes: { type: 'string', nullable: true },
            slaDueAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        JitAccessSession: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            tenantId: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            userName: { type: 'string' },
            userEmail: { type: 'string', format: 'email' },
            appId: { type: 'string', format: 'uuid' },
            appName: { type: 'string' },
            accessType: {
              type: 'string',
              enum: ['viewer', 'member', 'admin', 'owner'],
            },
            justification: { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending_approval', 'pending_mfa', 'active', 'expired', 'revoked', 'denied'],
            },
            requiresApproval: { type: 'boolean' },
            requiresMfa: { type: 'boolean' },
            mfaVerified: { type: 'boolean' },
            previousAccessType: { type: 'string', nullable: true },
            startedAt: { type: 'string', format: 'date-time', nullable: true },
            expiresAt: { type: 'string', format: 'date-time' },
            revokedAt: { type: 'string', format: 'date-time', nullable: true },
            revokedBy: { type: 'string', format: 'uuid', nullable: true },
            revocationReason: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        SodRule: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            tenantId: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            severity: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            appId1: { type: 'string', format: 'uuid' },
            appName1: { type: 'string' },
            appId2: { type: 'string', format: 'uuid' },
            appName2: { type: 'string' },
            rationale: { type: 'string' },
            complianceFramework: {
              type: 'string',
              enum: ['SOX', 'GDPR', 'HIPAA', 'PCI-DSS', 'Custom'],
              nullable: true,
            },
            isActive: { type: 'boolean' },
            exemptedUsers: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
              nullable: true,
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        SodViolation: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            tenantId: { type: 'string', format: 'uuid' },
            sodRuleId: { type: 'string', format: 'uuid' },
            ruleName: { type: 'string' },
            userId: { type: 'string', format: 'uuid' },
            userName: { type: 'string' },
            userEmail: { type: 'string', format: 'email' },
            appId1: { type: 'string', format: 'uuid' },
            appName1: { type: 'string' },
            appId2: { type: 'string', format: 'uuid' },
            appName2: { type: 'string' },
            severity: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            status: {
              type: 'string',
              enum: ['open', 'investigating', 'remediated', 'exempted'],
            },
            detectedAt: { type: 'string', format: 'date-time' },
            remediatedAt: { type: 'string', format: 'date-time', nullable: true },
            remediationNotes: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        AnomalyDetection: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            tenantId: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            userName: { type: 'string' },
            userEmail: { type: 'string', format: 'email' },
            appId: { type: 'string', format: 'uuid' },
            appName: { type: 'string' },
            anomalyType: {
              type: 'string',
              enum: [
                'after_hours_access',
                'weekend_access',
                'geographic_anomaly',
                'rapid_app_switching',
                'bulk_download',
                'privilege_escalation',
                'failed_login_spike',
              ],
            },
            severity: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            confidence: { type: 'integer', minimum: 0, maximum: 100 },
            description: { type: 'string' },
            eventData: { type: 'object' },
            baselineData: { type: 'object' },
            status: {
              type: 'string',
              enum: ['open', 'investigating', 'resolved', 'false_positive'],
            },
            isFalsePositive: { type: 'boolean' },
            investigationNotes: { type: 'string', nullable: true },
            investigatedBy: { type: 'string', format: 'uuid', nullable: true },
            investigatedAt: { type: 'string', format: 'date-time', nullable: true },
            resolvedBy: { type: 'string', format: 'uuid', nullable: true },
            resolvedAt: { type: 'string', format: 'date-time', nullable: true },
            resolutionNotes: { type: 'string', nullable: true },
            detectedAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
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
      { name: 'Access Requests', description: 'Self-service access request workflow with risk assessment and approval' },
      { name: 'JIT Access', description: 'Just-In-Time temporary privilege elevation with auto-revocation' },
      { name: 'SoD', description: 'Segregation of Duties rules and violation detection' },
      { name: 'Anomaly Detection', description: 'Behavioral anomaly detection and investigation' },
    ],
  },
  apis: [
    './server/routes/*.ts',
    './server/routes.legacy.ts',
  ],
};

export const swaggerSpec = swaggerJsDoc(swaggerOptions);
