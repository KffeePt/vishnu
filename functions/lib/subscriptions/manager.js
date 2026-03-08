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
exports.reactivateSubscription = exports.pauseSubscription = exports.cancelSubscription = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
/**
 * Callable function to cancel an active subscription.
 */
exports.cancelSubscription = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "User must be logged in.");
    const { subscriptionId } = request.data;
    const clientId = request.auth.uid;
    if (!subscriptionId) {
        throw new https_1.HttpsError("invalid-argument", "Subscription ID is required.");
    }
    const db = admin.firestore();
    const subRef = db.collection("subscriptions").doc(subscriptionId);
    const subSnap = await subRef.get();
    if (!subSnap.exists) {
        throw new https_1.HttpsError("not-found", "Subscription not found.");
    }
    const subData = subSnap.data();
    // Security check
    if (subData.clientId !== clientId && !request.auth.token.admin) {
        throw new https_1.HttpsError("permission-denied", "You don't own this subscription.");
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
exports.pauseSubscription = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "User must be logged in.");
    const { subscriptionId } = request.data;
    const clientId = request.auth.uid;
    const db = admin.firestore();
    const subRef = db.collection("subscriptions").doc(subscriptionId);
    const subSnap = await subRef.get();
    if (!subSnap.exists) {
        throw new https_1.HttpsError("not-found", "Subscription not found.");
    }
    if (subSnap.data().clientId !== clientId && !request.auth.token.admin) {
        throw new https_1.HttpsError("permission-denied", "You don't own this subscription.");
    }
    await subRef.update({
        status: "paused",
        pausedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true };
});
exports.reactivateSubscription = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "User must be logged in.");
    const { subscriptionId } = request.data;
    const subRef = admin.firestore().collection("subscriptions").doc(subscriptionId);
    await subRef.update({
        status: "active",
        reactivatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true };
});
//# sourceMappingURL=manager.js.map