"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onSupportMessageCreate = exports.sendSupportMessage = exports.createSupportThread = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
/**
 * Callable function for a client to open a new support thread.
 */
exports.createSupportThread = functions.https.onCall(async (request) => {
    if (!request.auth)
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");
    const { subject, initialMessage } = request.data;
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
exports.sendSupportMessage = functions.https.onCall(async (request) => {
    if (!request.auth)
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");
    const { threadId, text, attachments } = request.data;
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
    const threadData = threadSnap.data();
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
exports.onSupportMessageCreate = (0, firestore_1.onDocumentCreated)("support_threads/{threadId}/messages/{messageId}", async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const newMessage = snap.data();
    const threadId = event.params.threadId;
    const db = admin.firestore();
    let textPreview = newMessage.text || "Shared an attachment.";
    if (textPreview.length > 100) {
        textPreview = textPreview.substring(0, 100) + "...";
    }
    const isClientSender = newMessage.senderRole === "client";
    const updateData = {
        lastMessage: textPreview,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (isClientSender) {
        updateData.unreadCountStaff = admin.firestore.FieldValue.increment(1);
    }
    else {
        updateData.unreadCountClient = admin.firestore.FieldValue.increment(1);
        updateData.status = "answered"; // Automatically mark as answered if staff replies
    }
    await db.collection("support_threads").doc(threadId).update(updateData);
    // In a real scenario, we might also dispatch push notifications or emails here.
});
//# sourceMappingURL=index.js.map