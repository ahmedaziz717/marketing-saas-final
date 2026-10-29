import { useState } from "react";
import { accountInitials, safeAccountImage } from "@shared/accountIdentity";
import { trpc } from "@/lib/trpc";
export function ConnectedAccountIdentity({
  organizationId,
  id,
  name,
  imageUrl,
  source,
}: {
  organizationId: number;
  id: string;
  name: string;
  imageUrl?: string;
  source?: "page" | "business";
}) {
  const picture = trpc.channels.accountImage.useQuery(
    { organizationId, id },
    { staleTime: 15 * 60000, retry: false }
  );
  return (
    <AccountIdentity
      name={name}
      imageUrl={picture.data?.imageUrl || imageUrl}
      source={picture.data?.imageSource || source}
    />
  );
}
export function AccountIdentity({
  name,
  imageUrl,
  source,
}: {
  name: string;
  imageUrl?: string;
  source?: "page" | "business";
}) {
  const [failed, setFailed] = useState<string>();
  const url = safeAccountImage(imageUrl);
  return (
    <span
      className="account-identity"
      title={
        url && failed !== url
          ? `${source === "business" ? "Business" : "Account"} photo`
          : `${name} · no account photo supplied`
      }
    >
      {url && failed !== url ? (
        <img
          src={url}
          alt={`${name} ${source === "business" ? "business" : "account"} photo`}
          onError={() => setFailed(url)}
        />
      ) : (
        <span aria-label={name}>{accountInitials(name)}</span>
      )}
    </span>
  );
}
