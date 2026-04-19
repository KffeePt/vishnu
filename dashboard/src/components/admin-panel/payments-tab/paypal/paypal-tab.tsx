import React from 'react';
import TransactionsTable from '../transactions-table';

const PaypalTab = () => {
  return (
    <div>
      <h2 className="text-xl font-bold">PayPal Transactions</h2>
      <TransactionsTable paymentMethod="paypal" />
    </div>
  );
};

export default PaypalTab;