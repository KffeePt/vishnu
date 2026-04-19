import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userId, email, page, action, authorized = false } = await request.json();

    if (!userId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, action' },
        { status: 400 }
      );
    }

    // Forward to centralized logging service
    const loggingRequest = new Request(
      `${request.nextUrl.origin}/api/admin/logging-service`,
      {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({
          logType: 'access-attempt',
          data: {
            userId,
            email,
            page,
            action,
            authorized,
          },
        }),
      }
    );

    const response = await fetch(loggingRequest);
    const result = await response.json();

    return NextResponse.json(result, { status: response.status });

  } catch (error: any) {
    console.error('Error logging access attempt:', error);
    return NextResponse.json(
      { error: 'Failed to log access attempt' },
      { status: 500 }
    );
  }
}
