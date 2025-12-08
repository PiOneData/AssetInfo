import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { QuickActionsButton } from "@/components/layout/quick-actions-button";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Assets from "@/pages/assets";
import Recommendations from "@/pages/recommendations";
import AIResponse from "@/pages/ai-response";
import Software from "@/pages/software";
import Settings from "@/pages/settings";
import Users from "@/pages/users";
import UserDetail from "@/pages/user-detail";
import Vendors from "@/pages/vendors";
import Tickets from "@/pages/tickets";
import ActivityLogs from "@/pages/activity-logs";
import Reports from "@/pages/reports";
import SearchResults from "@/pages/search-results";
import ComplianceOverviewPage from "@/pages/compliance";
import ComplianceLicensePage from "@/pages/compliance-license";
import ComplianceScoreDetails from "@/pages/compliance/ComplianceScoreDetails";
import SaasApps from "@/pages/saas-apps";
import SaasContracts from "@/pages/saas-contracts";
import IdentityProviders from "@/pages/identity-providers";
import GovernancePolicies from "@/pages/governance-policies";
import { ThemeProvider } from "@/contexts/theme-context";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/tickets">
        <ProtectedRoute requiredRole="technician">
          <Tickets />
        </ProtectedRoute>
      </Route>
      <Route path="/assets">
        <ProtectedRoute requiredRole="technician">
          <Assets />
        </ProtectedRoute>
      </Route>
      <Route path="/assets/new">
        <ProtectedRoute requiredRole="technician">
          <Assets key="new" />
        </ProtectedRoute>
      </Route>
      <Route path="/recommendations">
        <ProtectedRoute requiredRole="it-manager">
          <Recommendations />
        </ProtectedRoute>
      </Route>
      <Route path="/ai-response">
        <ProtectedRoute requiredRole="admin">
          <AIResponse />
        </ProtectedRoute>
      </Route>
      <Route path="/software">
        <ProtectedRoute requiredRole="technician">
          <Software />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute requiredRole="technician">
          <Settings />
        </ProtectedRoute>
      </Route>
      <Route path="/users">
        <ProtectedRoute requiredRole="admin">
          <Users />
        </ProtectedRoute>
      </Route>
      <Route path="/users/new">
        <ProtectedRoute requiredRole="admin">
          <Users key="new" />
        </ProtectedRoute>
      </Route>
      <Route path="/users/:userId">
        <ProtectedRoute requiredRole="admin">
          <UserDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/vendors">
        <ProtectedRoute requiredRole="technician">
          <Vendors />
        </ProtectedRoute>
      </Route>
      <Route path="/vendors/new">
        <ProtectedRoute requiredRole="technician">
          <Vendors key="new" />
        </ProtectedRoute>
      </Route>
      <Route path="/saas-apps">
        <ProtectedRoute requiredRole="technician">
          <SaasApps />
        </ProtectedRoute>
      </Route>
      <Route path="/saas-apps/new">
        <ProtectedRoute requiredRole="technician">
          <SaasApps key="new" />
        </ProtectedRoute>
      </Route>
      <Route path="/saas-contracts">
        <ProtectedRoute requiredRole="technician">
          <SaasContracts />
        </ProtectedRoute>
      </Route>
      <Route path="/saas-contracts/new">
        <ProtectedRoute requiredRole="technician">
          <SaasContracts key="new" />
        </ProtectedRoute>
      </Route>
      <Route path="/identity-providers">
        <ProtectedRoute requiredRole="admin">
          <IdentityProviders />
        </ProtectedRoute>
      </Route>
      <Route path="/identity-providers/new">
        <ProtectedRoute requiredRole="admin">
          <IdentityProviders key="new" />
        </ProtectedRoute>
      </Route>
      <Route path="/governance-policies">
        <ProtectedRoute requiredRole="admin">
          <GovernancePolicies />
        </ProtectedRoute>
      </Route>
      <Route path="/governance-policies/new">
        <ProtectedRoute requiredRole="admin">
          <GovernancePolicies key="new" />
        </ProtectedRoute>
      </Route>
      <Route path="/reports">
        <ProtectedRoute requiredRole="technician">
          <Reports />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/compliance">
        <ProtectedRoute requiredRole="technician">
          <ComplianceOverviewPage />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/compliance/score">
        <ProtectedRoute requiredRole="technician">
          <ComplianceScoreDetails />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/compliance/license">
        <ProtectedRoute requiredRole="technician">
          <ComplianceLicensePage />
        </ProtectedRoute>
      </Route>
      <Route path="/search-results">
        <ProtectedRoute requiredRole="technician">
          <SearchResults />
        </ProtectedRoute>
      </Route>
      <Route path="/activity-logs">
        <ProtectedRoute requiredRole="admin">
          <ActivityLogs />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
            <QuickActionsButton />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
