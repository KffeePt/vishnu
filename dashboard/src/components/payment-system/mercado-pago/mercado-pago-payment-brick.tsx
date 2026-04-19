"use client";

import React, { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

// This is a mock of the MercadoPago type.
// In a real application, you would use the official Mercado Pago SDK types.
declare const MercadoPago: any;

interface MercadoPagoPaymentBrickProps {
  amount: number;
  onPaymentReady?: () => void;
  onPaymentSuccess: (payment: any) => void;
  onPaymentError: (error: any) => void;
}

const MercadoPagoPaymentBrick: React.FC<MercadoPagoPaymentBrickProps> = ({
  amount,
  onPaymentReady,
  onPaymentSuccess,
  onPaymentError,
}) => {
  const [saveCard, setSaveCard] = useState(false);

  useEffect(() => {
    // The Mercado Pago SDK must be loaded for this to work.
    // This is usually done in the main layout of the application.
    if (typeof MercadoPago === 'undefined') {
      console.error('MercadoPago SDK not loaded.');
      return;
    }

    const mp = new MercadoPago(process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY);

    const bricksBuilder = mp.bricks();

    const renderPaymentBrick = async () => {
      // Check if a brick is already rendered
      if (document.getElementById('paymentBrick_container')?.innerHTML) {
        return;
      }

      await bricksBuilder.create('payment', 'paymentBrick_container', {
        initialization: {
          amount: amount,
          payer: {
            email: 'test_user_123456@testuser.com', // This should be the actual user's email
          },
        },
        customization: {
          paymentMethods: {
            creditCard: 'all',
            debitCard: 'all',
            ticket: 'all',
            bankTransfer: 'all',
            mercadoPago: 'all',
          },
        },
        callbacks: {
          onReady: () => {
            if (onPaymentReady) {
              onPaymentReady();
            }
          },
          onSubmit: async (cardFormData: any) => {
            // This is where you would send the payment data to your backend
            // to create the payment with Mercado Pago's API.
            // The backend would then return the payment result.
            console.log('Payment submitted', cardFormData);
            try {
                const response = await fetch('/api/payment-system/process-payment', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        paymentMethod: 'mercado-pago',
                        paymentDetails: { ...cardFormData, saveCard },
                    }),
                });

                const paymentResult = await response.json();

                if (!response.ok) {
                    throw paymentResult;
                }
                
                onPaymentSuccess(paymentResult);
            } catch (error) {
                onPaymentError(error);
            }
          },
          onError: (error: any) => {
            onPaymentError(error);
          },
        },
      });
    };

    renderPaymentBrick();

    // Cleanup function to destroy the brick instance
    return () => {
        // This is a simplified cleanup. A real implementation might need more.
        const container = document.getElementById('paymentBrick_container');
        if (container) {
            container.innerHTML = '';
        }
    };
  }, [amount, onPaymentReady, onPaymentSuccess, onPaymentError, saveCard]);

  return (
    <div>
      <div id="paymentBrick_container"></div>
      <div className="flex items-center space-x-2 mt-4">
        <Switch id="save-card" checked={saveCard} onCheckedChange={setSaveCard} />
        <Label htmlFor="save-card">Save card for future payments</Label>
      </div>
    </div>
  );
};

export default MercadoPagoPaymentBrick;