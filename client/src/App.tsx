import PlatformAdminPage, {
  AccountInvitePage,
} from "./pages/PlatformAdminPage";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch, useLocation, useSearch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import ProductOverviewPage from "./pages/ProductOverviewPage";
import PlannedFeaturePage from "./pages/PlannedFeaturePage";
import CreativeWorkflowsPage from "./pages/CreativeWorkflowsPage";
import { PRODUCT_FEATURES } from "@shared/frameProduct";
import PlatformWebsitePage from "./pages/PlatformWebsitePage";
import Home from "./pages/Home";
import WorkspaceApp from "./pages/WorkspaceApp";
import BrandWorkspacePage from "./pages/BrandWorkspacePage";
import BriefsPage from "./pages/BriefsPage";
import CreativesPage from "./pages/CreativesPage";
import AssetLibraryPage from "./pages/AssetLibraryPage";
import SettingsPage from "./pages/SettingsPage";
import InvitePage from "./pages/InvitePage";
import SocialMediaPage from "./pages/SocialMediaPage";
import AdvertisingPage from "./pages/AdvertisingPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import LegacyPublishingPage from "./pages/LegacyPublishingPage";
import PublishingPage from "./pages/PublishingPage";
import { GlobalQueryFeedback } from "./components/GlobalQueryFeedback";
import CatalogPage from "./pages/CatalogPage";
import WebsiteImportPage from "./pages/WebsiteImportPage";
import LoginPage from "./pages/LoginPage";

function SettingsRedirect({ to }: { to: string }) {
  const query = new URLSearchParams(useSearch());
  return <Redirect to={`${to}${query.size ? `?${query}` : ""}`} replace />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login">
        <LoginPage />
      </Route>
      <Route path="/signup">
        <LoginPage signup />
      </Route>
      <Route path="/reset-password">
        <LoginPage resetPassword />
      </Route>
      <Route path="/admin" component={PlatformAdminPage} />
      <Route path="/admin/website" component={PlatformWebsitePage} />
      <Route path="/admin/:section" component={PlatformAdminPage} />
      <Route path="/account-invite/:token" component={AccountInvitePage} />
      <Route path="/app" component={WorkspaceApp} />
      <Route path="/app/platform/website">
        <Redirect to="/admin/website" />
      </Route>
      <Route path="/app/plans" component={BriefsPage} />
      <Route path="/app/briefs" component={BriefsPage} />
      <Route path="/app/roadmap" component={ProductOverviewPage} />
      <Route path="/app/creatives" component={CreativesPage} />
      <Route path="/app/creatives/overview" component={CreativesPage} />
      <Route path="/app/creatives/workflows">
        <CreativeWorkflowsPage />
      </Route>
      {["images", "video", "ads", "social", "saved", "ugc", "drafts"].map(
        view => (
          <Route
            key={view}
            path={"/app/creatives/" + view}
            component={CreativesPage}
          />
        )
      )}
      <Route path="/app/activate/workflows">
        <CreativeWorkflowsPage family="activate" />
      </Route>
      <Route path="/app/activate/automations">
        <Redirect to="/app/activate/workflows" />
      </Route>
      <Route path="/app/measure/workflows">
        <CreativeWorkflowsPage family="measure" />
      </Route>
      <Route path="/app/optimize/workflows">
        <CreativeWorkflowsPage family="optimize" />
      </Route>
      <Route path="/app/optimize">
        <CreativeWorkflowsPage family="optimize" />
      </Route>
      {PRODUCT_FEATURES.filter(
        feature => feature.availability === "planned"
      ).map(feature => (
        <Route
          key={feature.id}
          path={feature.href}
          component={PlannedFeaturePage}
        />
      ))}
      <Route path="/app/library" component={AssetLibraryPage} />
      <Route path="/app/social" component={ProductOverviewPage} />
      <Route path="/app/social/facebook" component={SocialMediaPage} />
      <Route path="/app/advertising" component={ProductOverviewPage} />
      <Route
        path="/app/advertising/meta/legacy"
        component={LegacyPublishingPage}
      />
      <Route path="/app/advertising/meta" component={AdvertisingPage} />
      <Route path="/app/analytics" component={AnalyticsPage} />
      <Route path="/app/analytics/advertising" component={AnalyticsPage} />
      <Route path="/app/analytics/social" component={AnalyticsPage} />
      <Route path="/app/publishing" component={PublishingPage} />
      <Route path="/app/brand" component={BrandWorkspacePage} />
      <Route path="/app/settings/company">
        <SettingsRedirect to="/app/brand" />
      </Route>
      <Route path="/app/integrations">
        <Redirect to="/app/settings/integrations" replace />
      </Route>
      <Route path="/app/catalog">
        <SettingsRedirect to="/app/settings/catalog" />
      </Route>
      <Route path="/app/import">
        <SettingsRedirect to="/app/settings/catalog/import" />
      </Route>
      <Route path="/app/activity">
        <Redirect to="/app/settings/activity" replace />
      </Route>
      <Route path="/app/settings" component={SettingsPage} />
      <Route
        path="/app/settings/catalog/import"
        component={WebsiteImportPage}
      />
      <Route path="/app/settings/catalog" component={CatalogPage} />
      <Route path="/app/settings/:section" component={SettingsPage} />
      <Route path="/invite/:token" component={InvitePage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}
export default function App() {
  const [path] = useLocation();
  const workspace =
    path === "/app" ||
    path.startsWith("/app/") ||
    path === "/admin" ||
    path.startsWith("/admin/");
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" switchable={workspace}>
        <TooltipProvider>
          <Toaster />
          <GlobalQueryFeedback />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
