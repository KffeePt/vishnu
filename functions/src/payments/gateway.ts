export interface ChargeOptions {
  description: string;
  email?: string;
  paymentMethodId?: string;
  token?: string; // card token for OpenPay/MP
  deviceId?: string; // fraud detection
  externalReference: string; // ties back to our Firestore ID
}

export interface ChargeResult {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  redirectUrl?: string; // e.g., Fiverr URL
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
}

export interface CustomerInfo {
  email: string;
  name?: string;
}

export interface SubscriptionResult {
  id: string;
  status: 'active' | 'pending' | 'failed' | 'paused';
  gatewayUrl?: string; // Where user goes to auth/pay
}

export interface WebhookEvent {
  gateway: 'mercadopago' | 'openpay' | 'fiverr';
  type: 'payment' | 'subscription';
  externalId: string;
  status: string;
  externalReference?: string;
  raw: any;
}

export interface PaymentGateway {
  createCharge(amount: number, currency: string, options: ChargeOptions): Promise<ChargeResult>;
  createSubscription(plan: SubscriptionPlan, customer: CustomerInfo, externalReference: string): Promise<SubscriptionResult>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  handleWebhook(req: any): Promise<WebhookEvent | null>;
  getPaymentStatus(paymentId: string): Promise<any>;
}
