'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';

interface Transaction {
  id: string;
  amount: number;
  date: any;
  status: string;
  paymentMethod: string;
}

interface TransactionsTableProps {
  paymentMethod?: string;
}

export default function TransactionsTable({ paymentMethod }: TransactionsTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    const fetchTransactions = async () => {
      let transactionsQuery = query(collection(db, 'payments'));
      if (paymentMethod) {
        transactionsQuery = query(transactionsQuery, where('paymentMethod', '==', paymentMethod));
      }
      const transactionsSnapshot = await getDocs(transactionsQuery);
      const transactionsList = transactionsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Transaction[];
      setTransactions(transactionsList);
    };

    fetchTransactions();
  }, [paymentMethod]);

  return (
    <div>
      <h2 className="text-xl font-bold">{paymentMethod ? `${paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)} Transactions` : 'All Transactions'}</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Amount</th>
            <th>Date</th>
            <th>Status</th>
            <th>Payment Method</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td>{transaction.id}</td>
              <td>{transaction.amount}</td>
              <td>{transaction.date.toString()}</td>
              <td>{transaction.status}</td>
              <td>{transaction.paymentMethod}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}