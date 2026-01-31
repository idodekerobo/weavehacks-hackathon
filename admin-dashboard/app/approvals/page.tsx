export default function ApprovalsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Approvals Inbox</h1>
          <p className="text-sm text-gray-500 mt-1">Human-in-the-loop approval requests</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center text-gray-500">
            <p className="text-lg font-medium mb-2">No pending approvals</p>
            <p className="text-sm">
              Actions requiring approval (RSVP, calendar events) will appear here
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
