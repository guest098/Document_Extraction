import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/Layout";
import { Loader2 } from "lucide-react";

import LandingPage from "@/pages/Landing";
import LoginPage from "@/pages/Login";
import SignupPage from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import DocumentsPage from "@/pages/Documents";
import DocumentView from "@/pages/DocumentView";
import RiskAnalysis from "@/pages/RiskAnalysis";
import ComparePage from "@/pages/Compare";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  // Only show loading spinner on initial load (when there's no cached data)
  // After first load, cached data will be used immediately
  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/">
        {isAuthenticated ? <Redirect to="/dashboard" /> : <LandingPage />}
      </Route>
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />

      {/* Protected Routes */}
      <Route path="/dashboard">
        {isAuthenticated ? (
          <Layout>
            <Dashboard />
          </Layout>
        ) : (
          <Redirect to="/" />
        )}
      </Route>
      <Route path="/documents">
        {isAuthenticated ? (
          <Layout>
            <DocumentsPage />
          </Layout>
        ) : (
          <Redirect to="/" />
        )}
      </Route>
      <Route path="/documents/:id">
        {isAuthenticated ? (
          <Layout>
            <DocumentView />
          </Layout>
        ) : (
          <Redirect to="/" />
        )}
      </Route>
      <Route path="/risk">
        {isAuthenticated ? (
          <Layout>
            <RiskAnalysis />
          </Layout>
        ) : (
          <Redirect to="/" />
        )}
      </Route>
      <Route path="/compare">
        {isAuthenticated ? (
          <Layout>
            <ComparePage />
          </Layout>
        ) : (
          <Redirect to="/" />
        )}
      </Route>
      
      {/* Fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
