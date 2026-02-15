import { useState } from "react";
import { useDocuments } from "@/hooks/use-documents";
import { useCompareDocuments } from "@/hooks/use-analysis";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { GitCompare, ArrowRight, Plus, Minus, Edit } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ComparePage() {
  const { data: documents, isLoading } = useDocuments();
  const { mutate: compare, data: comparison, isPending } = useCompareDocuments();
  const [baseId, setBaseId] = useState("");
  const [compareId, setCompareId] = useState("");

  const handleCompare = () => {
    if (baseId && compareId && baseId !== compareId) {
      compare({ baseId, compareId });
    }
  };

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-display text-slate-900">Version Comparison</h1>
        <p className="text-slate-500 mt-1">Compare two document versions to see added, removed, or modified clauses.</p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Select Documents
          </CardTitle>
          <CardDescription>Choose two documents to compare. Results show risk impact and clause changes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Version 1 (base)</label>
            <Select value={baseId} onValueChange={setBaseId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select document" />
              </SelectTrigger>
              <SelectContent>
                {documents?.map((doc) => (
                  <SelectItem key={doc._id} value={doc._id}>
                    {doc.documentName} (v{doc.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-400 hidden sm:block" />
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Version 2 (compare)</label>
            <Select value={compareId} onValueChange={setCompareId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select document" />
              </SelectTrigger>
              <SelectContent>
                {documents?.map((doc) => (
                  <SelectItem key={doc._id} value={doc._id}>
                    {doc.documentName} (v{doc.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleCompare} disabled={isPending || !baseId || !compareId || baseId === compareId}>
            {isPending ? "Comparing..." : "Compare"}
          </Button>
        </CardContent>
      </Card>

      {comparison?.differences && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Comparison Result</CardTitle>
            <CardDescription>{comparison.differences.length} difference(s) found.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {comparison.differences.map((diff: { type: string; description: string; originalText?: string; newText?: string; riskImpact?: string }, i: number) => (
              <div
                key={i}
                className={cn(
                  "p-4 rounded-xl border",
                  diff.type === "addition" && "border-green-200 bg-green-50/50",
                  diff.type === "deletion" && "border-red-200 bg-red-50/50",
                  diff.type === "modification" && "border-amber-200 bg-amber-50/50"
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  {diff.type === "addition" && <Plus className="h-4 w-4 text-green-600" />}
                  {diff.type === "deletion" && <Minus className="h-4 w-4 text-red-600" />}
                  {diff.type === "modification" && <Edit className="h-4 w-4 text-amber-600" />}
                  <span className="font-medium capitalize">{diff.type}</span>
                  {diff.riskImpact && diff.riskImpact !== "none" && (
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded",
                      diff.riskImpact === "increased" && "bg-red-100 text-red-700",
                      diff.riskImpact === "decreased" && "bg-green-100 text-green-700"
                    )}>
                      Risk {diff.riskImpact}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-700">{diff.description}</p>
                {diff.originalText && (
                  <div className="mt-2 text-xs text-slate-500 bg-white/80 p-2 rounded border border-slate-100">
                    <span className="font-medium">Original:</span> {diff.originalText.slice(0, 200)}...
                  </div>
                )}
                {diff.newText && (
                  <div className="mt-1 text-xs text-slate-500 bg-white/80 p-2 rounded border border-slate-100">
                    <span className="font-medium">New:</span> {diff.newText.slice(0, 200)}...
                  </div>
                )}
              </div>
            ))}
            {comparison.differences.length === 0 && (
              <p className="text-slate-500 text-center py-8">No significant differences detected.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
