import { PaymentGateway, ChargeOptions, ChargeResult, SubscriptionPlan, CustomerInfo, SubscriptionResult, WebhookEvent } from "./gateway";

type OpenPayPayload = Record<string, unknown>;

function normalizeChargeStatus(status: string | undefined): ChargeResult["status"] {
  if (status === "completed") return "completed";
  if (status === "failed" || status === "cancelled") return "failed";
  return "pending";
}

function normalizeSubscriptionStatus(status: string | undefined): SubscriptionResult["status"] {
  if (status === "active") return "active";
  if (status === "cancelled" || status === "failed") return "failed";
  if (status === "paused") return "paused";
  return "pending";
}

export class OpenPayGateway implements PaymentGateway {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(
    merchantId: string,
    privateKey: string,
    isProduction: boolean = false
  ) {
    this.baseUrl = `${isProduction ? "https://api.openpay.mx" : "https://sandbox-api.openpay.mx"}/v1/${merchantId}`;
    this.authHeader = `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`;
  }

  private async request<T>(method: string, resourcePath: string, body?: OpenPayPayload): Promise<T> {
    const response = await fetch(`${this.baseUrl}${resourcePath}`, {
      method,
      headers: {
        "Authorization": this.authHeader,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("OpenPay API Error:", payload);
      throw new Error(`OpenPay request failed with status ${response.status}`);
    }

    return payload as T;
  }

  async createCharge(amount: number, currency: string, options: ChargeOptions): Promise<ChargeResult> {
    const charge = await this.request<{ id: string; status?: string }>("POST", "/charges", {
      source_id: options.token,
      method: "card",
      amount,
      currency,
      description: options.description,
      order_id: options.externalReference,
      device_session_id: options.deviceId,
      customer: {
        email: options.email
      }
    });

    return {
      id: charge.id,
      status: normalizeChargeStatus(charge.status)
    };
  }

  async createSubscription(plan: SubscriptionPlan, customer: CustomerInfo, externalReference: string): Promise<SubscriptionResult> {
    const createdCustomer = await this.request<{ id: string }>("POST", "/customers", {
      name: customer.name || "Client",
      last_name: "Vishnu",
      email: customer.email,
      requires_account: false,
      external_id: externalReference
    });

    const subscription = await this.request<{ id: string; status?: string }>(
      "POST",
      `/customers/${createdCustomer.id}/subscriptions`,
      { plan_id: plan.id }
    );

    return {
      id: subscription.id,
      status: normalizeSubscriptionStatus(subscription.status),
      gatewayUrl: "openpay-integration-required"
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    console.log("Canceling OpenPay subscription:", subscriptionId);
  }

  async handleWebhook(req: any): Promise<WebhookEvent | null> {
    const body = req.body;
    if (!body || !body.type) return null;

    const type: "payment" | "subscription" = body.type.includes("subscription") ? "subscription" : "payment";

    return {
      gateway: "openpay",
      type,
      externalId: body.transaction_id || body.subscription?.id || body.id,
      externalReference: body.order_id || body.transaction?.order_id || body.subscription?.external_id,
      status: body.type,
      raw: body
    };
  }

  async getPaymentStatus(paymentId: string): Promise<any> {
    return this.request("GET", `/charges/${paymentId}`);
  }
}
