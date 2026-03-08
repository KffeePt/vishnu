import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { verifyWebhookSignature } from "./github-app";

const GITHUB_WEBHOOK_SECRET = defineSecret("GITHUB_WEBHOOK_SECRET");

export const githubWebhook = onRequest(
  { secrets: [GITHUB_WEBHOOK_SECRET] },
  async (req, res) => {
    // 1. Verify Request Method
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // 2. Verify Signature
    const signature = req.headers["x-hub-signature-256"] as string;
    const event = req.headers["x-github-event"] as string;
    const deliveryId = req.headers["x-github-delivery"] as string;

    if (!signature || !event || !deliveryId) {
      logger.warn("Missing required GitHub webhook headers");
      res.status(400).send("Bad Request: Missing Headers");
      return;
    }

    // We must use the raw body for signature verification
    const rawBody = req.rawBody.toString("utf8");
    const secret = GITHUB_WEBHOOK_SECRET.value();

    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      logger.error(`Webhook signature verification failed for delivery ${deliveryId}`);
      res.status(401).send("Unauthorized: Invalid Signature");
      return;
    }

    logger.info(`Received GitHub '${event}' event (Delivery: ${deliveryId})`);

    // 3. Log Event to Firestore
    try {
      const db = getFirestore();
      const payload = req.body; // Parsed JSON

      await db.collection("webhookEvents").doc(deliveryId).set({
        event,
        receivedAt: new Date(),
        action: payload.action || null,
        repository: payload.repository?.full_name || null,
        sender: payload.sender?.login || null,
        payload, // Store the full payload for auditing
      });

      // We can trigger specific logic here based on the event:
      // if (event === "member" && payload.action === "added") { ... }
      
      res.status(200).json({ received: true, deliveryId, event });
    } catch (error: any) {
      logger.error("Error processing webhook payload:", error);
      res.status(500).send("Internal Server Error processing payload");
    }
  }
);
