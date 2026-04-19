"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Circle } from '@react-google-maps/api';
import LoadingSpinner from '@/components/loading-spinner'; // Assuming this path is correct

// --- Define Types ---
export interface MapLatLng {
  lat: number;
  lng: number;
}

export interface DeliveryZoneState {
  id: string;
  name: string;
  center: MapLatLng;
  radius: number; // In meters
}

// --- Default Values ---
const defaultContainerStyle = {
  width: '100%',
  height: '400px',
};

const defaultMapCenter = {
  lat: 19.4326,
  lng: -99.1332,
};

const defaultMapZoom = 12;

const defaultCircleOptions: google.maps.CircleOptions = {
  strokeColor: "#FF0000",
  strokeOpacity: 0.8,
  strokeWeight: 2,
  fillColor: "#FF0000",
  fillOpacity: 0.35,
  clickable: false,
  draggable: false,
  editable: false,
  visible: true,
  zIndex: 1,
};

// Standardize libraries array (alphabetical order)
const libraries: ("geocoding" | "geometry" | "places")[] = ['geocoding', 'geometry', 'places'];

// --- Component Props ---
interface GoogleMapDisplayProps {
  apiKey: string;
  containerStyle?: React.CSSProperties;
  mapContainerClassName?: string;
  center?: MapLatLng;
  zoom?: number;
  zones?: DeliveryZoneState[];
  zoneCircleOptions?: google.maps.CircleOptions;
  selectedCoords?: MapLatLng | null;
  markerOptions?: google.maps.MarkerOptions;
  mapOptions?: google.maps.MapOptions;
  onMapLoad?: (map: google.maps.Map) => void;
  onMapUnmount?: (map: google.maps.Map) => void;
  showZonesLoadingOverlay?: boolean;
  zonesErrorText?: string | null;
  fitBoundsToZones?: boolean;
  maxZoomAfterFitBounds?: number;
}

const GoogleMapDisplay: React.FC<GoogleMapDisplayProps> = ({
  apiKey,
  containerStyle = defaultContainerStyle,
  mapContainerClassName = 'rounded-xl',
  center = defaultMapCenter,
  zoom = defaultMapZoom,
  zones = [],
  zoneCircleOptions = defaultCircleOptions,
  selectedCoords,
  markerOptions,
  mapOptions,
  onMapLoad,
  onMapUnmount,
  showZonesLoadingOverlay = false,
  zonesErrorText = null,
  fitBoundsToZones = true,
  maxZoomAfterFitBounds = 16,
}) => {
  const mapRef = useRef<google.maps.Map | null>(null);
  const [internalMapCenter, setInternalMapCenter] = useState(center);
  const [internalMapZoom, setInternalMapZoom] = useState(zoom);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script', // Standardized ID
    googleMapsApiKey: apiKey,
    libraries: libraries, // Use standardized libraries array
  });

  const handleMapLoad = useCallback((mapInstance: google.maps.Map) => {
    mapRef.current = mapInstance;
    if (onMapLoad) {
      onMapLoad(mapInstance);
    }
    // Initial bounds fitting
    if (fitBoundsToZones && zones.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      zones.forEach(zone => {
        const zoneCenterLatLng = new google.maps.LatLng(zone.center.lat, zone.center.lng);
        const circleForBounds = new google.maps.Circle({ center: zoneCenterLatLng, radius: zone.radius });
        bounds.union(circleForBounds.getBounds()!);
      });
      if (!bounds.isEmpty()) {
        mapInstance.fitBounds(bounds);
        const listener = google.maps.event.addListener(mapInstance, 'idle', () => {
          if (mapInstance.getZoom()! > maxZoomAfterFitBounds) mapInstance.setZoom(maxZoomAfterFitBounds);
          google.maps.event.removeListener(listener);
        });
      }
    } else {
        mapInstance.setCenter(internalMapCenter);
        mapInstance.setZoom(internalMapZoom);
    }
  }, [onMapLoad, zones, fitBoundsToZones, maxZoomAfterFitBounds, internalMapCenter, internalMapZoom]);

  const handleMapUnmount = useCallback(() => {
    if (onMapUnmount && mapRef.current) {
      onMapUnmount(mapRef.current);
    }
    mapRef.current = null;
  }, [onMapUnmount]);

  // Effect to update map bounds when zones change
  useEffect(() => {
    if (mapRef.current && fitBoundsToZones && zones.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      zones.forEach(zone => {
        const zoneCenterLatLng = new google.maps.LatLng(zone.center.lat, zone.center.lng);
        const circleForBounds = new google.maps.Circle({ center: zoneCenterLatLng, radius: zone.radius });
        bounds.union(circleForBounds.getBounds()!);
      });
      if (!bounds.isEmpty()) {
        mapRef.current.fitBounds(bounds);
        const listener = google.maps.event.addListener(mapRef.current, 'idle', () => {
          if (mapRef.current!.getZoom()! > maxZoomAfterFitBounds) mapRef.current!.setZoom(maxZoomAfterFitBounds);
          google.maps.event.removeListener(listener);
        });
      }
    } else if (mapRef.current && zones.length === 0) { // No zones, reset to center/zoom
        mapRef.current.setCenter(internalMapCenter);
        mapRef.current.setZoom(internalMapZoom);
    }
  }, [zones, fitBoundsToZones, maxZoomAfterFitBounds, internalMapCenter, internalMapZoom]);

  // Effect to pan to selected coordinates
  useEffect(() => {
    if (mapRef.current && selectedCoords) {
      mapRef.current.panTo(selectedCoords);
      // Optionally set zoom, or let fitBounds handle it if zones are also present
      // mapRef.current.setZoom(15); // Example: zoom in on marker
    }
  }, [selectedCoords]);

  // Update internal center/zoom if props change
    useEffect(() => {
        setInternalMapCenter(center);
    }, [center]);

    useEffect(() => {
        setInternalMapZoom(zoom);
    }, [zoom]);


  if (!apiKey) {
    return <div className="p-4 text-red-600" style={containerStyle}>API Key for Google Maps is missing.</div>;
  }

  if (loadError) {
    console.error("Google Maps Load Error:", loadError);
    return <div className="p-4 text-red-600" style={containerStyle}>Error al cargar el mapa. Verifica la API Key y la conexión.</div>;
  }

  if (!isLoaded) {
    return (
      <div className="p-4 flex justify-center items-center" style={containerStyle}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="relative" style={containerStyle}>
      {(showZonesLoadingOverlay || zonesErrorText) && (
        <div className="absolute inset-0 bg-background/80 flex justify-center items-center z-10 rounded-md">
          {showZonesLoadingOverlay && <LoadingSpinner />}
          {zonesErrorText && <p className="text-red-500 p-4 text-center">{zonesErrorText}</p>}
        </div>
      )}
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }} // Ensure map fills the container
        mapContainerClassName={mapContainerClassName}
        center={internalMapCenter}
        zoom={internalMapZoom}
        onLoad={handleMapLoad}
        onUnmount={handleMapUnmount}
        options={{ mapTypeControl: false, streetViewControl: false, fullscreenControl: false, ...mapOptions }}
      >
        {!showZonesLoadingOverlay && !zonesErrorText && zones.map(zone => (
          <Circle
            key={zone.id}
            center={zone.center}
            radius={zone.radius}
            options={zoneCircleOptions}
          />
        ))}
        {selectedCoords && <Marker position={selectedCoords} options={markerOptions} />}
      </GoogleMap>
    </div>
  );
};

export default GoogleMapDisplay;
