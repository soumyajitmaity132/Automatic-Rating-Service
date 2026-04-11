import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import {
  useListUsers, useListRatings, useListApprovals, useCreateApproval,
  RatingQuarter, UserProfile
} from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { UserCheck, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";

function TLPanel({ tl, quarter, year, currentUser }: {
  tl: UserProfile; quarter: RatingQuarter; year: number; currentUser: UserProfile;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tlVals, setTlVals] = useState<Record<number, string>>({});

  const { data: ratings } = useListRatings(
    { userId: tl.userId, quarter, year },
    { query: { enabled: open } }
  );
  const { data: approvals } = useListApprovals(
    { ratedUserId: tl.userId, quarter, year },
    { query: { enabled: open } }
  );

  const { mutate: createApproval, isPending } = useCreateApproval();

  const approvalByItem = new Map(approvals?.map(a => [a.itemId, a]) ?? []);
  const pendingRatings = ratings?.filter(r => {
    const a = approvalByItem.get(r.itemId);
    return !a || a.tlLgtmStatus === "Pending";
  }) ?? [];

  const handleSubmit = (itemId: number, ratedUserId: string) => {
    const rawVal = tlVals[itemId];
    const val = parseFloat(rawVal ?? "0");
    if (!rawVal || isNaN(val) || val < 0.1 || val > 5.0) {
      toast({ title: "Enter a valid rating (0.1–5.0)", variant: "destructive" });
      return;
    }
    createApproval({
      data: {
        itemId,
        teamId: tl.teamId ?? currentUser.teamId!,
        ratedUserId,
        tlRatingValue: val,
        quarter,
        year,
      }
    }, {
      onSuccess: () => {
        toast({ title: `Rating submitted for ${tl.displayName}` });
        queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
        setTlVals(prev => { const n = {...prev}; delete n[itemId]; return n; });
      }
    });
  };

  const approvedCount = approvals?.filter(a => a.tlLgtmStatus === "Approved").length ?? 0;

  return (
    <Card className="overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold">
            {tl.displayName.charAt(0)}
          </div>
          <div className="text-left">
            <p className="font-semibold">{tl.displayName}</p>
            <p className="text-sm text-muted-foreground">Team Lead · {tl.level} · {tl.teamName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {open && <span className="text-xs text-muted-foreground">{approvedCount} reviewed</span>}
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border/30 p-4 space-y-3 bg-secondary/10">
          {ratings?.length === 0 && (
            <p className="text-center text-muted-foreground py-4 text-sm">This TL has not submitted self-ratings yet.</p>
          )}
          {pendingRatings.map(rating => {
            const rawVal = tlVals[rating.itemId] ?? "";
            const numVal = parseFloat(rawVal);
            return (
              <div key={rating.ratingId} className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-sm">{rating.itemName}</h4>
                    {rating.comment && <p className="text-xs text-muted-foreground mt-0.5">{rating.comment}</p>}
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <div className="text-xs text-muted-foreground">Self</div>
                    <div className="text-lg font-bold text-primary">{rating.ratingValue?.toFixed(1)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Manager Rating — 0.1 to 5.0</Label>
                    <Input
                      type="number" min="0.1" max="5.0" step="0.1"
                      placeholder="e.g. 4.0"
                      value={rawVal}
                      onChange={e => setTlVals(prev => ({ ...prev, [rating.itemId]: e.target.value }))}
                      className="w-28 text-center font-semibold"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSubmit(rating.itemId, rating.userId)}
                    disabled={isPending || !rawVal || isNaN(numVal) || numVal < 0.1 || numVal > 5.0}
                  >
                    Submit
                  </Button>
                </div>
              </div>
            );
          })}

          {approvals?.filter(a => a.tlLgtmStatus === "Approved").map(a => (
            <div key={a.approvalId} className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-200 dark:border-emerald-800 p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{a.itemName}</p>
                <p className="text-xs text-muted-foreground">Self: {a.selfRatingValue?.toFixed(1) ?? "—"} · Mgr: {a.tlRatingValue?.toFixed(1)}</p>
              </div>
              <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Reviewed
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function RateTLs() {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const currentYear = new Date().getFullYear();
  const [quarter, setQuarter] = useState<RatingQuarter>(RatingQuarter.Q1);
  const [year, setYear] = useState<number>(currentYear);

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
    if (!isLoading && user && user.role !== "Manager") setLocation("/dashboard");
  }, [isLoading, token, user, setLocation]);

  const { data: allUsers } = useListUsers(undefined, { query: { enabled: !!user } });

  const tls = allUsers?.filter(u => u.role === "Team Lead") ?? [];

  if (isLoading || !user) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-5 rounded-2xl shadow-sm border border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-purple-700 dark:text-purple-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Rate Team Leads</h1>
              <p className="text-muted-foreground text-sm">{tls.length} Team Lead(s) to evaluate</p>
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

        <div className="space-y-3">
          {tls.length === 0 ? (
            <Card className="p-12 text-center border-dashed text-muted-foreground">No Team Leads found.</Card>
          ) : (
            tls.map(tl => (
              <TLPanel key={tl.userId} tl={tl} quarter={quarter} year={year} currentUser={user} />
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
