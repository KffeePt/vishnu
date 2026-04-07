import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";

/**
 * Scheduled function to sync subscription statuses with payment gateways.
 * Runs every 6 hours.
 */
export const checkBillingStatus = onSchedule({ schedule: "every 6 hours" }, async (_event) => {
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
