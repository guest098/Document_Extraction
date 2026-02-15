import { useDocuments } from "@/hooks/use-documents";
import { useRiskFlags } from "@/hooks/use-analysis";
import { Link } from "wouter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function RiskAnalysis() {
  const { data: documents, isLoading } = useDocuments();
  const { data: riskFlags, isLoading: flagsLoading } = useRiskFlags();

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div>;

  // Aggregate Data
  const riskLevels = [
    { name: "Low", value: documents?.filter(d => (d.riskScore || 0) <= 40).length || 0, color: "hsl(142 76% 36%)" },
    { name: "Medium", value: documents?.filter(d => (d.riskScore || 0) > 40 && (d.riskScore || 0) <= 75).length || 0, color: "hsl(38 92% 50%)" },
    { name: "High", value: documents?.filter(d => (d.riskScore || 0) > 75).length || 0, color: "hsl(0 84.2% 60.2%)" },
  ];

  const sortedByRisk = [...(documents || [])].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0)).slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-display text-slate-900">Risk Analysis</h1>
        <p className="text-slate-500 mt-1">Aggregate view of organizational compliance health.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Risk Distribution Chart */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle>Risk Distribution</CardTitle>
            <CardDescription>Documents by risk category</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskLevels}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {riskLevels.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6 mt-4">
              {riskLevels.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm font-medium text-slate-600">{item.name} ({item.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Highest Risk Docs */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle>Highest Risk Documents</CardTitle>
            <CardDescription>Top 5 documents requiring attention</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sortedByRisk}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis dataKey="documentName" type="category" width={100} tick={{fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: 'transparent'}}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="riskScore" fill="hsl(0 84.2% 60.2%)" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {riskFlags && riskFlags.length > 0 && (
        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle>Risk Flags (All Documents)</CardTitle>
            <CardDescription>Detected risks with regulatory mapping and suggested improvements.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200">
                  <tr className="text-left text-slate-500">
                    <th className="pb-3 font-medium">Document</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Severity</th>
                    <th className="pb-3 font-medium">Explanation</th>
                    <th className="pb-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {riskFlags.slice(0, 20).map((flag: { _id: string; documentId: string; documentName?: string; riskType: string; severity: string; explanation: string }) => (
                    <tr key={flag._id} className="hover:bg-slate-50">
                      <td className="py-3 font-medium text-slate-900">{flag.documentName || flag.documentId}</td>
                      <td className="py-3 text-slate-600">{flag.riskType}</td>
                      <td className="py-3">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          flag.severity === "high" && "bg-red-100 text-red-700",
                          flag.severity === "medium" && "bg-amber-100 text-amber-700",
                          flag.severity === "low" && "bg-green-100 text-green-700"
                        )}>
                          {flag.severity}
                        </span>
                      </td>
                      <td className="py-3 text-slate-600 max-w-xs truncate">{flag.explanation}</td>
                      <td className="py-3">
                        <Link href={`/documents/${flag.documentId}`}>
                          <Button variant="ghost" size="sm">View</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {flagsLoading && <Skeleton className="h-32 w-full mt-4" />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
