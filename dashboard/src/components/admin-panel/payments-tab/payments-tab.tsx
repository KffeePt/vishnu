"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const PaymentsTab: React.FC = () => {
  // Placeholder data for payment systems
  const paymentSystems = [
    { id: 'mercado-pago', name: 'Mercado Pago', enabled: true },
    { id: 'paypal', name: 'PayPal', enabled: false },
    { id: 'stripe', name: 'Stripe', enabled: true },
    { id: 'open-pay', name: 'OpenPay by BBVA', enabled: false },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment System Management</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {paymentSystems.map((system) => (
            <div key={system.id} className="flex items-center justify-between p-2 border rounded-md">
              <span>{system.name}</span>
              <Button variant={system.enabled ? 'secondary' : 'default'}>
                {system.enabled ? 'Disable' : 'Enable'}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default PaymentsTab;