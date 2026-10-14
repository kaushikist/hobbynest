// Shared HobbyNest dashboard map. Shows upcoming meetups with coordinates.
// It uses OpenStreetMap tiles and the existing authenticated Supabase session.
(function () {
  "use strict";
  const esc = value => (window.HN && HN.escapeHTML) ? HN.escapeHTML(value == null ? "" : String(value)) : String(value || "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  async function initMap(containerId, statusId) {
    const container = document.getElementById(containerId);
    const status = document.getElementById(statusId);
    if (!container || !status) return;
    try {
      await window.nsReady;
      if (!window.L) throw new Error("Map library could not load. Check your connection and refresh.");
      const { data: rows, error } = await supabaseClient
        .from("meetups")
        .select("id,title,description,venue,latitude,longitude,starts_at")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      const meetups = (rows || []).filter(m => Number.isFinite(Number(m.latitude)) && Number.isFinite(Number(m.longitude)) && m.latitude !== null && m.longitude !== null);
      let center = [20.5937, 78.9629], zoom = 4;
      const { data: profile } = await supabaseClient.from("profiles").select("latitude,longitude").eq("id", window.nsUser.id).maybeSingle();
      if (profile && profile.latitude != null && profile.longitude != null) { center = [Number(profile.latitude), Number(profile.longitude)]; zoom = 10; }
      const map = L.map(container, { scrollWheelZoom: false }).setView(center, zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }).addTo(map);
      const bounds = [];
      meetups.forEach(meetup => {
        const lat = Number(meetup.latitude), lng = Number(meetup.longitude);
        const date = new Date(meetup.starts_at);
        const when = Number.isNaN(date.getTime()) ? "Date to be confirmed" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
        const popup = `<strong>${esc(meetup.title)}</strong><br>${esc(meetup.venue || "Location shared by host")}<br><small>${esc(when)}</small><br><a href="../user/nearby-meetups.html">View meetup</a>`;
        L.marker([lat, lng]).addTo(map).bindPopup(popup);
        bounds.push([lat, lng]);
      });
      if (bounds.length) {
        if (profile && profile.latitude != null && profile.longitude != null) bounds.push(center);
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12 });
      }
      setTimeout(() => map.invalidateSize(), 100);
      status.textContent = meetups.length
        ? `${meetups.length} upcoming meetup location${meetups.length === 1 ? "" : "s"} on the map.`
        : "No upcoming meetups with map pins yet. Hosts can add a venue pin from Nearby Meetups.";
    } catch (error) {
      console.error("Dashboard map error:", error);
      status.textContent = error.message || "Couldn't load the community map. Please refresh.";
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    initMap("learnerCommunityMap", "learnerCommunityMapStatus");
    initMap("educatorCommunityMap", "educatorCommunityMapStatus");
  });
})();
