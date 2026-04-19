import React from 'react';
import TransactionsTable from '../transactions-table';

const StripeTab = () => {
  return (
    <div>
      <h2 className="text-xl font-bold">Stripe Transactions</h2>
      <TransactionsTable paymentMethod="stripe" />
    </div>
  );
};

export default StripeTab;