import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { PaymentGateway, ChargeOptions, SubscriptionPlan, CustomerInfo } from "./gateway";
import { MercadoPagoGateway } from "./mercadopago";
import { OpenPayGateway } from "./openpay";
import { FiverrGateway } from "./fiverr";
import { getRuntimeConfigValue } from "../runtime-config";

function getMercadoPagoAccessToken(): string {
  return getRuntimeConfigValue({
    envNames: ["MERCADOPAGO_ACCESS_TOKEN"],
    configPath: ["payments", "mercadopago_access_token"],
  });
}

function getOpenPayMerchantId(): string {
  return getRuntimeConfigValue({
    envNames: ["OPENPAY_MERCHANT_ID"],
    configPath: ["payments", "openpay_merchant_id"],
  });
}

function getOpenPayPrivateKey(): string {
  return getRuntimeConfigValue({
    envNames: ["OPENPAY_PRIVATE_KEY"],
    configPath: ["payments", "openpay_private_key"],
    normalizeNewlines: true,
  });
}

// Helper to instantiate gateways based on config/secrets
function getGateway(name: string): PaymentGateway {
  switch (name) {
    case "mercadopago":
      {
        const token = getMercadoPagoAccessToken();
        if (!token) {
          throw new functions.https.HttpsError("failed-precondition", "MercadoPago runtime credentials are not configured.");
        }
        return new MercadoPagoGateway(token);
      }
    case "openpay":
      {
        const merchantId = getOpenPayMerchantId();
        const privateKey = getOpenPayPrivateKey();
        if (!merchantId || !privateKey) {
          throw new functions.https.HttpsError("failed-precondition", "OpenPay runtime credentials are not configured.");
        }
        return new OpenPayGateway(merchantId, privateKey);
      }
    case "fiverr":
      return new FiverrGateway("https://www.fiverr.com/santiagomtz/mock-gig");
    default:
      throw new Error(`Unsupported gateway: ${name}`);
  }
}

export const createPayment = functions
  .https.onCall(async (request) => {
  if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");

  const { amount, currency, gateway, options } = request.data as { amount: number, currency: string, gateway: string, options: ChargeOptions };
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

export const createSubscription = functions
  .https.onCall(async (request) => {
  if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");

  const { plan, customer, gateway } = request.data as { plan: SubscriptionPlan, customer: CustomerInfo, gateway: string };
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

export const paymentWebhook = functions
  .https.onRequest(async (req, res) => {
  // Identify gateway from URL params (e.g. ?gw=mercadopago)
  const gatewayName = req.query.gw as string;
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
      } else if (event.type === 'subscription') {
        const query = await admin.firestore().collection("subscriptions")
          .where("externalReference", "==", event.externalReference || event.externalId)
          .limit(1).get();
        if (!query.empty) {
          await query.docs[0].ref.update({ status: event.status });
        }
      }
    }
    
    res.status(200).send("OK");
  } catch (err: any) {
    console.error("Webhook Error:", err);
    res.status(500).send("Internal Server Error");
  }
});
