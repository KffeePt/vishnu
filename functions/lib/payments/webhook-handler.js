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
exports.paymentWebhook = exports.createSubscription = exports.createPayment = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const mercadopago_1 = require("./mercadopago");
const openpay_1 = require("./openpay");
const fiverr_1 = require("./fiverr");
const runtime_config_1 = require("../runtime-config");
function getMercadoPagoAccessToken() {
    return (0, runtime_config_1.getRuntimeConfigValue)({
        envNames: ["MERCADOPAGO_ACCESS_TOKEN"],
        configPath: ["payments", "mercadopago_access_token"],
    });
}
function getOpenPayMerchantId() {
    return (0, runtime_config_1.getRuntimeConfigValue)({
        envNames: ["OPENPAY_MERCHANT_ID"],
        configPath: ["payments", "openpay_merchant_id"],
    });
}
function getOpenPayPrivateKey() {
    return (0, runtime_config_1.getRuntimeConfigValue)({
        envNames: ["OPENPAY_PRIVATE_KEY"],
        configPath: ["payments", "openpay_private_key"],
        normalizeNewlines: true,
    });
}
// Helper to instantiate gateways based on config/secrets
function getGateway(name) {
    switch (name) {
        case "mercadopago":
            {
                const token = getMercadoPagoAccessToken();
                if (!token) {
                    throw new functions.https.HttpsError("failed-precondition", "MercadoPago runtime credentials are not configured.");
                }
                return new mercadopago_1.MercadoPagoGateway(token);
            }
        case "openpay":
            {
                const merchantId = getOpenPayMerchantId();
                const privateKey = getOpenPayPrivateKey();
                if (!merchantId || !privateKey) {
                    throw new functions.https.HttpsError("failed-precondition", "OpenPay runtime credentials are not configured.");
                }
                return new openpay_1.OpenPayGateway(merchantId, privateKey);
            }
        case "fiverr":
            return new fiverr_1.FiverrGateway("https://www.fiverr.com/santiagomtz/mock-gig");
        default:
            throw new Error(`Unsupported gateway: ${name}`);
    }
}
exports.createPayment = functions
    .https.onCall(async (request) => {
    if (!request.auth)
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");
    const { amount, currency, gateway, options } = request.data;
    const gw = getGateway(gateway);
    // Enforce externalReference ties to the logged-in user
    options.externalReference = options.externalReference || `charge_${request.auth.uid}_${Date.now()}`;
    const result = await gw.createCharge(amount, currency, options);
    // Log to Firestore
    await admin.firestore().collection("payments").doc(result.id).set({
        clientId: request.auth.uid,
        amount,
        currency,
        gateway,
        status: result.status,
        externalReference: options.externalReference,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    return result;
});
exports.createSubscription = functions
    .https.onCall(async (request) => {
    if (!request.auth)
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");
    const { plan, customer, gateway } = request.data;
    customer.email = customer.email || request.auth.token.email || "";
    const gw = getGateway(gateway);
    const extRef = `sub_${request.auth.uid}_${Date.now()}`;
    const result = await gw.createSubscription(plan, customer, extRef);
    await admin.firestore().collection("subscriptions").doc(result.id).set({
        clientId: request.auth.uid,
        planId: plan.id,
        gateway,
        status: result.status,
        externalReference: extRef,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    return result;
});
exports.paymentWebhook = functions
    .https.onRequest(async (req, res) => {
    // Identify gateway from URL params (e.g. ?gw=mercadopago)
    const gatewayName = req.query.gw;
    if (!gatewayName) {
        res.status(400).send("Missing gateway parameter");
        return;
    }
    try {
        const gw = getGateway(gatewayName);
        const event = await gw.handleWebhook(req);
        if (event) {
            if (event.type === 'payment') {
                const query = await admin.firestore().collection("payments")
                    .where("externalReference", "==", event.externalReference || event.externalId)
                    .limit(1).get();
                if (!query.empty) {
                    await query.docs[0].ref.update({ status: event.status });
                }
            }
            else if (event.type === 'subscription') {
                const query = await admin.firestore().collection("subscriptions")
                    .where("externalReference", "==", event.externalReference || event.externalId)
                    .limit(1).get();
                if (!query.empty) {
                    await query.docs[0].ref.update({ status: event.status });
                }
            }
        }
        res.status(200).send("OK");
    }
    catch (err) {
        console.error("Webhook Error:", err);
        res.status(500).send("Internal Server Error");
    }
});
//# sourceMappingURL=webhook-handler.js.map