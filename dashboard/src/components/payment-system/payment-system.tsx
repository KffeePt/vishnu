"use client";

import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MercadoPagoPaymentBrick from './mercado-pago/mercado-pago-payment-brick';
import PaypalPayment from './paypal/paypal-payment';
import StripePayment from './stripe/stripe-payment';
import OpenPayPayment from './open-pay/open-pay-payment';

type PaymentMethod = 'mercado-pago' | 'paypal' | 'stripe' | 'open-pay';

interface PaymentSystemProps {
  amount: number;
  onPaymentSuccess: (payment: any) => void;
  onPaymentError: (error: any) => void;
}

const PaymentSystem: React.FC<PaymentSystemProps> = ({
  amount,
  onPaymentSuccess,
  onPaymentError,
}) => {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('mercado-pago');

  const renderPaymentMethod = () => {
    switch (selectedPaymentMethod) {
      case 'mercado-pago':
        return (
          <MercadoPagoPaymentBrick
            amount={amount}
            onPaymentSuccess={onPaymentSuccess}
            onPaymentError={onPaymentError}
          />
        );
      case 'paypal':
        return <PaypalPayment />;
      case 'stripe':
        return <StripePayment />;
      case 'open-pay':
        return <OpenPayPayment />;
      default:
        return <div>Select a payment method</div>;
    }
  };

  return (
    <div>
      <Select onValueChange={(value) => setSelectedPaymentMethod(value as PaymentMethod)} defaultValue={selectedPaymentMethod}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select a payment method" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mercado-pago">Mercado Pago</SelectItem>
          <SelectItem value="paypal">PayPal</SelectItem>
          <SelectItem value="stripe">Stripe</SelectItem>
          <SelectItem value="open-pay">OpenPay by BBVA</SelectItem>
        </SelectContent>
      </Select>

      <div className="mt-4">
        {renderPaymentMethod()}
      </div>
    </div>
  );
};

export default PaymentSystem;