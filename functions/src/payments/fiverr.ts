import { PaymentGateway, ChargeOptions, ChargeResult, SubscriptionPlan, CustomerInfo, SubscriptionResult, WebhookEvent } from "./gateway";

export class FiverrGateway implements PaymentGateway {
  private gigUrl: string;

  constructor(gigUrl: string) {
    this.gigUrl = gigUrl; // e.g., "https://www.fiverr.com/..."
  }

  async createCharge(amount: number, currency: string, options: ChargeOptions): Promise<ChargeResult> {
    // Generate a checkout redirect URL with tracking parameters
    const redirectUrl = new URL(this.gigUrl);
    redirectUrl.searchParams.append("ref", options.externalReference);
    redirectUrl.searchParams.append("context", "vishnu_portal");
    
    return {
      id: "fiverr_redirect",
      status: 'pending',
      redirectUrl: redirectUrl.toString()
    };
  }

  async createSubscription(plan: SubscriptionPlan, customer: CustomerInfo, externalReference: string): Promise<SubscriptionResult> {
    // Fiverr does not support Direct API subscription creation
    throw new Error("Fiverr does not support programmatic subscriptions via API.");
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    throw new Error("Fiverr does not support programmatic cancellation.");
  }

  async handleWebhook(req: any): Promise<WebhookEvent | null> {
    // If we use an email scraper or Zapier integration for Fiverr completed orders:
    const body = req.body;
    if (body?.source === 'fiverr_automation') {
       return {
         gateway: "fiverr",
         type: "payment",
         externalId: body.order_id,
         status: body.status, // "completed"
         externalReference: body.ref,
         raw: body
       };
    }
    return null;
  }

  async getPaymentStatus(paymentId: string): Promise<any> {
    return { status: "unknown_in_fiverr" };
  }
}
