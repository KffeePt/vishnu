"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
// Import Select components
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Phone, MapPin, Mail, CalendarDays, TagIcon, PlusCircle, ChevronDown, ChevronUp, UserCheck, History, Edit, Trash2, DollarSign } from 'lucide-react';
import { db } from '@/config/firebase';
import { doc, setDoc, arrayUnion, Timestamp, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { ROLES } from '@/config/roles';
import { useToast } from "@/hooks/use-toast";


type UserRole = 'user' | 'manager' | 'admin' | 'chef' | 'repartidor' | 'doctor' | 'patient';
type UserStatus = 'active' | 'inactive' | 'pending' | 'suspended';

interface UserActivity {
  action: string;
  date: string;
  description: string;
}

// Interface for Location (coordinates)
interface LocationCoords {
  latitude: number | null;
  longitude: number | null;
}

// Membership related interfaces
interface UserMembership {
  planId: string; // e.g., 'basic_monthly', 'premium_yearly'
  planName: string;
  status: 'active' | 'inactive' | 'pending' | 'suspended' | 'cancelled'; // Consistent with SubscriptionManager
  startDate: Timestamp;
  endDate?: Timestamp; // For fixed-term or if cancelled
  nextBillingDate?: Timestamp;
  autoRenew: boolean;
  mpSubscriptionId?: string; // Mercado Pago Subscription ID
}

interface MembershipPayment {
  id: string; // Payment ID (e.g., from Mercado Pago)
  date: Timestamp;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  method?: string; // e.g., 'card', 'mp_balance'
  description?: string; // e.g., "Renovación Plan Premium"
}

interface User {
  id: string;
  name: string;
  email: string | null;
  avatar?: string | null;
  role: UserRole;
  status: UserStatus;
  phone?: string | null;
  location?: string | null; // Textual address
  coordinates?: LocationCoords | null; // Coordinates
  deliveryAddress?: string | null; // User's saved delivery address
  joinDate: string;
  bio?: string | null;
  activity?: UserActivity[];
  membership?: UserMembership | null; // User's current or last membership
  membershipPayments?: MembershipPayment[]; // History of membership payments
  assignedRestaurantId?: string | null; // New field for restaurant assignment
  // Include other fields if necessary
}

// Interface for Promo Codes (could be shared)
interface UserPromoCode {
  id: string;
  code: string;
  discount: string;
  description: string;
  expiryDate: string; // Consider Timestamp for Firestore for easier querying
  category: string;
  minimumPurchase?: string;
  status: 'available' | 'active' | 'used' | 'expired';
  assignedAt: Timestamp;
}

interface UserDetailsProps {
  user: User | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onUserUpdate: (updatedUser: User) => Promise<void>; // Callback to handle the actual update API call
  getRoleIcon: (role: UserRole) => React.ReactNode; // Pass helper from parent
  getStatusBadge: (status: UserStatus) => React.ReactNode; // Pass helper from parent
  onDeleteRequest: (userId: string) => void; // Prop to request deletion from parent
}

export default function UserDetails({
  user,
  isOpen,
  onOpenChange,
  onUserUpdate,
  getRoleIcon,
  getStatusBadge,
  onDeleteRequest // Destructure the new prop
}: UserDetailsProps) {
  const { toast } = useToast();
  const [editedUser, setEditedUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false); // State for submission loading
  const [newPromoCodeFields, setNewPromoCodeFields] = useState({
    code: "",
    discount: "",
    description: "",
    expiryDate: "",
    category: "",
    minimumPurchase: "",
  });
  const [isAddingPromo, setIsAddingPromo] = useState(false);
  const [isPromoSectionOpen, setIsPromoSectionOpen] = useState(false);

  // State for Membership Management
  const [editedMembership, setEditedMembership] = useState<UserMembership | null | undefined>(undefined);
  // const [isEditingMembership, setIsEditingMembership] = useState(false); // Can be used later if a separate edit mode for membership is needed
  const [availablePlansForAdmin] = useState([ // Made it a const as it's not changing
    { id: 'none', name: 'Sin Membresía' },
    { id: 'basic_monthly', name: 'Básico Mensual' },
    { id: 'premium_monthly', name: 'Premium Mensual' },
    { id: 'premium_yearly', name: 'Premium Anual' },
  ]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('none');
  const [membershipStatus, setMembershipStatus] = useState<UserMembership['status']>('inactive');
  const [autoRenewMembership, setAutoRenewMembership] = useState(true);

  // Initialize or update editedUser and membership form based on user prop and dialog state
  useEffect(() => {
    if (isOpen && user) {
      // Initialize from prop first for quick display
      // Determine initial coordinates, prioritizing user.location if it's a coordinate object,
      // then user.coordinates.
      let determinedInitialCoordinates: LocationCoords = { latitude: null, longitude: null };
      if (user.location &&
        typeof (user.location as any).latitude === 'number' &&
        typeof (user.location as any).longitude === 'number') {
        determinedInitialCoordinates = {
          latitude: (user.location as any).latitude,
          longitude: (user.location as any).longitude
        };
      } else if (user.coordinates) {
        determinedInitialCoordinates = {
          latitude: user.coordinates.latitude ?? null,
          longitude: user.coordinates.longitude ?? null,
        };
      }

      // Determine textual location for the "Dirección" input field
      // Prioritize deliveryAddress, then location (if string), then empty.
      const textualLocationInput = user.deliveryAddress ||
        (typeof user.location === 'string' ? user.location : null) ||
        '';

      setEditedUser({
        ...user,
        name: user.name || '',
        email: user.email || null,
        phone: user.phone || '',
        location: textualLocationInput, // Use derived textual location
        bio: user.bio || '',
        coordinates: determinedInitialCoordinates, // Use determined coordinates
        deliveryAddress: user.deliveryAddress || null,
        membership: user.membership || null,
        membershipPayments: user.membershipPayments || [],
        activity: user.activity || [],
        assignedRestaurantId: user.assignedRestaurantId || null, // Initialize new field
      });
      setEditedMembership(user.membership || null);
      setSelectedPlanId(user.membership?.planId || 'none');
      setMembershipStatus(user.membership?.status || 'inactive');
      setAutoRenewMembership(user.membership?.autoRenew !== undefined ? user.membership.autoRenew : true);
    } else if (!isOpen) {
      setEditedUser(null);
      setEditedMembership(undefined);
      setSelectedPlanId('none');
      setMembershipStatus('inactive');
      setAutoRenewMembership(true);
      setIsPromoSectionOpen(false);
    }
  }, [user, isOpen]); // Initialize based on prop

  // Effect for real-time updates using onSnapshot
  useEffect(() => {
    if (isOpen && user?.id) {
      const userDocRef = doc(db, 'userProfiles', user.id);
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const firestoreUser = docSnap.data();
          // Map Firestore data to the User interface structure
          // This mapping should align with how UserManager maps data if it fetches from an API
          // that combines Auth and Firestore. Here, we assume 'users' collection has all necessary fields.
          const liveCoordinates = (firestoreUser.location && typeof firestoreUser.location.latitude === 'number' && typeof firestoreUser.location.longitude === 'number')
            ? { latitude: firestoreUser.location.latitude, longitude: firestoreUser.location.longitude }
            : (firestoreUser.coordinates && typeof firestoreUser.coordinates.latitude === 'number' && typeof firestoreUser.coordinates.longitude === 'number')
              ? { latitude: firestoreUser.coordinates.latitude, longitude: firestoreUser.coordinates.longitude }
              : null;

          setEditedUser(prevEditedUser => ({
            // Preserve existing ID and potentially other fields not directly from 'users' collection snapshot if needed
            // For now, assume 'users' collection is the source of truth for editable fields.
            ...(prevEditedUser || {}), // Spread previous state to keep non-Firestore fields if any
            id: docSnap.id,
            name: firestoreUser.displayName || firestoreUser.name || '',
            email: firestoreUser.email || null,
            avatar: firestoreUser.photoUrl || firestoreUser.avatar || null,
            role: firestoreUser.role || 'user', // Assuming role is stored directly
            status: firestoreUser.status || 'active', // Assuming status is stored directly
            phone: firestoreUser.mobileNumber || firestoreUser.phone || '',
            location: firestoreUser.deliveryAddress || (typeof firestoreUser.location === 'string' ? firestoreUser.location : null) || '', // For the form input
            deliveryAddress: firestoreUser.deliveryAddress || null,
            coordinates: liveCoordinates,
            bio: firestoreUser.bio || '',
            assignedRestaurantId: firestoreUser.assignedRestaurantId || null, // Update from Firestore
            // Assuming joinDate, activity, membership, membershipPayments are handled or not directly editable here
            // or are part of the initial 'user' prop and don't need live updates from this specific snapshot.
            // If membership is in the 'users' doc, update it:
            membership: firestoreUser.membership || null,
            membershipPayments: firestoreUser.membershipPayments || [],
            activity: firestoreUser.activity || [],
            joinDate: prevEditedUser?.joinDate || user.joinDate, // Keep original join date from prop
          }));

          // Update membership specific states if membership data is in the user document
          if (firestoreUser.membership) {
            setEditedMembership(firestoreUser.membership);
            setSelectedPlanId(firestoreUser.membership.planId || 'none');
            setMembershipStatus(firestoreUser.membership.status || 'inactive');
            setAutoRenewMembership(firestoreUser.membership.autoRenew !== undefined ? firestoreUser.membership.autoRenew : true);
          } else {
            // If membership is removed from Firestore, reset these states
            setEditedMembership(null);
            setSelectedPlanId('none');
            setMembershipStatus('inactive');
            setAutoRenewMembership(true);
          }

        } else {
          console.log("No such user document for real-time updates!");
          // Optionally handle the case where the document doesn't exist (e.g., user deleted)
          // setEditedUser(null); // Or keep the prop data
        }
      }, (error) => {
        console.error("Error listening to user document:", error);
        // Optionally show a toast or error message
      });

      // Cleanup listener on component unmount or when dependencies change
      return () => unsubscribe();
    }
  }, [isOpen, user?.id, user?.joinDate]); // Rerun if dialog opens or user ID/joinDate changes

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!editedUser) return;
    const { name, value } = e.target;
    const type = (e.target as HTMLInputElement).type; // Get type for number handling

    if (name.startsWith("coordinates.")) {
      const key = name.split(".")[1] as keyof LocationCoords; // 'latitude' or 'longitude'
      setEditedUser(prev => {
        if (!prev) return null;
        // prev.coordinates is initialized as an object in useEffect
        const currentCoordinates = prev.coordinates!;
        const numValue = parseFloat(value);
        return {
          ...prev,
          coordinates: {
            ...currentCoordinates,
            [key]: value === "" ? null : (Number.isNaN(numValue) ? null : numValue)
          }
        };
      });
    } else {
      setEditedUser(prev => prev ? { ...prev, [name]: value } : null);
    }
  };

  const handleSelectChange = (name: keyof User, value: string) => {
    if (!editedUser) return;
    // Ensure type safety for role and status
    if (name === 'role') {
      setEditedUser(prev => prev ? { ...prev, role: value as UserRole } : null);
    } else if (name === 'status') {
      setEditedUser(prev => prev ? { ...prev, status: value as UserStatus } : null);
    } else {
      setEditedUser(prev => prev ? { ...prev, [name]: value } : null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editedUser) return;

    setIsSubmitting(true);
    try {
      // Prepare the payload for update, addressing the Firestore field mapping issue.
      // As per feedback:
      // - Firestore 'location' field should be updated with the lat/lon object.
      // - Firestore 'deliveryAddress' field is currently being overwritten with the lat/lon object.
      // This implies the update mechanism might be taking 'payload.coordinates' and writing it to Firestore's 'deliveryAddress',
      // and 'payload.location' to Firestore's 'location'.

      // To achieve the desired Firestore state:
      // Firestore.location = {lat,lon} (from editedUser.coordinates)
      // Firestore.deliveryAddress = "textual address" (from editedUser.location, which is the "Dirección" input)
      const updatePayload = {
        ...editedUser,
        location: editedUser.coordinates, // Assign the coordinate object to 'location' for Firestore.
        coordinates: editedUser.location as any, // Assign textual address to 'coordinates' to ensure it goes to Firestore's deliveryAddress via the current path.
        deliveryAddress: editedUser.location, // Explicitly set deliveryAddress to the textual address as well.
      };

      // The 'as any' for 'coordinates' above is because editedUser.location is string,
      // but User.coordinates is LocationCoords | null. We are intentionally sending a string here
      // to be mapped to Firestore's deliveryAddress.
      // The 'location' field in updatePayload is now an object, which also differs from User.location (string).
      // Thus, the overall updatePayload might not strictly match the 'User' type.
      await onUserUpdate(updatePayload as any); // Call the parent's update handler with the modified payload.
      // Parent handler should close the dialog on success if needed
    } catch (error) {
      console.error("Error submitting user update:", error);
      // Optionally show an error message within the dialog
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromoInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewPromoCodeFields(prev => ({ ...prev, [name]: value }));
  };


  const handleAddNewPromoCode = async () => {
    if (!user || !newPromoCodeFields.code || !newPromoCodeFields.discount || !newPromoCodeFields.expiryDate) {
      toast({ title: "Campos Incompletos", description: "Por favor, complete los campos obligatorios del código promocional.", variant: "destructive" });
      return;
    }
    setIsAddingPromo(true);
    try {
      const promoToAdd: UserPromoCode = {
        id: uuidv4(),
        ...newPromoCodeFields,
        status: 'available',
        assignedAt: Timestamp.now(),
      };

      const userDocRef = doc(db, 'userProfiles', user.id);
      await updateDoc(userDocRef, {
        promoCodes: arrayUnion(promoToAdd)
      });

      toast({ title: "Éxito", description: "Código promocional agregado exitosamente." });
      setNewPromoCodeFields({
        code: "",
        discount: "",
        description: "",
        expiryDate: "",
        category: "",
        minimumPurchase: "",
      });
    } catch (error) {
      console.error("Error adding promo code:", error);
      toast({ title: "Error", description: "Error al agregar el código promocional.", variant: "destructive" });
    } finally {
      setIsAddingPromo(false);
    }
  };

  const handleUpdateMembership = async () => {
    if (!editedUser || !user) {
      toast({ title: "Error", description: "Usuario no encontrado.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    console.log(`Admin: Updating membership for user ${user.id}. Plan: ${selectedPlanId}, Status: ${membershipStatus}, AutoRenew: ${autoRenewMembership}`);

    let newMembershipData: UserMembership | null = null;
    if (selectedPlanId !== 'none') {
      const planDetails = availablePlansForAdmin.find(p => p.id === selectedPlanId);
      newMembershipData = {
        planId: selectedPlanId,
        planName: planDetails?.name || 'Plan Desconocido',
        status: membershipStatus,
        startDate: editedUser.membership?.startDate || Timestamp.now(),
        autoRenew: autoRenewMembership,
        nextBillingDate: (membershipStatus === 'active' && autoRenewMembership) ? Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) : undefined,
      };
    }

    try {
      const userDocRef = doc(db, 'userProfiles', user.id);
      await updateDoc(userDocRef, {
        membership: newMembershipData
      });

      setEditedUser(prev => prev ? { ...prev, membership: newMembershipData } : null);
      setEditedMembership(newMembershipData);

      toast({ title: "Actualización Exitosa", description: "La membresía ha sido actualizada." });
    } catch (error) {
      console.error("Error updating membership (simulated):", error);
      toast({ title: "Error", description: "Error al actualizar la membresía.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!user || !user.id) {
      console.error("UserDetailsAdmin: User or user ID is missing, cannot initiate delete.");
      return;
    }
    try {
      await onDeleteRequest(user.id);
      onOpenChange(false);
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({ title: "Error de Eliminación", description: "No se pudo eliminar el usuario.", variant: "destructive" });
    }
  };


  if (!user) {
    return null; // Don't render anything if there's no user
  }

  return (
    <div className=''>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="flex flex-col sm:max-w-3xl min-h-[60%] rounded-lg">{/* Reduced max-width */}
          <DialogHeader>
            <DialogTitle>Detalles del Usuario</DialogTitle>
            <DialogDescription>Ver y administrar la información del usuario.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="details" className="mt-4 flex-grow flex flex-col">
            <TabsList className="grid w-full grid-cols-4 mb-0"> {/* Added 4th tab */}
              <TabsTrigger value="details">Detalles</TabsTrigger>
              <TabsTrigger value="activity">Actividad</TabsTrigger>
              <TabsTrigger value="membership">Membresía</TabsTrigger> {/* New Tab */}
              <TabsTrigger value="edit">Editar Usuario</TabsTrigger>
            </TabsList>
            {/* Details Tab */}
            <TabsContent value="details" className="flex flex-col space-y-4 py-4 items-center">
              <div className="flex items-center space-x-4">
                <Avatar className="h-16 w-16"> {/* Reduced avatar size */}
                  <AvatarImage src={user.avatar || "/placeholder.svg"} alt={user.name || 'Avatar de Usuario'} />
                  <AvatarFallback className="text-lg">
                    {user.name ? user.name.substring(0, 2).toUpperCase() : '??'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-bold">{user.name || 'N/D'}</h3> {/* Reduced name font size */}
                  <p className="text-sm text-muted-foreground">{user.email || 'Sin email'}</p>
                  <div className="flex items-center mt-1 space-x-2">
                    {getStatusBadge(user.status)} {/* Status badge already uses status value */}
                    <Badge variant="outline" className="capitalize flex items-center">
                      {getRoleIcon(user.role)} {user.role === 'repartidor' ? 'Repartidor' : user.role} {/* Capitalize and handle 'repartidor' */}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 py-3"> {/* Reduced padding and gap */}
                {/* Changed to single column layout for better spacing */}
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center space-x-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.phone || "Sin número de teléfono"}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {user.deliveryAddress ||
                        (user.location && typeof (user.location as any).latitude === 'number' && typeof (user.location as any).longitude === 'number'
                          ? `Lat: ${(user.location as any).latitude.toFixed(4)}, Lng: ${(user.location as any).longitude.toFixed(4)}`
                          : (typeof user.location === 'string' ? user.location : "Sin ubicación"))
                      }
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {/* Added word break for long emails */}
                    <span className="text-sm break-words">{user.email || 'Sin email'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Se unió el {user.joinDate}</span>
                  </div>
                </div>

                {user.bio && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">Biografía</h4>
                    <p className="text-sm text-muted-foreground">{user.bio}</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="flex flex-col space-y-4 pb-4 pt-0 mt-0 items-center">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Actividad Reciente</h3>
                {/* TODO: Obtener y mostrar la actividad real del usuario */}
                {user.activity && user.activity.length > 0 ? (
                  <div className="space-y-4 max-h-60 overflow-y-auto pr-2">
                    {user.activity.map((item, index) => (
                      <div key={index} className="flex flex-col space-y-1 pb-4 border-b last:border-b-0">
                        <div className="flex justify-between">
                          <span className="font-medium text-sm">{item.action}</span> {/* Mantener acción como está */}
                          <span className="text-xs text-muted-foreground">{item.date}</span> {/* Mantener fecha como está */}
                        </div>
                        <p className="text-sm text-muted-foreground">{item.description}</p> {/* Mantener descripción como está */}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay actividad reciente registrada.</p>
                )}
              </div>
            </TabsContent>

            {/* Edit Tab */}
            <TabsContent value="edit" className="mt-0 pt-0 overflow-y-auto max-h-[60vh]">
              {editedUser && (
                <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto p-1">
                  {/* Form Fields */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name">Nombre</Label>
                      <Input id="name" name="name" value={editedUser.name || ""} onChange={handleInputChange} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label> {/* Email es universal */}
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={editedUser.email || ""}
                        onChange={handleInputChange}
                        disabled
                        aria-disabled="true"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="phone">Teléfono</Label>
                      <Input id="phone" name="phone" value={editedUser.phone || ""} onChange={handleInputChange} placeholder="Ej., 555-123-4567" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="location">Dirección</Label>
                      <Input
                        id="location"
                        name="location"
                        value={editedUser.location || ""}
                        onChange={handleInputChange}
                        placeholder="Ej., Ciudad, País"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="assignedRestaurantId">ID de Restaurante Asignado</Label>
                      <Input
                        id="assignedRestaurantId"
                        name="assignedRestaurantId"
                        value={editedUser.assignedRestaurantId || ""}
                        onChange={handleInputChange}
                        placeholder="Ej., restaurant_abc_123"
                      />
                    </div>
                  </div>

                  {/* Latitude and Longitude fields */}
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="grid gap-2">
                      <Label htmlFor="latitude">Latitud</Label>
                      <Input
                        id="latitude"
                        name="coordinates.latitude"
                        type="number"
                        value={editedUser.coordinates?.latitude ?? ""}
                        onChange={handleInputChange}
                        placeholder="Ej., 19.4326"
                        step="any" // Allows decimal numbers
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="longitude">Longitud</Label>
                      <Input
                        id="longitude"
                        name="coordinates.longitude"
                        type="number"
                        value={editedUser.coordinates?.longitude ?? ""}
                        onChange={handleInputChange}
                        placeholder="Ej., -99.1332"
                        step="any" // Allows decimal numbers
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="bio">Biografía</Label>
                    <Textarea
                      id="bio"
                      name="bio"
                      value={editedUser.bio || ""}
                      onChange={handleInputChange}
                      rows={3}
                      placeholder="Una breve biografía sobre el usuario..."
                    />
                  </div>

                  {/* Reverted to two columns for Role/Status and using Select dropdowns */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="role-select">Rol</Label>
                      <Select
                        value={editedUser.role}
                        onValueChange={(value) => handleSelectChange("role", value)}
                      >
                        <SelectTrigger id="role-select">
                          <SelectValue placeholder="Seleccionar rol..." />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(ROLES).map((role) => (
                            <SelectItem key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="status-select">Estado</Label>
                      <Select
                        value={editedUser.status}
                        onValueChange={(value) => handleSelectChange("status", value)}
                      >
                        <SelectTrigger id="status-select">
                          <SelectValue placeholder="Seleccionar estado..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Activo</SelectItem>
                          <SelectItem value="inactive">Inactivo</SelectItem>
                          <SelectItem value="pending">Pendiente</SelectItem>
                          <SelectItem value="suspended">Suspendido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <DialogFooter className="sm:justify-between"> {/* Adjust alignment */}
                    {/* Delete Button - Aligned Left */}
                    <Button
                      type="button"
                      variant="destructive"
                      className="my-2"
                      onClick={handleDeleteUser} // Updated to call the new handler
                      disabled={isSubmitting} // Disable while submitting other changes
                    >
                      Eliminar Usuario
                    </Button>

                    {/* Existing Buttons - Aligned Right */}
                    <div className="flex gap-2">
                      <Button type="button" className='text-center w-1/2' variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancelar
                      </Button>
                      <Button type="submit" className='text-center w-1/2' disabled={isSubmitting}>
                        {isSubmitting ? "Guardando..." : "Guardar Cambios"}
                      </Button>
                    </div>
                  </DialogFooter>
                </form>
              )}
              {/* Promo Code Section within Edit Tab */}
              {editedUser && (
                <div className="mt-8">
                  <Button
                    type="button"
                    onClick={() => setIsPromoSectionOpen(!isPromoSectionOpen)}
                    variant="ghost"
                    className="w-full flex justify-between items-center mb-4"
                  >
                    <h4 className="text-md font-semibold">
                      {isPromoSectionOpen ? "Ocultar Códigos Promocionales" : "Mostrar Códigos Promocionales"}
                    </h4>
                    {isPromoSectionOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </Button>
                  {isPromoSectionOpen && (
                    <div className="pt-6 border-t space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="promoCode">Código</Label>
                          <Input id="promoCode" name="code" value={newPromoCodeFields.code} onChange={handlePromoInputChange} placeholder="EJ: VERANO20" />
                        </div>
                        <div>
                          <Label htmlFor="promoDiscount">Descuento</Label>
                          <Input id="promoDiscount" name="discount" value={newPromoCodeFields.discount} onChange={handlePromoInputChange} placeholder="EJ: 20% OFF o $100" />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="promoDescription">Descripción</Label>
                        <Textarea id="promoDescription" name="description" value={newPromoCodeFields.description} onChange={handlePromoInputChange} placeholder="Descripción del cupón" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="promoExpiryDate">Fecha de Expiración</Label>
                          <Input id="promoExpiryDate" name="expiryDate" type="date" value={newPromoCodeFields.expiryDate} onChange={handlePromoInputChange} />
                        </div>
                        <div>
                          <Label htmlFor="promoCategory">Categoría</Label>
                          <Input id="promoCategory" name="category" value={newPromoCodeFields.category} onChange={handlePromoInputChange} placeholder="EJ: Bienvenida, Temporada" />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="promoMinimumPurchase">Compra Mínima (Opcional)</Label>
                        <Input id="promoMinimumPurchase" name="minimumPurchase" value={newPromoCodeFields.minimumPurchase} onChange={handlePromoInputChange} placeholder="EJ: $500" />
                      </div>
                      <Button onClick={handleAddNewPromoCode} disabled={isAddingPromo} className="w-full md:w-auto">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        {isAddingPromo ? "Agregando..." : "Agregar Código Promocional"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Membership Tab START */}
            <TabsContent value="membership" className="flex-grow overflow-y-auto p-4 space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2 flex items-center">
                  <UserCheck className="mr-2 h-5 w-5 text-primary" /> Estado de Membresía Actual
                </h3>
                {editedUser?.membership ? (
                  <div className="p-4 border rounded-lg bg-muted/50 space-y-2 text-sm">
                    <p><strong>Plan:</strong> {editedUser.membership.planName}</p>
                    <p><strong>Estado:</strong> <Badge variant={
                      editedUser.membership.status === 'active' ? 'default' :
                        editedUser.membership.status === 'suspended' ? 'destructive' :
                          (editedUser.membership.status === 'cancelled' || editedUser.membership.status === 'inactive') ? 'outline' : 'secondary'
                    }>{editedUser.membership.status.toUpperCase()}</Badge>
                    </p>
                    <p><strong>Fecha de Inicio:</strong> {editedUser.membership.startDate.toDate().toLocaleDateString('es-MX')}</p>
                    {editedUser.membership.nextBillingDate && <p><strong>Próximo Cobro:</strong> {editedUser.membership.nextBillingDate.toDate().toLocaleDateString('es-MX')}</p>}
                    {editedUser.membership.endDate && <p><strong>Fecha de Fin:</strong> {editedUser.membership.endDate.toDate().toLocaleDateString('es-MX')}</p>}
                    <p><strong>Auto-Renovación:</strong> {editedUser.membership.autoRenew ? 'Activada' : 'Desactivada'}</p>
                    {editedUser.membership.mpSubscriptionId && <p className="text-xs text-muted-foreground">ID Suscripción MP: {editedUser.membership.mpSubscriptionId}</p>}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Este usuario no tiene una membresía activa o asignada.</p>
                )}
              </div>

              <div className="pt-4 border-t">
                <h4 className="text-md font-semibold mb-3">Administrar Membresía (Simulado)</h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="membershipPlanAdmin">Asignar/Cambiar Plan</Label>
                      <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                        <SelectTrigger id="membershipPlanAdmin"><SelectValue placeholder="Seleccionar plan..." /></SelectTrigger>
                        <SelectContent>
                          {availablePlansForAdmin.map(plan => (
                            <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="membershipStatusAdmin">Estado de Membresía</Label>
                      <Select value={membershipStatus} onValueChange={(val) => setMembershipStatus(val as UserMembership['status'])}>
                        <SelectTrigger id="membershipStatusAdmin"><SelectValue placeholder="Seleccionar estado..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Activa</SelectItem>
                          <SelectItem value="inactive">Inactiva</SelectItem>
                          <SelectItem value="pending">Pendiente</SelectItem>
                          <SelectItem value="suspended">Suspendida</SelectItem>
                          <SelectItem value="cancelled">Cancelada</SelectItem> {/* Retained for admin override if needed */}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 pt-2">
                    <input type="checkbox" id="autoRenewMembershipAdmin" checked={autoRenewMembership} onChange={(e) => setAutoRenewMembership(e.target.checked)} className="h-4 w-4 accent-primary" />
                    <Label htmlFor="autoRenewMembershipAdmin" className="cursor-pointer">Auto-Renovación</Label>
                  </div>
                  <Button onClick={handleUpdateMembership} disabled={isSubmitting} className="w-full md:w-auto">
                    <Edit className="mr-2 h-4 w-4" />
                    {isSubmitting ? "Actualizando..." : "Actualizar Membresía (Simulado)"}
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2 mt-6 flex items-center">
                  <History className="mr-2 h-5 w-5 text-primary" /> Historial de Pagos de Membresía
                </h3>
                {editedUser?.membershipPayments && editedUser.membershipPayments.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2 border rounded-lg p-3">
                    {editedUser.membershipPayments.slice().sort((a, b) => b.date.toMillis() - a.date.toMillis()).map(payment => ( // Sort by date descending
                      <div key={payment.id} className="p-3 border-b last:border-b-0 text-sm hover:bg-muted/30">
                        <div className="flex justify-between items-center mb-1">
                          <p className="font-medium">{payment.description || `Pago de ${payment.amount} ${payment.currency}`}</p>
                          <Badge variant={payment.status === 'paid' ? 'default' : payment.status === 'failed' ? 'destructive' : 'secondary'} className="text-xs">
                            {payment.status.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Fecha: {payment.date.toDate().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                        <p className="text-xs text-muted-foreground">Monto: <DollarSign className="inline h-3 w-3 mr-0.5" />{payment.amount.toFixed(2)} {payment.currency}</p>
                        {payment.method && <p className="text-xs text-muted-foreground">Método: {payment.method}</p>}
                        <p className="text-xs text-muted-foreground">ID Pago: {payment.id}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No hay historial de pagos de membresía para este usuario.</p>
                )}
              </div>
            </TabsContent>
            {/* Membership Tab END */}

          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}