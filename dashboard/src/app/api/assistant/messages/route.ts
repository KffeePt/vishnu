import { NextResponse } from 'next/server';
import admin from '@/config/firebase-admin'; // Import the default admin namespace

// Interface for the data returned for each message
interface MessageData {
  id: string;
  content: string;
  sender: "user" | "assistant";
  timestamp: string; // ISO string date
  classification?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('conversationId');
  const userId = searchParams.get('userId'); // For an extra layer of security/validation

  if (!conversationId) {
    return NextResponse.json({ error: "Missing conversationId query parameter." }, { status: 400 });
  }
  if (!userId) {
    return NextResponse.json({ error: "Missing userId query parameter for validation." }, { status: 400 });
  }

  try {
    const adminDb = admin.firestore(); // Use the Firestore service for the default app

    // Validate that the conversation belongs to the user
    const conversationRef = adminDb.collection("conversations").doc(conversationId);
    const conversationSnap = await conversationRef.get();

    if (!conversationSnap.exists) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
    if (conversationSnap.data()?.userId !== userId) {
      return NextResponse.json({ error: "User not authorized to access this conversation." }, { status: 403 });
    }

    // Fetch messages
    const messagesRef = adminDb.collection("conversations").doc(conversationId).collection("messages");
    const querySnapshot = await messagesRef
      .orderBy("timestamp", "asc") // Get messages in chronological order
      .get();

    const messages: MessageData[] = [];
    querySnapshot.forEach(doc => {
      const data = doc.data();
      const timestamp = data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : new Date(0).toISOString();
      
      messages.push({
        id: doc.id,
        content: data.content,
        sender: data.sender,
        timestamp: timestamp,
        classification: data.classification,
      });
    });

    return NextResponse.json(messages);

  } catch (error) {
    console.error("Error fetching messages:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Error fetching messages: ${errorMessage}` },
      { status: 500 }
    );
  }
}
