"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react';

export default function MercadoPagoTab() {
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState('');
  const [cardId, setCardId] = useState('');
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleApiCall = async (apiCall: () => Promise<any>) => {
    setIsLoading(true);
    setResponse(null);
    setCards([]);
    try {
      const result = await apiCall();
      setResponse(result);
      toast({
        title: 'Success',
        description: 'API call completed successfully.',
      });
    } catch (error: any) {
      const errorResponse = await error.response?.json();
      setResponse(errorResponse || { error: error.message });
      toast({
        title: 'Error',
        description: errorResponse?.error || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      setUsers(data.users);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  useEffect(() => {
    fetchUsers();
    if (process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY) {
      initMercadoPago(process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY);
    }
  }, []);

  const createCustomer = () => handleApiCall(async () => {
    const res = await fetch(`/api/payment-system/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw { response: res };
    const newCustomer = await res.json();
    setCustomerId(newCustomer.id);
    return newCustomer;
  });

  const getCards = () => handleApiCall(async () => {
    const res = await fetch(`/api/payment-system/customers/${customerId}/cards`);
    if (!res.ok) throw { response: res };
    const fetchedCards = await res.json();
    if (Array.isArray(fetchedCards.results)) {
      setCards(fetchedCards.results);
    } else if (Array.isArray(fetchedCards)) { // Handle cases where the API returns an array directly
      setCards(fetchedCards);
    } else {
      setCards([]);
    }
    return fetchedCards;
  });

  const getCard = () => handleApiCall(async () => {
    const res = await fetch(`/api/payment-system/customers/${customerId}/cards/${cardId}`);
    if (!res.ok) throw { response: res };
    return res.json();
  });

  const updateCard = () => handleApiCall(async () => {
    const res = await fetch(`/api/payment-system/customers/${customerId}/cards/${cardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) throw { response: res };
    return res.json();
  });

  const deleteCard = () => handleApiCall(async () => {
    const res = await fetch(`/api/payment-system/customers/${customerId}/cards/${cardId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw { response: res };
    return res.json();
  });

  const handlePaymentBrickSubmit = async (formData: any) => {
    handleApiCall(() => createCardWithBrick(formData));
  };

  const createCardWithBrick = async (formData: any) => {
    const res = await fetch(`/api/payment-system/customers/${customerId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: formData.token }),
    });
    if (!res.ok) throw { response: res };
    return res.json();
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6">Mercado Pago Card Management Tester</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Input
          placeholder="Customer ID"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="md:col-span-2"
        />
        <Input
          placeholder="Card ID (for single card operations)"
          value={cardId}
          onChange={(e) => setCardId(e.target.value)}
          className="md:col-span-1"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>1. Select or Create Customer</CardTitle></CardHeader>
            <CardContent className="flex flex-col space-y-4">
              <select
                value={customerId}
                onChange={(e) => {
                  const selectedUser = users.find(user => user.uid === e.target.value);
                  if (selectedUser) {
                    setCustomerId(selectedUser.uid);
                    setEmail(selectedUser.email);
                  }
                }}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select a User</option>
                {users.map(user => (
                  <option key={user.uid} value={user.uid}>
                    {user.displayName || user.email}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Or enter new Customer Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button onClick={createCustomer} disabled={isLoading || !email}>
                {isLoading ? 'Loading...' : 'Create Customer'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>2. Add New Card</CardTitle></CardHeader>
            <CardContent>
              {customerId ? (
                <CardPayment
                  initialization={{ amount: 100 }}
                  onSubmit={handlePaymentBrickSubmit}
                />
              ) : (
                <p>Please create a customer first to add a card.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3. Get All Cards</CardTitle></CardHeader>
            <CardContent>
              <Button onClick={getCards} disabled={isLoading || !customerId}>
                {isLoading ? 'Loading...' : 'Fetch All Cards'}
              </Button>
              {cards.length > 0 && (
                <div className="mt-4 space-y-2">
                  {cards.map((card) => (
                    <div key={card.id} className="p-2 border rounded-md">
                      <p className="font-semibold">{card.payment_method.name} **** {card.last_four_digits}</p>
                      <p className="text-sm text-gray-500">Expires: {card.expiration_month}/{card.expiration_year}</p>
                      <p className="text-sm text-gray-500">Card ID: {card.id}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>4. Get Single Card</CardTitle></CardHeader>
            <CardContent>
              <Button onClick={getCard} disabled={isLoading || !customerId || !cardId}>
                {isLoading ? 'Loading...' : 'Fetch Card by ID'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>5. Update Card</CardTitle></CardHeader>
            <CardContent>
              <Button onClick={updateCard} disabled={isLoading || !customerId || !cardId || !token}>
                {isLoading ? 'Loading...' : 'Update Card by ID'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>6. Delete Card</CardTitle></CardHeader>
            <CardContent>
              <Button onClick={deleteCard} disabled={isLoading || !customerId || !cardId} variant="destructive">
                {isLoading ? 'Loading...' : 'Delete Card by ID'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>API Response</CardTitle></CardHeader>
          <CardContent>
            <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-auto h-96">
              {isLoading ? 'Loading...' : JSON.stringify(response, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}