import { useDocuments } from "@/hooks/use-documents";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus, ArrowUpRight, FileText, AlertTriangle, CheckCircle } from "lucide-react";
import { RiskBadge } from "@/components/RiskBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { 
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle 
} from "@/components/ui/card";

export default function Dashboard() {
  const { data: documents, isLoading } = useDocuments();

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Calculate simple stats
  const totalDocs = documents?.length || 0;
  const highRiskDocs = documents?.filter(d => (d.riskScore || 0) > 75).length || 0;
  const processedDocs = documents?.filter(d => d.extractedData).length || 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Overview of your document security posture.</p>
        </div>
        <Link href="/documents">
          <Button className="shadow-lg shadow-primary/20">
            <Plus className="mr-2 h-4 w-4" />
            New Document
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard 
          title="Total Documents" 
          value={totalDocs} 
          icon={FileText}
          trend="+12% this month"
          color="bg-blue-50 text-blue-700"
        />
        <StatsCard 
          title="High Risk Detected" 
          value={highRiskDocs} 
          icon={AlertTriangle}
          trend="Requires attention"
          color="bg-red-50 text-red-700"
        />
        <StatsCard 
          title="Processed Successfully" 
          value={processedDocs} 
          icon={CheckCircle}
          trend="98% accuracy"
          color="bg-green-50 text-green-700"
        />
      </div>

      {/* Recent Documents Section */}
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold font-display text-slate-900">Recent Documents</h2>
            <Link href="/documents" className="text-sm font-medium text-primary hover:text-primary/80 flex items-center">
              View All <ArrowUpRight className="ml-1 h-3 w-3" />
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Uploaded</th>
                    <th className="px-6 py-4">Risk Status</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documents?.slice(0, 5).map((doc) => (
                    <tr key={doc._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                            <FileText className="h-4 w-4" />
                          </div>
                          {doc.documentName}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {doc.uploadDate ? format(new Date(doc.uploadDate), 'MMM d, yyyy') : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <RiskBadge score={doc.riskScore || 0} size="sm" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/documents/${doc._id}`}>
                          <Button variant="ghost" size="sm" className="h-8">View</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {(!documents || documents.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                        No documents found. Upload one to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>


      </div>
    </div>
  );
}

function StatsCard({ title, value, icon: Icon, trend, color }: any) {
  return (
    <Card className="border-slate-200 shadow-sm hover:shadow-md transition-all duration-300">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-2.5 rounded-xl ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
            {trend}
          </span>
        </div>
        <div className="space-y-1">
          <h3 className="text-3xl font-bold font-display text-slate-900">{value}</h3>
          <p className="text-sm font-medium text-slate-500">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
      </div>
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  );
}
