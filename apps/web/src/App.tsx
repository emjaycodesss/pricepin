import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MapHub } from './pages/MapHub';
import { AddFoodSpot } from './pages/AddFoodSpot';
import { UpdateMenu } from './pages/UpdateMenu';
import { AdminAuthGuard } from './pages/AdminAuthGuard';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminVerify } from './pages/AdminVerify';
import { AdminFlags } from './pages/AdminFlags';
import { AdminHistory } from './pages/AdminHistory';

/** TanStack Query client for Supabase/API data fetching */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60 * 1000 },
  },
});

/**
 * App shell: routes.
 * / — Map Hub; /add-foodspot — Add Food Spot; /update-menu/:spotId — Update Menu (upload/capture + menu items).
 */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MapHub />} />
          <Route path="/add-foodspot" element={<AddFoodSpot />} />
          <Route path="/update-menu/:spotId" element={<UpdateMenu />} />
          <Route path="/admin-price-pin" element={<AdminAuthGuard><AdminDashboard /></AdminAuthGuard>} />
          <Route path="/admin-price-pin/verify/:spotId" element={<AdminAuthGuard><AdminVerify /></AdminAuthGuard>} />
          <Route path="/admin-price-pin/verify/update/:menuUpdateId" element={<AdminAuthGuard><AdminVerify /></AdminAuthGuard>} />
          <Route path="/admin-price-pin/flags" element={<AdminAuthGuard><AdminFlags /></AdminAuthGuard>} />
          <Route path="/admin-price-pin/history" element={<AdminAuthGuard><AdminHistory /></AdminAuthGuard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
