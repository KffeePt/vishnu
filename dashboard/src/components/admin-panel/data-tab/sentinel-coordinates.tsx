import React, { useEffect, useState, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Navigation, MapPinOff, LocateFixed } from 'lucide-react';
import { db } from '@/config/firebase';
import { doc, getDoc, collection, query, onSnapshot, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { UserAuth } from '@/context/auth-context';
import { useAuthentication } from '@/hooks/use-authentication';
import { useToast } from '@/hooks/use-toast';

interface Coordinate {
    lat: number;
    lng: number;
    updatedAt: number;
    userName: string;
}

interface EncryptedCoordinatePackage {
    [uid: string]: string; // encrypted string for each online participant
}

interface MarkerData {
    uid: string;
    lat: number;
    lng: number;
    userName: string;
    updatedAt: number;
}

interface SentinelCoordinatesProps {
    employees: any[];
}

// Map styles for dark mode aesthetic
const mapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || 'DEMO_MAP_ID', // Replace with real ID
    mapTypeId: 'roadmap',
};

// Component to handle auto-fitting bounds based on active markers
function BoundsFitter({ markers }: { markers: MarkerData[] }) {
    const map = useMap();
    useEffect(() => {
        if (!map || markers.length === 0) return;

        const bounds = new google.maps.LatLngBounds();
        markers.forEach(m => bounds.extend({ lat: m.lat, lng: m.lng }));

        if (markers.length === 1) {
            map.setCenter({ lat: markers[0].lat, lng: markers[0].lng });
            map.setZoom(14);
        } else {
            map.fitBounds(bounds, 50);
        }
    }, [map, markers]);

    return null;
}

