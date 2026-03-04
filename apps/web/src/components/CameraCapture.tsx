/**
 * Camera viewport (getUserMedia) or file upload; preview before submit. "Read menu with AI" sends to FastAPI.
 */
export function CameraCapture() {
  return (
    <div className="flex flex-col gap-4">
      <div className="aspect-video bg-gray-200 rounded-lg flex items-center justify-center">
        Camera / upload placeholder
      </div>
      <button type="button" className="min-h-[44px] px-4 rounded-lg bg-blue-600 text-white">
        Read menu with AI
      </button>
    </div>
  );
}
