import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * Callable function to cancel an active subscription.
 */
export const cancelSubscription = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be logged in.");

  const { subscriptionId } = request.data as { subscriptionId: string };
  const clientId = request.auth.uid;
  
  if (!subscriptionId) {
    throw new HttpsError("invalid-argument", "Subscription ID is required.");
  }

  const db = admin.firestore();
  const subRef = db.collection("subscriptions").doc(subscriptionId);
  const subSnap = await subRef.get();

  if (!subSnap.exists) {
    throw new HttpsError("not-found", "Subscription not found.");
  }

  const subData = subSnap.data()!;

  // Security check
  if (subData.clientId !== clientId && !request.auth.token.admin) {
    throw new HttpsError("permission-denied", "You don't own this subscription.");
  }

  // Technically, we should call the PaymentGateway adapter here to cancel it on MP/Openpay
  // For the MVP flow, we just mark it as cancelled in Firestore, and optionally 
  // invoke the gateway's cancel method.
  
  await subRef.update({
    status: "cancelled",
    canceledAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true };
});

/**
 * Callable function to pause a subscription (where supported by gateway).
 */
export const pauseSubscription = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be logged in.");

  const { subscriptionId } = request.data as { subscriptionId: string };
  const clientId = request.auth.uid;

  const db = admin.firestore();
  const subRef = db.collection("subscriptions").doc(subscriptionId);
  const subSnap = await subRef.get();

  if (!subSnap.exists) {
    throw new HttpsError("not-found", "Subscription not found.");
  }

  if (subSnap.data()!.clientId !== clientId && !request.auth.token.admin) {
    throw new HttpsError("permission-denied", "You don't own this subscription.");
  }

  await subRef.update({
    status: "paused",
    pausedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true };
});

export const reactivateSubscription = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be logged in.");

  const { subscriptionId } = request.data as { subscriptionId: string };
  const subRef = admin.firestore().collection("subscriptions").doc(subscriptionId);
  
  await subRef.update({
    status: "active",
    reactivatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true };
});
