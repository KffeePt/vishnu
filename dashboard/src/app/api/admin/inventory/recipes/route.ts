import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    console.warn('[DEPRECATED] Use /api/admin/recipes for recipes');
    return NextResponse.json([]);
}

export async function POST(request: NextRequest) {
    return NextResponse.json({ error: 'Endpoint deprecated. Use /api/admin/recipes.' }, { status: 410 });
}

export async function DELETE(request: NextRequest) {
    return NextResponse.json({ error: 'Endpoint deprecated. Use /api/admin/recipes.' }, { status: 410 });
}
