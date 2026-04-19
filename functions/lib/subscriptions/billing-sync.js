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
exports.checkBillingStatus = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
/**
 * Scheduled function to sync subscription statuses with payment gateways.
 * Runs every 6 hours.
 */
exports.checkBillingStatus = (0, scheduler_1.onSchedule)({ schedule: "every 6 hours" }, async (_event) => {
    const db = admin.firestore();
    // Find subscriptions that are active or past due
    const subsSnapshot = await db.collection("subscriptions")
        .where("status", "in", ["active", "past_due"])
        .get();
    if (subsSnapshot.empty) {
        console.log("No active subscriptions to check.");
        return;
    }
    const batch = db.batch();
    let updates = 0;
    for (const doc of subsSnapshot.docs) {
        const sub = doc.data();
        // In a real implementation we would:
        // 1. Get the PaymentGateway adapter based on sub.gateway
        // 2. Query the current status from MercadoPago / OpenPay API
        // 3. Compare with sub.status and update if different
        // Simulation: check if `nextBillingDate` has passed and grace period ended without payment
        if (sub.nextBillingDate && sub.nextBillingDate.toDate() < new Date()) {
            // Mark as past_due if we haven't received a successful webhook
            batch.update(doc.ref, { status: "past_due" });
            updates++;
        }
    }
    if (updates > 0) {
        await batch.commit();
        console.log(`Updated ${updates} subscriptions during billing sync.`);
    }
    return;
});
//# sourceMappingURL=billing-sync.js.map