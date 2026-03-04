/**
 * Map Hub — route: /. Discovery, search, view prices, open restaurant detail.
 * Top bar: SearchBar + GpsButton; map area: Map; detail: BottomSheet (mobile) / Sidebar (desktop).
 */
import { Map } from '../components/Map';
import { SearchBar } from '../components/SearchBar';
import { GpsButton } from '../components/GpsButton';
import { BottomSheet } from '../components/BottomSheet';
import { Sidebar } from '../components/Sidebar';

export function MapHub() {
  return (
    <div className="flex flex-col h-screen">
      {/* Sticky top bar */}
      <header className="flex items-center gap-2 p-2 bg-white border-b border-gray-200 shrink-0">
        <a href="/" className="font-semibold text-gray-900 shrink-0">PricePin</a>
        <SearchBar />
        <GpsButton />
      </header>
      {/* Sidebar (left) + map row */}
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <Map />
        </main>
      </div>
      <BottomSheet />
    </div>
  );
}
