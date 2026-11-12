"use client";

import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/airports";

type Props = {
  id: string;
  label: string;
  placeholder: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
};

// Buscador de aeropuertos: se escribe ciudad, aeropuerto o codigo y se elige de la lista,
// para que "MED" no termine siendo Medina cuando se queria Medellin.
export default function AirportField({ id, label, placeholder, value, onChange }: Props) {
  const [text, setText] = useState(value?.label ?? "");
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    if (value || text.trim().length < 2) return;
    const current = ++request.current;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/airports?q=${encodeURIComponent(text)}`);
      const data = await res.json().catch(() => ({ places: [] }));
      if (current !== request.current) return;
      setPlaces(data.places ?? []);
      setActive(0);
      setOpen(true);
    }, 180);
    return () => clearTimeout(timer);
  }, [text, value]);

  function choose(place: Place) {
    onChange(place);
    setText(place.label);
    setOpen(false);
  }

  const listId = `${id}-list`;
  const showList = open && !value && text.trim().length >= 2;

  return (
    <div className="field wide combo">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && places[active] ? `${id}-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (value) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!showList || places.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % places.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + places.length) % places.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(places[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul id={listId} role="listbox" className="combo-list">
          {places.length === 0 ? (
            <li className="combo-empty">Ningún aeropuerto coincide.</li>
          ) : (
            places.map((place, i) => (
              <li
                key={place.codes}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : undefined}
                // mousedown para elegir antes de que el input pierda el foco
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(place);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <strong>{place.label}</strong>
                <span>{place.detail}</span>
              </li>
            ))
          )}
        </ul>
      )}
      {value && <small>{value.detail}</small>}
    </div>
  );
}
