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
exports.githubWebhook = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const firestore_1 = require("firebase-admin/firestore");
const github_app_1 = require("./github-app");
const runtime_config_1 = require("./runtime-config");
exports.githubWebhook = (0, https_1.onRequest)(async (req, res) => {
    var _a, _b;
    // 1. Verify Request Method
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    // 2. Verify Signature
    const signature = req.headers["x-hub-signature-256"];
    const event = req.headers["x-github-event"];
    const deliveryId = req.headers["x-github-delivery"];
    if (!signature || !event || !deliveryId) {
        logger.warn("Missing required GitHub webhook headers");
        res.status(400).send("Bad Request: Missing Headers");
        return;
    }
    // We must use the raw body for signature verification
    const rawBody = req.rawBody.toString("utf8");
    const secret = (0, runtime_config_1.getRuntimeConfigValue)({
        envNames: ["GITHUB_WEBHOOK_SECRET"],
        configPath: ["github", "webhook_secret"],
    });
    if (!secret) {
        logger.error("GitHub webhook secret is not configured");
        res.status(503).send("GitHub webhook secret is not configured");
        return;
    }
    if (!(0, github_app_1.verifyWebhookSignature)(rawBody, signature, secret)) {
        logger.error(`Webhook signature verification failed for delivery ${deliveryId}`);
        res.status(401).send("Unauthorized: Invalid Signature");
        return;
    }
    logger.info(`Received GitHub '${event}' event (Delivery: ${deliveryId})`);
    // 3. Log Event to Firestore
    try {
        const db = (0, firestore_1.getFirestore)();
        const payload = req.body; // Parsed JSON
        await db.collection("webhookEvents").doc(deliveryId).set({
            event,
            receivedAt: new Date(),
            action: payload.action || null,
            repository: ((_a = payload.repository) === null || _a === void 0 ? void 0 : _a.full_name) || null,
            sender: ((_b = payload.sender) === null || _b === void 0 ? void 0 : _b.login) || null,
            payload, // Store the full payload for auditing
        });
        // We can trigger specific logic here based on the event:
        // if (event === "member" && payload.action === "added") { ... }
        res.status(200).json({ received: true, deliveryId, event });
    }
    catch (error) {
        logger.error("Error processing webhook payload:", error);
        res.status(500).send("Internal Server Error processing payload");
    }
});
//# sourceMappingURL=github-webhook.js.map