import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function App() {
  const mapRef = useRef(null);
  const myMarkerRef = useRef(null);
  const otherMarkers = useRef({});
  const myIdRef = useRef("user-" + Math.random().toString(36).slice(2));

  // 📍 Send my location every 5 seconds
  useEffect(() => {
    const myId = myIdRef.current;

    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;

          // Initialize map
          if (!mapRef.current) {
            mapRef.current = L.map("map").setView([latitude, longitude], 14);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            }).addTo(mapRef.current);

            myMarkerRef.current = L.marker([latitude, longitude])
              .addTo(mapRef.current)
              .bindPopup("You");
          }

          // Update your own marker
          if (myMarkerRef.current) {
            myMarkerRef.current.setLatLng([latitude, longitude]);
          }

          // Save to Supabase
          await supabase.from("locations").upsert({
            id: myId,
            lat: latitude,
            lng: longitude,
            updated_at: new Date().toISOString(),
          });
        },
        (err) => console.error("Geolocation error:", err),
        { enableHighAccuracy: true }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // 🧭 Listen for location updates (including others)
  useEffect(() => {
    const myId = myIdRef.current;

    const channel = supabase
      .channel("realtime:locations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "locations" },
        (payload) => {
          const { id, lat, lng } = payload.new;
          if (!lat || !lng || id === myId) return;

          if (!mapRef.current) return;

          if (otherMarkers.current[id]) {
            otherMarkers.current[id].setLatLng([lat, lng]);
          } else {
            const marker = L.marker([lat, lng], { icon: blueIcon })
              .addTo(mapRef.current)
              .bindPopup(`User: ${id}`);
            otherMarkers.current[id] = marker;
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return <div id="map" style={{ height: "100vh", width: "100vw" }} />;
}

const blueIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
