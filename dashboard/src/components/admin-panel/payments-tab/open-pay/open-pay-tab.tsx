import React from 'react';
import TransactionsTable from '../transactions-table';

const OpenPayTab = () => {
  return (
    <div>
      <h2 className="text-xl font-bold">OpenPay Transactions</h2>
      <TransactionsTable paymentMethod="open-pay" />
    </div>
  );
};

export default OpenPayTab;