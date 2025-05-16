import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createClient } from "@supabase/supabase-js";

// Supabase setup
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function App() {
  const mapRef = useRef(null);
  const myMarkerRef = useRef(null);
  const [otherMarkers, setOtherMarkers] = useState({});
  const myIdRef = useRef("user-" + Math.random().toString(36).slice(2));

  // 📍 Send my location every 5 seconds
  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;

          // Initialize map and marker
          if (!mapRef.current) {
            mapRef.current = L.map("map").setView([latitude, longitude], 14);
            L.tileLayer(
              "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            ).addTo(mapRef.current);

            myMarkerRef.current = L.marker([latitude, longitude], {
              icon: arrowIcon,
            }).addTo(mapRef.current);
          }

          // Update my marker
          if (myMarkerRef.current) {
            myMarkerRef.current.setLatLng([latitude, longitude]);
            mapRef.current.setView([latitude, longitude]);
          }

          // Upsert location to Supabase
          try {
            const { error } = await supabase.from("locations").upsert({
              id: myIdRef.current,
              lat: latitude,
              lng: longitude,
              updated_at: new Date().toISOString(),
            });
            if (error) {
              console.error("Supabase upsert error:", error);
            }
          } catch (e) {
            console.error("Supabase insert failed:", e);
          }
        },
        (err) => console.error("Geo error:", err),
        { enableHighAccuracy: true }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // 🧭 Listen for others' locations
  useEffect(() => {
    const channel = supabase
      .channel("realtime:locations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "locations" },
        (payload) => {
          const { id, lat, lng } = payload.new;
          if (!mapRef.current || !lat || !lng) return;
          if (id === myIdRef.current) return;

          setOtherMarkers((prev) => {
            if (prev[id]) {
              prev[id].setLatLng([lat, lng]);
            } else {
              prev[id] = L.marker([lat, lng], { icon: blueIcon }).addTo(
                mapRef.current
              );
            }
            return { ...prev };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return <div id="map" style={{ height: "100vh", width: "100vw" }} />;
}

// ✅ Blue arrow icon for current user
const arrowIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png", // Blue GPS arrow icon
  iconSize: [35, 35],
  iconAnchor: [17, 17],
});

// 🔵 Default blue marker for other users
const blueIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
