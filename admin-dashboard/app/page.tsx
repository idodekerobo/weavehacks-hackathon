import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-xl font-bold">📸</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Photos Agent</h1>
                <p className="text-sm text-gray-500">Admin Dashboard</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                System Online
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* System Health Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Agent Status" value="Ready" status="success" />
          <StatCard title="Queue" value="0 pending" status="info" />
          <StatCard title="Tunnel" value="Offline" status="warning" />
          <StatCard title="Redis" value="Not Connected" status="error" />
        </div>

        {/* Main Dashboard Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live Runs */}
          <DashboardCard
            title="Live Runs"
            description="Recent agent processing runs"
            href="/runs"
          >
            <div className="text-center py-8 text-gray-500">
              <p>No active runs</p>
              <p className="text-sm mt-2">Process a photo to see runs here</p>
            </div>
          </DashboardCard>

          {/* Approvals Inbox */}
          <DashboardCard
            title="Approvals Inbox"
            description="Pending human-in-the-loop approvals"
            href="/approvals"
          >
            <div className="text-center py-8 text-gray-500">
              <p>No pending approvals</p>
              <p className="text-sm mt-2">Actions requiring approval will appear here</p>
            </div>
          </DashboardCard>

          {/* Browser Sessions */}
          <DashboardCard
            title="Browser Sessions"
            description="Browserbase automation sessions"
            href="/sessions"
          >
            <div className="text-center py-8 text-gray-500">
              <p>No active sessions</p>
              <p className="text-sm mt-2">Browserbase sessions will appear here</p>
            </div>
          </DashboardCard>

          {/* Weave Traces */}
          <DashboardCard
            title="Weave Traces"
            description="Observability and debugging"
            href="/traces"
          >
            <div className="text-center py-8 text-gray-500">
              <p>No traces yet</p>
              <p className="text-sm mt-2">Agent traces will be logged here</p>
            </div>
          </DashboardCard>
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, status }: { title: string; value: string; status: 'success' | 'info' | 'warning' | 'error' }) {
  const statusColors = {
    success: 'bg-green-50 border-green-200',
    info: 'bg-blue-50 border-blue-200',
    warning: 'bg-yellow-50 border-yellow-200',
    error: 'bg-red-50 border-red-200'
  };

  const textColors = {
    success: 'text-green-700',
    info: 'text-blue-700',
    warning: 'text-yellow-700',
    error: 'text-red-700'
  };

  return (
    <div className={`bg-white rounded-lg border-2 ${statusColors[status]} p-6`}>
      <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
      <p className={`text-2xl font-bold ${textColors[status]}`}>{value}</p>
    </div>
  );
}

function DashboardCard({ title, description, href, children }: { title: string; description: string; href: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        <Link
          href={href}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          View all →
        </Link>
      </div>
      <div className="px-6 py-4">
        {children}
      </div>
    </div>
  );
}
