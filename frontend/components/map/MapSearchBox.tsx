"use client";

import React, { useEffect, useRef, useState } from "react";
import { Clock, MapPin, Search, X } from "lucide-react";
import { MapSearchResult } from "@/lib/api/client";
import { clearRecentSearches, getRecentSearches, saveRecentSearch, searchMapLocations } from "@/lib/geospatial/search";
import { cn } from "@/lib/utils";

interface MapSearchBoxProps {
  onSelect: (result: MapSearchResult) => void;
  placeholder?: string;
  className?: string;
}

export const MapSearchBox: React.FC<MapSearchBoxProps> = ({ onSelect, placeholder, className }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MapSearchResult[]>([]);
  const [recent, setRecent] = useState<MapSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(getRecentSearches());
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    timer.current = setTimeout(() => {
      void searchMapLocations(query, 8)
        .then((items) => {
          setResults(items);
          setError(items.length ? "" : "No matching places, cameras, alerts, or coordinates.");
        })
        .catch(() => setError("Search is unavailable. Check backend connectivity and try coordinates."))
        .finally(() => setLoading(false));
    }, 220);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const visibleRecent = !query.trim() ? recent : [];
  const visibleResults = query.trim() ? results : [];
  const flatList = [...visibleResults, ...visibleRecent];

  const choose = (result: MapSearchResult) => {
    saveRecentSearch(result);
    setRecent(getRecentSearches());
    setQuery(result.label);
    setOpen(false);
    onSelect(result);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, flatList.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && flatList[activeIndex]) choose(flatList[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className="flex items-center gap-2 border border-[#CBDCEB] bg-white px-3 py-2 shadow-sm">
        <Search className="h-4 w-4 shrink-0 text-[#0284C7]" aria-hidden="true" />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls="sentrix-map-search-list"
          aria-autocomplete="list"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder || "Search places, cameras, alerts, roads, or 28.6139, 77.2090"}
          className="w-full bg-transparent font-mono text-xs text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setResults([]);
              setError("");
            }}
            className="text-[#64748B] hover:text-[#0F172A]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (query.trim().length >= 2 || visibleRecent.length > 0) && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto border border-[#CBDCEB] bg-white shadow-lg">
          {loading && <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[#0284C7]">Searching…</div>}
          {error && !loading && <div className="px-3 py-2 font-mono text-[10px] text-[#64748B]">{error}</div>}
          {!query.trim() && visibleRecent.length > 0 && (
            <div className="flex items-center justify-between border-b border-[#E2E8F0] px-3 py-1.5">
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#64748B]">Recent</span>
              <button
                type="button"
                onClick={() => {
                  clearRecentSearches();
                  setRecent([]);
                }}
                className="font-mono text-[9px] uppercase text-[#0284C7]"
              >
                Clear
              </button>
            </div>
          )}
          <ul id="sentrix-map-search-list" role="listbox" aria-label="Location suggestions">
            {flatList.map((result, index) => (
              <li key={result.id} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(result)}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[#F0F9FF]",
                    index === activeIndex && "bg-[#F0F9FF]"
                  )}
                >
                  {query.trim() ? (
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0284C7]" aria-hidden="true" />
                  ) : (
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#64748B]" aria-hidden="true" />
                  )}
                  <span>
                    <span className="block font-mono text-xs font-bold text-[#0F172A]">{result.label}</span>
                    <span className="block font-mono text-[10px] text-[#64748B]">
                      {result.sublabel} · {result.lat.toFixed(4)}, {result.lng.toFixed(4)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-[#E2E8F0] px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-[#94A3B8]">
            Coordinates accepted as 28.6139, 77.2090
          </div>
        </div>
      )}
    </div>
  );
};
