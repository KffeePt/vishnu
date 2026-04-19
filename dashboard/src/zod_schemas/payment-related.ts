import { z } from 'zod';

export const PaymentSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('USD'),
});

export const MercadoPagoPaymentSchema = PaymentSchema.extend({
  token: z.string(),
  issuer_id: z.string(),
  payment_method_id: z.string(),
  transaction_amount: z.number().positive(),
  installments: z.number().int().positive(),
  payer: z.object({
    email: z.string().email(),
  }),
  saveCard: z.boolean().optional(),
});

export const PayPalPaymentSchema = PaymentSchema.extend({
  orderID: z.string(),
});

export const StripePaymentSchema = PaymentSchema.extend({
  paymentMethodId: z.string(),
});

export const OpenPayPaymentSchema = PaymentSchema.extend({
  token_id: z.string(),
  device_session_id: z.string(),
});

export const PaymentMethodSchema = z.enum(['mercado-pago', 'paypal', 'stripe', 'open-pay']);

export type Payment = z.infer<typeof PaymentSchema>;
export type MercadoPagoPayment = z.infer<typeof MercadoPagoPaymentSchema>;
export type PayPalPayment = z.infer<typeof PayPalPaymentSchema>;
export type StripePayment = z.infer<typeof StripePaymentSchema>;
export type OpenPayPayment = z.infer<typeof OpenPayPaymentSchema>;
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;