import { NextResponse } from 'next/server';
import admin from '@/config/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore'; // Though not directly used for reads, good to have if expanding

// Interface for the data returned for each conversation in the list
interface ConversationListItem {
  id: string; // This is the Firestore document ID
  userId: string;
  conversationId: string; // This should be the same as id, but explicitly from the document field
  createdAt: string; // ISO string date
  updatedAt: string; // ISO string date
  status: "active" | "completed" | "summarized";
  lastMessageSnippet?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: "Missing userId query parameter." }, { status: 400 });
  }

  try {
    const adminDb = admin.firestore();
    const conversationsRef = adminDb.collection("conversations");
    const querySnapshot = await conversationsRef
      .where("userId", "==", userId)
      .orderBy("updatedAt", "desc")
      .limit(50) // Limit to a reasonable number for the sidebar
      .get();

    const conversations: ConversationListItem[] = [];
    querySnapshot.forEach(doc => {
      const data = doc.data();
      // Convert Firestore Timestamps to ISO strings for JSON serialization
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date(0).toISOString();
      const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date(0).toISOString();
      
      conversations.push({
        id: doc.id, // The Firestore document ID
        userId: data.userId,
        conversationId: data.conversationId || doc.id, // Use field, fallback to doc.id for older docs
        createdAt: createdAt,
        updatedAt: updatedAt,
        status: data.status || "active",
        lastMessageSnippet: data.lastMessageSnippet || "No messages yet.",
      });
    });

    return NextResponse.json(conversations);

  } catch (error) {
    console.error("Error fetching conversations:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Error fetching conversations: ${errorMessage}` },
      { status: 500 }
    );
  }
}
