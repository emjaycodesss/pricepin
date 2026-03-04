import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MapHub } from './pages/MapHub';
import { Scanner } from './pages/Scanner';
import { Verify } from './pages/Verify';

/** TanStack Query client for Supabase/API data fetching */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60 * 1000 },
  },
});

/**
 * App shell: routes per README sitemap.
 * / — Map Hub; /upload/:restaurantId — Scanner; /verify — Verification.
 */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MapHub />} />
          <Route path="/upload/:restaurantId" element={<Scanner />} />
          <Route path="/verify" element={<Verify />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