export function SentinelCoordinates({ employees }: SentinelCoordinatesProps) {
    const { user } = UserAuth();
    const { toast } = useToast();

    const [isSharing, setIsSharing] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [markers, setMarkers] = useState<MarkerData[]>([]);
    const [myLocation, setMyLocation] = useState<{ lat: number, lng: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Crypto states
    const [privateKey, setPrivateKey] = useState<any | null>(null);
    const [staffPublicKeys, setStaffPublicKeys] = useState<Record<string, any>>({});

    const watchIdRef = useRef<number | null>(null);

    // Initialize crypto for decryption and encryption
    useEffect(() => {
        async function initCrypto() {
            if (!user) return;
            try {
                // Fetch my public info
                const myPublicDoc = await getDoc(doc(db, 'public', user.uid));
                if (!myPublicDoc.exists()) {
                    throw new Error("Missing master keys.");
                }

                // For simplicity in this demo, we'll store coordinates unencrypted in RTDB first 
                // to verify the map works.
                setIsActive(true);
            } catch (err: any) {
                console.error("Failed to init map crypto:", err);
                setError("Failed to load encryption keys.");
            }
        }
        initCrypto();
    }, [user]);

    // Simulate / Connect RTDB listener for active coordinates
    useEffect(() => {
        if (!isActive) return;

        // This is a placeholder for the actual RTDB listener.
        // We simulate other users online for demonstration of the map UI.
        const mockInterval = setInterval(() => {
            const time = Date.now();
            setMarkers(prev => {
                const updated = [...prev];
                // Simulate another user moving slightly
                const botIndex = updated.findIndex(m => m.uid === 'bot-1');
                if (botIndex >= 0) {
                    updated[botIndex].lat += 0.0001;
                    updated[botIndex].lng += 0.0001;
                    updated[botIndex].updatedAt = time;
                } else if (myLocation) {
                    // Add a bot near my location
                    updated.push({
                        uid: 'bot-1',
                        lat: myLocation.lat + 0.01,
                        lng: myLocation.lng - 0.01,
                        userName: 'System Bot (Demo)',
                        updatedAt: time
                    });
                }
                return updated.filter(m => time - m.updatedAt < 5 * 60 * 1000); // 5 min TTL
            });
        }, 5000);

        return () => clearInterval(mockInterval);
    }, [isActive, myLocation]);

    const handleToggleShare = () => {
        if (isSharing) {
            // Stop sharing
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            setIsSharing(false);
            setMyLocation(null);
            setMarkers(prev => prev.filter(m => m.uid !== user?.uid));
            toast({ title: "Location sharing disabled." });
        } else {
            // Start sharing
            if (!navigator.geolocation) {
                toast({ title: "Geolocation not supported", variant: "destructive" });
                return;
            }

            toast({ title: "Locating..." });

            watchIdRef.current = navigator.geolocation.watchPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    setMyLocation({ lat, lng });
                    setIsSharing(true);

                    // Add myself to markers
                    setMarkers(prev => {
                        const existing = prev.filter(m => m.uid !== user?.uid);
                        return [...existing, {
                            uid: user!.uid,
                            lat,
                            lng,
                            userName: 'Me',
                            updatedAt: Date.now()
                        }];
                    });

                    // ToDo: Encrypt and PUSH to RTDB coordinates/ path
                },
                (err) => {
                    console.error("GPS error:", err);
                    toast({ title: "Failed to access location", description: err.message, variant: "destructive" });
                    setIsSharing(false);
                },
                { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
            );
        }
    };

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        return (
            <Card className="border-destructive/50 bg-destructive/10">
                <CardContent className="pt-6">
                    <p className="text-destructive font-medium">Missing Google Maps API Key.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-border/50 shadow-lg overflow-hidden flex flex-col h-[600px] relative">
            {/* Absolute positioned control panel overlay for a slick UI */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                <Card className="bg-background/80 backdrop-blur-md border border-border/50 shadow-lg">
                    <CardHeader className="py-3 px-4 pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <Navigation className="h-4 w-4 text-primary" />
                            Live Matrix
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <div className="flex items-center justify-between gap-6">
                            <span className="text-xs text-muted-foreground">
                                Active Agents: <span className="font-mono text-foreground font-medium">{markers.length}</span>
                            </span>
                            <Button
                                size="sm"
                                variant={isSharing ? "destructive" : "default"}
                                className={`h-8 transition-all ${isSharing ? 'bg-red-500/90 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}
                                onClick={handleToggleShare}
                            >
                                {isSharing ? (
                                    <><MapPinOff className="w-3.5 h-3.5 mr-1.5" /> Stop Sharing</>
                                ) : (
                                    <><LocateFixed className="w-3.5 h-3.5 mr-1.5" /> Go Live</>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex-1 w-full h-full bg-muted/20 relative">
                <APIProvider apiKey={apiKey}>
                    <Map
                        defaultZoom={3}
                        defaultCenter={{ lat: 39.8283, lng: -98.5795 }} // Center of US
                        {...mapOptions}
                        className="w-full h-full"
                    >
                        <BoundsFitter markers={markers} />

                        {markers.map(marker => (
                            <AdvancedMarker
                                key={marker.uid}
                                position={{ lat: marker.lat, lng: marker.lng }}
                                title={marker.userName}
                            >
                                {/* Slick custom marker UI using glassmorphism + animations */}
                                <div className="relative group cursor-pointer pointer-events-auto">
                                    {/* Pulsing ring */}
                                    <div className={`absolute -inset-2 rounded-full opacity-40 animate-ping ${marker.uid === user?.uid ? 'bg-primary' : 'bg-blue-500'}`}></div>

                                    {/* Core dot */}
                                    <div className={`relative w-4 h-4 rounded-full border-2 border-background shadow-md ${marker.uid === user?.uid ? 'bg-primary' : 'bg-blue-500'}`}></div>

                                    {/* Floating Label (Glassmorphism) */}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                                        <div className="bg-background/80 backdrop-blur-md border border-border/50 shadow-xl rounded-md px-2 py-1 flex flex-col items-center">
                                            <span className="text-xs font-bold text-foreground">{marker.userName}</span>
                                            <span className="text-[10px] text-muted-foreground">
                                                Active {(Date.now() - marker.updatedAt) < 60000 ? 'just now' : Math.floor((Date.now() - marker.updatedAt) / 60000) + 'm ago'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </AdvancedMarker>
                        ))}
                    </Map>
                </APIProvider>
            </div>
        </Card>
    );
}
