/**
 * Verification — route: /verify. Edit AI-parsed rows, then "Confirm and post to map".
 */
import { Link } from 'react-router-dom';
import { VerificationList } from '../components/VerificationList';

export function Verify() {
  return (
    <div className="min-h-screen bg-white p-4">
      <header className="flex items-center gap-2 mb-4">
        <Link to="/" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100">
          ←
        </Link>
        <h1 className="text-lg font-semibold">Verify menu</h1>
      </header>
      <VerificationList />
    </div>
  );
}
