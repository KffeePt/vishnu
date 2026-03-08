import { PaymentGateway, ChargeOptions, ChargeResult, SubscriptionPlan, CustomerInfo, SubscriptionResult, WebhookEvent } from "./gateway";
import Openpay from "openpay";

export class OpenPayGateway implements PaymentGateway {
  private openpay: any;

  constructor(merchantId: string, privateKey: string, isProduction: boolean = false) {
    // Basic OpenPay initialization
    this.openpay = new Openpay(merchantId, privateKey, isProduction);
  }

  async createCharge(amount: number, currency: string, options: ChargeOptions): Promise<ChargeResult> {
    const chargeRequest = {
      source_id: options.token,
      method: 'card',
      amount: amount,
      currency: currency,
      description: options.description,
      order_id: options.externalReference,
      device_session_id: options.deviceId,
      customer: {
        email: options.email
      }
    };

    return new Promise((resolve, reject) => {
      this.openpay.charges.create(chargeRequest, (error: any, charge: any) => {
        if (error) {
          console.error("OpenPay Charge Error:", error);
          reject(error);
        } else {
          resolve({
            id: charge.id,
            status: charge.status === 'completed' ? 'completed' : 'pending'
          });
        }
      });
    });
  }

  async createSubscription(plan: SubscriptionPlan, customer: CustomerInfo, externalReference: string): Promise<SubscriptionResult> {
    return new Promise((resolve, reject) => {
      // Find or create customer (skipping full flow for brevity)
      const customerRequest = {
        name: customer.name || "Client",
        last_name: "Vishnu",
        email: customer.email,
        requires_account: false
      };

      this.openpay.customers.create(customerRequest, (error: any, c: any) => {
         if (error) return reject(error);

         const subscriptionRequest = {
            plan_id: plan.id,
         };

         this.openpay.customers.subscriptions.create(c.id, subscriptionRequest, (err: any, sub: any) => {
            if (err) return reject(err);
            resolve({
               id: sub.id,
               status: sub.status === 'active' ? 'active' : 'pending',
               gatewayUrl: "openpay-integration-required" // Normally standard form
            });
         });
      });
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    // Requires customer_id + subscription_id in OpenPay
    console.log("Canceling OpenPay subscription:", subscriptionId);
  }

  async handleWebhook(req: any): Promise<WebhookEvent | null> {
    const body = req.body;
    if (!body || !body.type) return null;

    let type: "payment" | "subscription" = "payment";
    if (body.type.includes("subscription")) type = "subscription";

    return {
      gateway: "openpay",
      type,
      externalId: body.transaction_id || body.subscription?.id,
      status: body.type,
      raw: body
    };
  }

  async getPaymentStatus(paymentId: string): Promise<any> {
    return new Promise((resolve, reject) => {
       this.openpay.charges.get(paymentId, (error: any, charge: any) => {
          if (error) reject(error);
          else resolve(charge);
       });
    });
  }
}
