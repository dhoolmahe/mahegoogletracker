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
  const [otherMarkers, setOtherMarkers] = useState({});

  // 📍 Send my location every 5 seconds
  useEffect(() => {
    const myId = "user-" + Math.random().toString(36).slice(2); // Or use Supabase Auth UID

    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;

          // Initialize map if not already
          if (!mapRef.current) {
            mapRef.current = L.map("map").setView([latitude, longitude], 14);
            L.tileLayer(
              "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            ).addTo(mapRef.current);
            myMarkerRef.current = L.marker([latitude, longitude]).addTo(
              mapRef.current
            );
          }

          // Update my marker
          if (myMarkerRef.current) {
            myMarkerRef.current.setLatLng([latitude, longitude]);
            mapRef.current.setView([latitude, longitude]);
          }

          // Upsert my location to Supabase
          await supabase.from("locations").upsert({
            id: myId,
            lat: latitude,
            lng: longitude,
            updated_at: new Date().toISOString(),
          });
        },
        (err) => console.error("Geo error:", err),
        { enableHighAccuracy: true }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // 🧭 Listen for others’ location changes
  useEffect(() => {
    const channel = supabase
      .channel("realtime:locations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "locations" },
        (payload) => {
          const { id, lat, lng } = payload.new;
          if (!mapRef.current || !lat || !lng) return;

          // Don't show ourself
          if (id === myId) return;

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

const blueIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
