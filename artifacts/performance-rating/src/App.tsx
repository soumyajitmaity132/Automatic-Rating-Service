import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { setupFetchInterceptor } from "@/lib/fetch-interceptor";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import SubmitRating from "@/pages/submit-rating";
import MyTeam from "@/pages/my-team";
import ApproveRatings from "@/pages/approve-ratings";
import ManageTeam from "./pages/manage-team";
import RateTLs from "@/pages/rate-tls";
import ReassignLeads from "@/pages/reassign-leads";
import FinalApprovals from "@/pages/final-approvals";
import ManageKPIs from "@/pages/manage-kpis";
import ManageLeads from "@/pages/manage-leads";

setupFetchInterceptor();

// Set up auth token getter for API client
setAuthTokenGetter(() => {
  return localStorage.getItem("token");
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/dashboard" />} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/submit-rating" component={SubmitRating} />
      <Route path="/my-team" component={MyTeam} />
      <Route path="/approve-ratings" component={ApproveRatings} />
      <Route path="/manage-team" component={ManageTeam} />
      <Route path="/rate-tls" component={RateTLs} />
      <Route path="/reassign-leads" component={ReassignLeads} />
      <Route path="/final-approvals" component={FinalApprovals} />
      <Route path="/manage-kpis" component={ManageKPIs} />
      <Route path="/manage-leads" component={ManageLeads} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
