import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import { useListApprovals, useUpdateApproval, RatingQuarter } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ShieldCheck, CheckCircle, XCircle } from "lucide-react";

function ratingLabel(v: number): string {
  if (v >= 4.5) return "Exceptional";
  if (v >= 4.0) return "Exceeds Expectations";
  if (v >= 3.0) return "Meets Expectations";
  if (v >= 2.0) return "Improvement Needed";
  return "Unsatisfactory";
}

export default function FinalApprovals() {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currentYear = new Date().getFullYear();
  const [quarter, setQuarter] = useState<RatingQuarter>(RatingQuarter.Q1);
  const [year, setYear] = useState<number>(currentYear);

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
    if (!isLoading && user && user.role !== "Manager") setLocation("/dashboard");
  }, [isLoading, token, user, setLocation]);

  const { data: approvals, isLoading: loadingApprovals } = useListApprovals(
    { quarter, year },
    { query: { enabled: !!user } }
  );

  const { mutate: updateApproval, isPending } = useUpdateApproval();

  const handleFinal = (approvalId: number, status: "Approved" | "Rejected") => {
    updateApproval({ approvalId, data: { finalLgtmStatus: status } }, {
      onSuccess: () => {
        toast({ title: `Final approval ${status === "Approved" ? "granted" : "rejected"}` });
        queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      }
    });
  };

  const pendingApprovals = approvals?.filter(a => a.finalLgtmStatus === "Pending" && a.tlLgtmStatus === "Approved") ?? [];
  const completedApprovals = approvals?.filter(a => a.finalLgtmStatus !== "Pending") ?? [];

  if (isLoading || !user) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-5 rounded-2xl shadow-sm border border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Final Approvals</h1>
              <p className="text-muted-foreground text-sm">
                {pendingApprovals.length} pending · {completedApprovals.length} completed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={quarter} onValueChange={(v) => setQuarter(v as RatingQuarter)}>
              <SelectTrigger className="w-[110px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["Q1","Q2","Q3","Q4"] as const).map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
              <SelectTrigger className="w-[100px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Pending Queue */}
        {loadingApprovals ? (
          <div className="text-center py-12 text-muted-foreground">Loading approvals...</div>
        ) : pendingApprovals.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <ShieldCheck className="w-14 h-14 mx-auto text-emerald-500 mb-3" />
            <h3 className="text-lg font-semibold mb-1">Queue Empty</h3>
            <p className="text-muted-foreground">All TL-approved ratings have been processed.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="px-5 py-3 bg-amber-50/50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{pendingApprovals.length} items awaiting final decision</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-secondary/40 uppercase">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Employee</th>
                    <th className="px-5 py-3 text-left font-medium">KPI</th>
                    <th className="px-5 py-3 text-center font-medium">Self</th>
                    <th className="px-5 py-3 text-center font-medium">TL Rating</th>
                    <th className="px-5 py-3 text-center font-medium">Label</th>
                    <th className="px-5 py-3 text-right font-medium">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {pendingApprovals.map(a => (
                    <tr key={a.approvalId} className="bg-card hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-4 font-semibold">{a.ratedUserName}</td>
                      <td className="px-5 py-4 text-muted-foreground">{a.itemName}</td>
                      <td className="px-5 py-4 text-center font-mono">{a.selfRatingValue?.toFixed(1) ?? "—"}</td>
                      <td className="px-5 py-4 text-center font-bold text-primary font-mono">{a.tlRatingValue?.toFixed(1) ?? "—"}</td>
                      <td className="px-5 py-4 text-center text-xs text-muted-foreground">
                        {a.tlRatingValue ? ratingLabel(a.tlRatingValue) : "—"}
                      </td>
                      <td className="px-5 py-4 text-right space-x-2">
                        <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => handleFinal(a.approvalId, "Approved")} disabled={isPending}>
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/10" onClick={() => handleFinal(a.approvalId, "Rejected")} disabled={isPending}>
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Completed */}
        {completedApprovals.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-muted-foreground">Completed ({completedApprovals.length})</h2>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground bg-secondary/40 uppercase">
                    <tr>
                      <th className="px-5 py-3 text-left font-medium">Employee</th>
                      <th className="px-5 py-3 text-left font-medium">KPI</th>
                      <th className="px-5 py-3 text-center font-medium">TL Rating</th>
                      <th className="px-5 py-3 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {completedApprovals.map(a => (
                      <tr key={a.approvalId} className="bg-card">
                        <td className="px-5 py-3 font-medium">{a.ratedUserName}</td>
                        <td className="px-5 py-3 text-muted-foreground">{a.itemName}</td>
                        <td className="px-5 py-3 text-center font-mono">{a.tlRatingValue?.toFixed(1) ?? "—"}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            a.finalLgtmStatus === "Approved"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          }`}>
                            {a.finalLgtmStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
