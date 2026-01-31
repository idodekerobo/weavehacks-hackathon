export default function SessionsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Browser Sessions</h1>
          <p className="text-sm text-gray-500 mt-1">Browserbase automation sessions with Live View</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center text-gray-500">
            <p className="text-lg font-medium mb-2">No active sessions</p>
            <p className="text-sm">
              Browserbase sessions for web automation will appear here with Live View and recordings
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
