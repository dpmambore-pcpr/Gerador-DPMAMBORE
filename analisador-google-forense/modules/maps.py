"""Mapa Folium com destaque da DATA DO CRIME."""
from __future__ import annotations

import folium
from folium.plugins import MarkerCluster

from modules import db
from modules.utils import display_dt, parse_datetime, within_window


def build_map(case_id: int, crime_date: str | None = None, window_hours: int = 24) -> str:
    case = db.get_case(case_id) or {}
    crime_date = crime_date or case.get("crime_date")
    window_hours = int(window_hours or case.get("crime_window_hours") or 24)
    rows = db.query("SELECT * FROM locations WHERE case_id = ? AND lat IS NOT NULL AND lon IS NOT NULL", (case_id,))
    photos = db.query(
        "SELECT * FROM photos WHERE case_id = ? AND has_gps = 1 AND lat IS NOT NULL AND lon IS NOT NULL",
        (case_id,),
    )
    if not rows and not photos:
        fmap = folium.Map(location=[-25.4284, -49.2733], zoom_start=12, tiles="OpenStreetMap")
        folium.Marker([-25.4284, -49.2733], tooltip="Sem pontos de localização nesta produção").add_to(fmap)
        return fmap.get_root().render()

    pts = [(r["lat"], r["lon"]) for r in rows] + [(p["lat"], p["lon"]) for p in photos]
    center = [sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)]
    fmap = folium.Map(location=center, zoom_start=13, tiles="OpenStreetMap")
    near = folium.FeatureGroup(name="Próximos da DATA DO CRIME")
    other = folium.FeatureGroup(name="Demais localizações")
    cluster = MarkerCluster(name="Agrupamento").add_to(other)

    for row in rows:
        permanencia = ""
        if row.get("duration_seconds"):
            mins = int(row["duration_seconds"] // 60)
            permanencia = f"<br/>Permanência: {mins} min"
        html = (
            f"<b>{row.get('place_name') or 'Ponto GPS'}</b><br/>"
            f"{display_dt(row.get('ts'))}<br/>"
            f"Lat {row['lat']:.6f} Lon {row['lon']:.6f}{permanencia}"
        )
        is_near = bool(crime_date) and within_window(row.get("ts"), crime_date, window_hours)
        marker = folium.CircleMarker(
            location=[row["lat"], row["lon"]],
            radius=8 if is_near else 5,
            color="#8f3037" if is_near else "#2d6a56",
            fill=True,
            fill_opacity=0.85,
            popup=folium.Popup(html, max_width=280),
            tooltip=display_dt(row.get("ts")) or "sem data",
        )
        marker.add_to(near if is_near else cluster)

    for photo in photos:
        html = (
            f"<b>Foto: {photo.get('filename')}</b><br/>"
            f"{display_dt(photo.get('taken_at'))}<br/>"
            f"Lat {photo['lat']:.6f} Lon {photo['lon']:.6f}"
        )
        is_near = bool(crime_date) and within_window(photo.get("taken_at"), crime_date, window_hours)
        folium.Marker(
            location=[photo["lat"], photo["lon"]],
            icon=folium.Icon(color="red" if is_near else "blue", icon="info-sign"),
            popup=html,
            tooltip=photo.get("filename"),
        ).add_to(near if is_near else other)

    if crime_date and parse_datetime(crime_date):
        folium.Marker(
            location=center,
            icon=folium.DivIcon(
                html='<div style="font:700 11px Arial;color:#8f3037;background:#fff3cd;padding:4px 8px;border:1px solid #c5a253;border-radius:8px">DATA DO CRIME</div>'
            ),
            tooltip=f"Data do crime: {display_dt(crime_date)}",
        ).add_to(fmap)

    near.add_to(fmap)
    other.add_to(fmap)
    folium.LayerControl().add_to(fmap)
    return fmap.get_root().render()
