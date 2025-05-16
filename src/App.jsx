import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function getQueryParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

// 🌍 Reverse geocoding function to get full address
async function reverseGeocode(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    );
    if (!response.ok) throw new Error("Failed to fetch location");
    const data = await response.json();
    return data.display_name; // Full address string
  } catch (err) {
    console.error("Reverse geocoding error:", err);
    return "Unknown location";
  }
}

export default function App() {
  const mapRef = useRef(null);
  const myMarkerRef = useRef(null);
  const sharerMarkerRef = useRef(null);
  const [sharerData, setSharerData] = useState(null);
  const [locationName, setLocationName] = useState("");

  const role = getQueryParam("role"); // "sharer" or "viewer"
  const userId = getQueryParam("id") || "test-user";

  // 🚀 SHARER: Sends location to Supabase
  useEffect(() => {
    if (role !== "sharer" || !("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        // Map setup
        if (!mapRef.current) {
          mapRef.current = L.map("map").setView([latitude, longitude], 14);
          L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          ).addTo(mapRef.current);
          myMarkerRef.current = L.marker([latitude, longitude], {
            icon: arrowIcon,
          }).addTo(mapRef.current);
        }

        // Update marker
        if (myMarkerRef.current) {
          myMarkerRef.current.setLatLng([latitude, longitude]);
          mapRef.current.setView([latitude, longitude]);
        }

        // Send to Supabase
        await supabase.from("locations").upsert({
          id: userId,
          lat: latitude,
          lng: longitude,
          updated_at: new Date().toISOString(),
        });
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [role, userId]);

  // 🔍 VIEWER: Subscribes to sharer updates
  useEffect(() => {
    const channel = supabase
      .channel("realtime:locations")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "locations",
          filter: `id=eq.${userId}`,
        },
        async (payload) => {
          const { lat, lng, updated_at } = payload.new;
          setSharerData({ lat, lng, updated_at });

          // Fetch detailed address
          const address = await reverseGeocode(lat, lng);
          setLocationName(address);

          // Map setup
          if (!mapRef.current) {
            mapRef.current = L.map("map").setView([lat, lng], 14);
            L.tileLayer(
              "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            ).addTo(mapRef.current);
            sharerMarkerRef.current = L.marker([lat, lng], {
              icon: blueIcon,
            }).addTo(mapRef.current);
          } else if (sharerMarkerRef.current) {
            sharerMarkerRef.current.setLatLng([lat, lng]);
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userId]);

  return (
    <>
      <div id="map" style={{ height: "100vh", width: "100vw" }} />

      {sharerData && role === "viewer" && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            background: "#fff",
            padding: "10px",
            borderRadius: "8px",
            boxShadow: "0 0 8px rgba(0,0,0,0.2)",
            zIndex: 1000,
            maxWidth: "90vw",
          }}>
          <div>
            <b>User:</b> {userId}
          </div>
          <div>
            📌 {sharerData.lat.toFixed(4)}, {sharerData.lng.toFixed(4)}
          </div>
          <div style={{ marginTop: "4px" }}>
            📍 <span style={{ fontSize: "0.9em" }}>{locationName}</span>
          </div>
          <div>🕒 {new Date(sharerData.updated_at).toLocaleTimeString()}</div>
        </div>
      )}
    </>
  );
}

const arrowIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [35, 35],
  iconAnchor: [17, 17],
});

const blueIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
