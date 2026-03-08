import { PaymentGateway, ChargeOptions, ChargeResult, SubscriptionPlan, CustomerInfo, SubscriptionResult, WebhookEvent } from "./gateway";
import { MercadoPagoConfig, Payment, PreApproval } from "mercadopago";

// Note: Ensure MERCADOPAGO_ACCESS_TOKEN is set in Firebase Secrets
export class MercadoPagoGateway implements PaymentGateway {
  private client: MercadoPagoConfig;

  constructor(accessToken: string) {
    this.client = new MercadoPagoConfig({ accessToken });
  }

  async createCharge(amount: number, currency: string, options: ChargeOptions): Promise<ChargeResult> {
    const payment = new Payment(this.client);
    
    // Minimal implementation for standard card payment
    const body = {
      transaction_amount: amount,
      description: options.description,
      payment_method_id: options.paymentMethodId || "visa",
      payer: {
        email: options.email,
      },
      token: options.token,
      external_reference: options.externalReference,
      installments: 1
    };

    try {
      const response = await payment.create({ body });
      return {
        id: response.id?.toString() || "",
        status: response.status === 'approved' ? 'completed' : (response.status === 'rejected' ? 'failed' : 'pending')
      };
    } catch (e: any) {
      console.error("MercadoPago Charge Error:", e);
      throw e;
    }
  }

  async createSubscription(plan: SubscriptionPlan, customer: CustomerInfo, externalReference: string): Promise<SubscriptionResult> {
    const preApproval = new PreApproval(this.client);
    
    const body = {
      reason: plan.name,
      external_reference: externalReference,
      payer_email: customer.email,
      auto_recurring: {
        frequency: 1,
        frequency_type: plan.interval === 'month' ? 'months' : 'years',
        transaction_amount: plan.price,
        currency_id: plan.currency,
      },
      back_url: "https://vishnu-dashboard.web.app/billing?gateway=mercadopago",
      status: "pending"
    };

    try {
      const response = await preApproval.create({ body });
      return {
        id: response.id || "",
        status: 'pending',
        gatewayUrl: response.init_point
      };
    } catch (e: any) {
      console.error("MercadoPago Subscription Error:", e);
      throw e;
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    const preApproval = new PreApproval(this.client);
    await preApproval.update({ id: subscriptionId, body: { status: "cancelled" } });
  }

  async handleWebhook(req: any): Promise<WebhookEvent | null> {
    const body = req.body;
    // Basic mapping from MercadoPago's Webhook (Data type can be "payment" or "subscription")
    if (!body || !body.type) return null;

    let type: "payment" | "subscription" = "payment";
    if (body.type === "subscription_preapproval") type = "subscription";

    return {
      gateway: "mercadopago",
      type,
      externalId: body.data?.id,
      status: body.action || "updated",
      raw: body
    };
  }

  async getPaymentStatus(paymentId: string): Promise<any> {
    const payment = new Payment(this.client);
    return payment.get({ id: paymentId });
  }
}
