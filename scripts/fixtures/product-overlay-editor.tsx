import { createRoot } from "react-dom/client";
import { ProductOverlayEditor } from "../../client/src/components/ProductOverlayEditor";
createRoot(document.getElementById("root")!).render(
  <ProductOverlayEditor
    organizationId={3}
    variantId={90}
    onSaved={async () => {}}
  />
);
