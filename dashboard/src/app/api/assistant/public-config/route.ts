import { NextResponse } from 'next/server';
import admin from '@/config/firebase-admin';

export async function GET() {
  try {
    const adminDb = admin.firestore();
    const assistantConfigRef = adminDb.collection('app-config').doc('assistant');
    const assistantConfigDoc = await assistantConfigRef.get();

    if (!assistantConfigDoc.exists) {
      return NextResponse.json({ isPublic: false, unavailableMessage: "The assistant is currently unavailable. Please try again later." });
    }

    const assistantConfigData = assistantConfigDoc.data();
    const isPublic = assistantConfigData?.isPublic || false;
    const unavailableMessage = assistantConfigData?.unavailableMessage || "The assistant is currently unavailable. Please try again later.";

    return NextResponse.json({ isPublic, unavailableMessage });
  } catch (error) {
    console.error("Error in /api/assistant/public-config GET handler:", error);
    return NextResponse.json({ isPublic: false, unavailableMessage: "The assistant is currently unavailable. Please try again later." });
  }
}