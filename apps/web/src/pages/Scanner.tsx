/**
 * Scanner — route: /upload/:restaurantId. Capture or upload menu photo, send to AI.
 */
import { Link, useParams } from 'react-router-dom';
import { CameraCapture } from '../components/CameraCapture';

export function Scanner() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  return (
    <div className="min-h-screen bg-white p-4">
      <header className="flex items-center gap-2 mb-4">
        <Link to="/" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100">
          ←
        </Link>
        <h1 className="text-lg font-semibold">
          {restaurantId && restaurantId !== 'new' ? 'Update menu' : 'Add menu photo'}
        </h1>
      </header>
      <CameraCapture />
    </div>
  );
}
