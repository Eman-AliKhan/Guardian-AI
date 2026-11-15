import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { PAKISTAN_CITY_HUBS } from '../data/pakistanSeed';
import type {
  CommunityReport,
  EmergencyStation,
  Incident,
  ResponderUnit,
  SafeZone,
} from '../types/guardian';

interface TacticalMapProps {
  incidents: Incident[];
  responders: ResponderUnit[];
  stations: EmergencyStation[];
  communityReports: CommunityReport[];
  safeZones: SafeZone[];
  selectedIncidentId: string | null;
  onSelectIncident: (id: string) => void;
  activeCity: string;
  onCityChange: (city: string) => void;
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
  heightClass?: string;
}

export const TacticalMap: React.FC<TacticalMapProps> = ({
  incidents,
  responders,
  stations,
  communityReports,
  safeZones,
  selectedIncidentId,
  onSelectIncident,
  activeCity,
  onCityChange,
  showHeatmap,
  onToggleHeatmap,
  heightClass = 'h-[480px]',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [tileError, setTileError] = useState(false);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const hub = PAKISTAN_CITY_HUBS[activeCity] || PAKISTAN_CITY_HUBS.Lahore;
    const map = L.map(containerRef.current, {
      center: [hub.lat, hub.lng],
      zoom: hub.zoom,
      zoomControl: true,
      attributionControl: true,
    });

    const tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    });

    tileLayer.on('tileerror', () => {
      setTileError(true);
    });

    tileLayer.addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Pan map when activeCity or selectedIncident changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const selected = incidents.find((i) => i.id === selectedIncidentId);
    if (selected) {
      map.setView([selected.location.lat, selected.location.lng], 14, { animate: true });
      return;
    }

    const hub = PAKISTAN_CITY_HUBS[activeCity];
    if (hub) {
      map.setView([hub.lat, hub.lng], hub.zoom, { animate: true });
    }
  }, [activeCity, selectedIncidentId]);

  // Render live operational markers, trails, stations, responders, geofences, and heat clusters
  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    // 1. Safe Zones (Geofences)
    for (const zone of safeZones) {
      if (!zone.active) continue;
      L.circle([zone.lat, zone.lng], {
        radius: zone.radiusMeters,
        color: '#16A34A',
        weight: 1.5,
        dashArray: '4 4',
        fillColor: '#16A34A',
        fillOpacity: 0.08,
      })
        .bindTooltip(`Safe Zone: ${zone.name}`, { direction: 'top' })
        .addTo(group);
    }

    // 2. Heatmap / Incident Clustering Overlay
    if (showHeatmap) {
      for (const inc of incidents) {
        const radius = inc.priority === 'critical' ? 950 : 650;
        L.circle([inc.location.lat, inc.location.lng], {
          radius,
          color: '#DC2626',
          weight: 0,
          fillColor: '#DC2626',
          fillOpacity: 0.16,
        }).addTo(group);
      }
      for (const rep of communityReports) {
        L.circle([rep.lat, rep.lng], {
          radius: 550,
          color: '#D97706',
          weight: 0,
          fillColor: '#D97706',
          fillOpacity: 0.14,
        }).addTo(group);
      }
    }

    // 3. Emergency Stations (Police 15, Rescue 1122 Hospital, Fire 16)
    for (const st of stations) {
      const color =
        st.agency === 'police' ? '#1D4ED8' : st.agency === 'hospital' ? '#059669' : '#EA580C';
      const code = st.agency === 'police' ? '15' : st.agency === 'hospital' ? 'H' : '16';
      const icon = L.divIcon({
        className: 'guardian-div-icon',
        html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:${color};color:#fff;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(15,23,42,0.28);">${code}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([st.lat, st.lng], { icon })
        .bindPopup(
          `<div style="font-size:12px;line-height:1.4;"><strong>${st.name}</strong><br/>${st.district} · ${st.city}<br/>Hotline: ${st.phone}</div>`
        )
        .addTo(group);
    }

    // 4. Community Safety Reports
    for (const rep of communityReports) {
      const icon = L.divIcon({
        className: 'guardian-div-icon',
        html: `<div style="width:14px;height:14px;border-radius:3px;transform:rotate(45deg);background:#D97706;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([rep.lat, rep.lng], { icon })
        .bindPopup(
          `<div style="font-size:12px;"><strong>Community Report (${rep.category.replace('_', ' ')})</strong><br/>${rep.areaLabel}<br/><span style="color:#64748b;">Moderated advisory — unverified until confirmed</span></div>`
        )
        .addTo(group);
    }

    // 5. Moving Responders
    for (const resp of responders) {
      const bg = resp.status === 'en_route' ? '#0F172A' : '#475569';
      const icon = L.divIcon({
        className: 'guardian-div-icon',
        html: `<div style="padding:2px 6px;border-radius:4px;background:${bg};color:#fff;font-size:10px;font-weight:700;white-space:nowrap;border:1.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${resp.callSign}</div>`,
        iconSize: [80, 20],
        iconAnchor: [40, 10],
      });
      L.marker([resp.lat, resp.lng], { icon })
        .bindPopup(
          `<div style="font-size:12px;"><strong>${resp.name}</strong><br/>Status: ${resp.status.replace('_', ' ')}<br/>Badge: ${resp.verifiedBadge}</div>`
        )
        .addTo(group);
    }

    // 6. Active & Historical Incidents + GPS Trails
    for (const inc of incidents) {
      const isSelected = inc.id === selectedIncidentId;
      const isClosed = inc.status === 'resolved' || inc.status === 'false_alarm';
      const markerColor = isClosed
        ? '#64748B'
        : inc.priority === 'critical'
          ? '#DC2626'
          : '#D97706';

      if (inc.locationTrail.length > 1) {
        L.polyline(
          inc.locationTrail.map((p) => [p.lat, p.lng] as [number, number]),
          {
            color: markerColor,
            weight: isSelected ? 3.5 : 2,
            opacity: isSelected ? 0.9 : 0.55,
            dashArray: inc.silentMode ? '6 4' : undefined,
          }
        ).addTo(group);
      }

      // Draw line from assigned responder to incident
      if (inc.assignedResponderId && !isClosed) {
        const resp = responders.find((r) => r.id === inc.assignedResponderId);
        if (resp) {
          L.polyline(
            [
              [resp.lat, resp.lng],
              [inc.location.lat, inc.location.lng],
            ],
            {
              color: '#0F172A',
              weight: 2,
              dashArray: '4 6',
              opacity: 0.75,
            }
          ).addTo(group);
        }
      }

      const ring = isSelected ? 'box-shadow:0 0 0 4px rgba(220,38,38,0.28), 0 3px 8px rgba(0,0,0,0.35);' : 'box-shadow:0 2px 6px rgba(0,0,0,0.3);';
      const icon = L.divIcon({
        className: 'guardian-div-icon',
        html: `<div style="display:flex;align-items:center;gap:4px;padding:3px 7px;border-radius:6px;background:${markerColor};color:#fff;font-size:11px;font-weight:700;white-space:nowrap;border:2px solid #fff;${ring}"><span>${inc.id.replace('INC-2026-', '#')}</span><span>·</span><span>${inc.priority.toUpperCase()}</span></div>`,
        iconSize: [108, 24],
        iconAnchor: [54, 12],
      });

      const marker = L.marker([inc.location.lat, inc.location.lng], { icon }).addTo(group);
      marker.on('click', () => onSelectIncident(inc.id));
    }
  }, [incidents, responders, stations, communityReports, safeZones, selectedIncidentId, showHeatmap]);

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900">
      {/* Map Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {Object.keys(PAKISTAN_CITY_HUBS).map((city) => (
            <button
              key={city}
              type="button"
              onClick={() => onCityChange(city)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeCity === city
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {city}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
            15 Police · H Hospital/1122 · 16 Fire
          </span>
          <button
            type="button"
            onClick={onToggleHeatmap}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showHeatmap
                ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
            }`}
          >
            {showHeatmap ? 'Hide Cluster Heatmap' : 'Show Cluster Heatmap'}
          </button>
        </div>
      </div>

      {/* Leaflet Canvas */}
      <div className={`relative w-full ${heightClass} bg-slate-200 dark:bg-slate-950`}>
        <div ref={containerRef} className="w-full h-full" />
        {tileError && (
          <div className="pointer-events-none absolute top-3 left-3 z-[400] bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-md text-xs text-slate-700 dark:text-slate-300">
            Map tiles restricted offline — displaying live GPS coordinate vectors
          </div>
        )}
      </div>
    </div>
  );
};
