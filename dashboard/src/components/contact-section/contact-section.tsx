'use client';
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import Link from "next/link"
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import { MapPin, Mailbox, Smartphone } from "lucide-react";
import { UserAuth } from '@/context/auth-context';
import { useState, useEffect } from 'react';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Skeleton } from "@/components/ui/skeleton";
import StarryBackground from "@/components/ui/starry-background/starry-background";
import LoadingSpinner from '@/components/loading-spinner';

interface ContactData {
  displayName?: string;
  email?: string;
  photoURL?: string;
  address?: string;
  phone?: string;
}

const ContactSection = () => {
  const { user } = UserAuth();
  const [loading, setLoading] = useState(true);
  const [loadingDeliveryInfo, setLoadingDeliveryInfo] = useState(true);
  const [formData, setFormData] = useState<Partial<ContactData>>({});
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchContactData = async () => {
      setLoadingDeliveryInfo(true);
      try {
        const docRef = doc(db, "contactInfo", "info");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as ContactData;
          setFormData(data);
          setProfileImageUrl(data.photoURL || null);
        }
      } catch (error) {
        console.error("Error fetching contact information:", error);
      } finally {
        setLoadingDeliveryInfo(false);
        setLoading(false);
      }
    };

    fetchContactData();
  }, []);

  return (
    <div className="relative w-full">
      <StarryBackground />
      <div className="flex flex-col w-full p-4 min-h-screen">
        {loading ? (
          <div className="flex flex-row items-center justify-center flex-1">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="flex flex-1">
            <main className="flex-1 p-4 sm:p-6 md:p-8">
              <div className="mx-auto max-w-3xl space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-4">
                        <div className="relative">
                          <Avatar className="h-16 w-16">
                            <AvatarImage
                              key={profileImageUrl}
                              src={profileImageUrl || "/placeholder-user.jpg"}
                              alt={formData.displayName || 'User'}
                            />
                            <AvatarFallback>
                              {formData.displayName
                                ? formData.displayName.substring(0, 2).toUpperCase()
                                : 'U'}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="grid gap-1">
                          <div className="text-lg font-semibold">
                            {formData.displayName || 'User Name'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formData.email || 'user@example.com'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingDeliveryInfo ? (
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                    ) : (
                      <div className="space-y-3 text-sm">
                        <p className="flex items-center group">
                          <span className="inline-block mr-2 group-hover:animate-jump-bounce">
                            <Mailbox size={18} className="text-primary" />
                          </span>
                          <strong>Email:</strong>&nbsp;{formData.email || 'Not specified'}
                        </p>
                        <p className="flex items-center group">
                          <span className="inline-block mr-2 group-hover:animate-jump-bounce">
                            <Smartphone size={18} className="text-primary" />
                          </span>
                          <strong>Phone Number:</strong>&nbsp;
                          {formData.phone || 'Not specified'}
                        </p>
                        <p className="flex items-center group">
                          <span className="inline-block mr-2 group-hover:animate-jump-bounce">
                            <MapPin size={18} className="text-primary" />
                          </span>
                          <strong>Address:</strong>&nbsp;
                          {formData.address || 'Not specified'}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactSection;