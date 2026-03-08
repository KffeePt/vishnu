import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

/**
 * Callable function for a client to open a new support thread.
 */
export const createSupportThread = functions.https.onCall(async (request) => {
  if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");

  const { subject, initialMessage } = request.data as { subject: string, initialMessage: string };
  const clientId = request.auth.uid;
  
  if (!subject || !initialMessage) {
    throw new functions.https.HttpsError("invalid-argument", "Subject and initial message are required.");
  }

  const db = admin.firestore();
  
  // 1. Create the thread document
  const threadRef = await db.collection("support_threads").add({
    clientId,
    subject,
    status: "open",
    assignedStaff: [], // Unassigned initially
    unreadCountClient: 0,
    unreadCountStaff: 1, // Staff needs to read this newly created thread
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessage: initialMessage.substring(0, 100) + (initialMessage.length > 100 ? "..." : "")
  });

  // 2. Add the initial message to the subcollection
  await threadRef.collection("messages").add({
    senderId: clientId,
    senderRole: "client",
    text: initialMessage,
    attachments: [],
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    readBy: [clientId]
  });

  return { threadId: threadRef.id };
});

/**
 * Callable function to send a message to an existing support thread.
 */
export const sendSupportMessage = functions.https.onCall(async (request) => {
  if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");

  const { threadId, text, attachments } = request.data as { threadId: string, text: string, attachments?: string[] };
  const senderId = request.auth.uid;
  const senderRole = request.auth.token.client ? "client" : "staff"; // Basic role check based on custom claim
  
  if (!threadId || (!text && (!attachments || attachments.length === 0))) {
    throw new functions.https.HttpsError("invalid-argument", "Thread ID and content (text or attachments) are required.");
  }

  const db = admin.firestore();
  const threadRef = db.collection("support_threads").doc(threadId);
  const threadSnap = await threadRef.get();

  if (!threadSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Support thread not found.");
  }

  const threadData = threadSnap.data()!;

  // Security check: If client, they must own the thread.
  if (senderRole === "client" && threadData.clientId !== senderId) {
    throw new functions.https.HttpsError("permission-denied", "You don't have permission to message this thread.");
  }

  // Add the message
  const msgRef = await threadRef.collection("messages").add({
    senderId,
    senderRole,
    text,
    attachments: attachments || [],
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    readBy: [senderId]
  });

  return { messageId: msgRef.id };
});

/**
 * Firestore trigger to update thread metadata when a new message is added.
 */
export const onSupportMessageCreate = onDocumentCreated(
  "support_threads/{threadId}/messages/{messageId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const newMessage = snap.data();
    const threadId = event.params.threadId;
    const db = admin.firestore();
    
    let textPreview = newMessage.text || "Shared an attachment.";
    if (textPreview.length > 100) {
      textPreview = textPreview.substring(0, 100) + "...";
    }

    const isClientSender = newMessage.senderRole === "client";

    const updateData: any = {
      lastMessage: textPreview,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (isClientSender) {
        updateData.unreadCountStaff = admin.firestore.FieldValue.increment(1);
    } else {
        updateData.unreadCountClient = admin.firestore.FieldValue.increment(1);
        updateData.status = "answered"; // Automatically mark as answered if staff replies
    }

    await db.collection("support_threads").doc(threadId).update(updateData);
    
    // In a real scenario, we might also dispatch push notifications or emails here.
  });
