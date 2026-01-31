export default function TracesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Weave Traces</h1>
          <p className="text-sm text-gray-500 mt-1">End-to-end observability and debugging</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center text-gray-500">
            <p className="text-lg font-medium mb-2">No traces yet</p>
            <p className="text-sm">
              Agent execution traces with full spans will be logged here via Weave
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
