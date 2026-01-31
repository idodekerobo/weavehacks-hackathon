export default function RunsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Live Runs</h1>
          <p className="text-sm text-gray-500 mt-1">Agent processing runs with Weave traces</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center text-gray-500">
            <p className="text-lg font-medium mb-2">No runs yet</p>
            <p className="text-sm">
              When photos are processed, runs will appear here with links to Weave traces
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
