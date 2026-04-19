import { NextRequest, NextResponse } from 'next/server';
import admin from '@/config/firebase-admin'; // Import the default admin namespace
import { getFirestore } from 'firebase-admin/firestore'; // Import getFirestore

const adminDb = admin.firestore(); // Initialize Firestore with the default app instance

export async function DELETE(req: NextRequest) {
  try {
    const { userId, conversationId } = await req.json();

    if (!userId || !conversationId) {
      return NextResponse.json({ error: 'User ID and Conversation ID are required' }, { status: 400 });
    }

    const conversationRef = adminDb.collection('conversations').doc(conversationId);
    const conversationSnap = await conversationRef.get();

    if (!conversationSnap.exists) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const conversationData = conversationSnap.data();
    if (!conversationData) {
        // Should not happen if exists is true, but good for type safety
        return NextResponse.json({ error: 'Conversation data not found' }, { status: 404 });
    }

    // Check if the userId in the document matches the requesting userId
    if (conversationData.userId !== userId) {
      return NextResponse.json({ error: 'User not authorized to delete this conversation' }, { status: 403 });
    }
    
    // Check if the conversation status is 'completed'
    // As per the requirement, we should only allow deletion if NOT completed.
    // Frontend logic already implements this, backend check for security.
    if (conversationData.status === 'completed') {
        return NextResponse.json({ error: 'Completed conversations cannot be deleted through this endpoint' }, { status: 403 });
    }

    // Delete associated messages
    const messagesRef = adminDb.collection('conversations').doc(conversationId).collection('messages');
    const messagesSnap = await messagesRef.get();

    if (!messagesSnap.empty) {
      const batch = adminDb.batch();
      messagesSnap.docs.forEach(doc => {
        // Optional: Check if the message's userId also matches, for added security,
        // though if conversation ownership is verified, this might be redundant.
        // if (doc.data().userId === userId) {
        //   batch.delete(doc.ref);
        // }
        batch.delete(doc.ref);
      });
      await batch.commit();
    }

    // Now delete the conversation document itself
    await conversationRef.delete();

    return NextResponse.json({ message: 'Conversation and associated messages deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to delete conversation', details: errorMessage }, { status: 500 });
  }
}
