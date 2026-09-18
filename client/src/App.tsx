import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import WorkspaceApp from "./pages/WorkspaceApp";
import BrandPage from "./pages/BrandPage";
import BriefsPage from "./pages/BriefsPage";
import CreativesPage from "./pages/CreativesPage";
import SettingsPage from "./pages/SettingsPage";
import InvitePage from "./pages/InvitePage";
import PublishingPage from "./pages/PublishingPage";
import { GlobalQueryFeedback } from "./components/GlobalQueryFeedback";
import CatalogPage from "./pages/CatalogPage";
import WebsiteImportPage from "./pages/WebsiteImportPage";
import LoginPage from "./pages/LoginPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login">
        <LoginPage />
      </Route>
      <Route path="/reset-password">
        <LoginPage resetPassword />
      </Route>
      <Route path="/app" component={WorkspaceApp} />
      <Route path="/app/briefs" component={BriefsPage} />
      <Route path="/app/creatives" component={CreativesPage} />
      <Route path="/app/publishing" component={PublishingPage} />
      <Route path="/app/brand" component={BrandPage} />
      <Route path="/app/integrations">
        <Redirect to="/app/settings/integrations" replace />
      </Route>
      <Route path="/app/catalog" component={CatalogPage} />
      <Route path="/app/import" component={WebsiteImportPage} />
      <Route path="/app/activity">
        <Redirect to="/app/settings/activity" replace />
      </Route>
      <Route path="/app/settings" component={SettingsPage} />
      <Route path="/app/settings/:section" component={SettingsPage} />
      <Route path="/invite/:token" component={InvitePage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <GlobalQueryFeedback />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
