import { NextRequest, NextResponse } from 'next/server';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { db } from '@/config/firebase-admin';
import os from 'os';

interface SystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  release: string;
  uptime: number;
  loadAverage: number[];
  totalMemory: number;
  freeMemory: number;
  cpus: number;
  nodeVersion: string;
  environment: string;
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult;
    }

    const { logType, data } = await request.json();

    if (!logType) {
      return NextResponse.json(
        { error: 'Missing required field: logType' },
        { status: 400 }
      );
    }

    // Get current user info
    const authHeader = request.headers.get('authorization')!;
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await require('firebase-admin').auth().verifyIdToken(token);

    // Get comprehensive system information
    const systemInfo: SystemInfo = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      uptime: os.uptime(),
      loadAverage: os.loadavg(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpus: os.cpus().length,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    };

    // Route based on log type
    let collectionName = '';
    let logEntry: any = {
      ...data,
      timestamp: new Date(),
      loggedBy: decodedToken.uid,
      loggedByEmail: decodedToken.email,
      systemInfo,
      requestInfo: {
        ip: request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            'unknown',
        userAgent: request.headers.get('user-agent'),
        method: request.method,
        url: request.url,
      },
    };

    switch (logType) {
      case 'access-attempt':
        collectionName = 'access-attempts';
        logEntry = {
          ...logEntry,
          userId: data.userId,
          email: data.email,
          page: data.page,
          action: data.action,
          authorized: data.authorized || false,
        };
        break;

      case 'data-operation':
        collectionName = 'data-operations';
        logEntry = {
          ...logEntry,
          operation: data.operation,
          collection: data.collection,
          documentId: data.documentId,
          dataType: data.dataType,
          encrypted: data.encrypted || false,
          totalRecords: data.totalRecords,
          affectedRecords: data.affectedRecords,
          operationDetails: data.operationDetails,
        };
        break;

      case 'security-event':
        collectionName = 'security-events';
        logEntry = {
          ...logEntry,
          eventType: data.eventType,
          severity: data.severity,
          description: data.description,
          additionalContext: data.additionalContext,
        };
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid logType. Supported types: access-attempt, data-operation, security-event' },
          { status: 400 }
        );
    }

    // Save to Firestore
    const docRef = await db.collection(collectionName).add(logEntry);

    return NextResponse.json({
      message: `${logType} logged successfully`,
      id: docRef.id,
    });

  } catch (error: any) {
    console.error('Error in logging service:', error);
    return NextResponse.json(
      { error: 'Failed to log event' },
      { status: 500 }
    );
  }
}

// GET method to retrieve logs with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult;
    }

    const { searchParams } = new URL(request.url);
    const logType = searchParams.get('logType');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = searchParams.get('offset') || null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const userId = searchParams.get('userId');

    if (!logType) {
      return NextResponse.json(
        { error: 'Missing required parameter: logType' },
        { status: 400 }
      );
    }

    let collectionName = '';
    switch (logType) {
      case 'access-attempts':
        collectionName = 'access-attempts';
        break;
      case 'data-operations':
        collectionName = 'data-operations';
        break;
      case 'security-events':
        collectionName = 'security-events';
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid logType. Supported types: access-attempts, data-operations, security-events' },
          { status: 400 }
        );
    }

    let query = db.collection(collectionName)
      .orderBy('timestamp', 'desc')
      .limit(Math.min(limit, 100)); // Max 100 records per request

    // Apply filters
    if (userId) {
      query = query.where('userId', '==', userId);
    }

    if (startDate) {
      const start = new Date(startDate);
      query = query.where('timestamp', '>=', start);
    }

    if (endDate) {
      const end = new Date(endDate);
      query = query.where('timestamp', '<=', end);
    }

    if (offset) {
      const offsetDoc = await db.collection(collectionName).doc(offset).get();
      if (offsetDoc.exists) {
        query = query.startAfter(offsetDoc);
      }
    }

    const snapshot = await query.get();
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Convert timestamp to ISO string for JSON serialization
      timestamp: doc.data().timestamp?.toDate?.()?.toISOString() || doc.data().timestamp,
    }));

    return NextResponse.json({
      logs,
      hasMore: logs.length === limit,
      lastDocId: logs.length > 0 ? logs[logs.length - 1].id : null,
    });

  } catch (error: any) {
    console.error('Error retrieving logs:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve logs' },
      { status: 500 }
    );
  }
}
