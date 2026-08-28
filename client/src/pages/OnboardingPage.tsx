import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Check, Copy, Sparkles, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function OnboardingPage() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [colors, setColors] = useState("#17151C, #F5F1E9, #6C3CFF");
  const [fonts, setFonts] = useState("Manrope, Instrument Serif");
  const [voice, setVoice] = useState("");
  const [claims, setClaims] = useState("");
  const [prohibited, setProhibited] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "creator" | "reviewer" | "publisher">("creator");
  const createWorkspace = trpc.workspace.create.useMutation();
  const updateBrand = trpc.brand.update.useMutation();
  const createInvite = trpc.workspace.createInvite.useMutation();

  const create = async () => {
    try {
      const result = await createWorkspace.mutateAsync({ name: workspaceName });
      setOrganizationId(result.organizationId);
      setBrandName(`${workspaceName} Brand`);
      setStep(2);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create workspace"); }
  };

  const saveBrand = async () => {
    if (!organizationId) return;
    try {
      await updateBrand.mutateAsync({ organizationId, name: brandName, colors: colors.split(",").map(v => v.trim()).filter(Boolean), fonts: fonts.split(",").map(v => v.trim()).filter(Boolean), voice, requiredClaims: claims, prohibitedContent: prohibited, activate: true });
      setStep(3);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save brand kit"); }
  };

  const finish = async () => {
    await utils.workspace.mine.invalidate();
    toast.success("Your workspace is ready");
    setLocation("/app/brand");
  };

  const inviteAndFinish = async () => {
    if (!organizationId || !inviteEmail) return;
    try {
      const result = await createInvite.mutateAsync({ organizationId, email: inviteEmail, role: inviteRole, origin: window.location.origin });
      await navigator.clipboard.writeText(result.inviteUrl);
      toast.success("Invite link copied");
      await finish();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create invitation"); }
  };

  return <div className="mx-auto max-w-5xl py-8 md:py-14">
    <div className="mb-10 flex items-center justify-between"><div><p className="eyebrow">Workspace setup</p><h1 className="mt-3 font-editorial text-5xl leading-none md:text-7xl">Build your creative frame.</h1></div><div className="hidden items-center gap-2 sm:flex">{[1, 2, 3].map(n => <div key={n} className={`grid h-9 w-9 place-items-center rounded-full text-sm font-semibold ${step >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{step > n ? <Check className="h-4 w-4" /> : n}</div>)}</div></div>
    <div className="surface grid overflow-hidden lg:grid-cols-[.72fr_1.28fr]"><aside className="bg-[#201c25] p-8 text-white md:p-10"><Sparkles className="h-5 w-5 text-violet-300" /><h2 className="mt-8 font-editorial text-4xl leading-none">A governed creative system begins with clear inputs.</h2><p className="mt-5 text-sm leading-6 text-white/55">Your brand kit and team roles become the operating system for every concept Frame generates.</p><div className="mt-12 space-y-5 text-sm">{["Organization and owner role", "Brand identity and policy", "Invite a role-bound teammate"].map((label, i) => <div key={label} className="flex gap-3"><span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${step > i ? "bg-emerald-400 text-emerald-950" : "bg-white/10 text-white/60"}`}>{i + 1}</span><span className="text-white/70">{label}</span></div>)}</div></aside>
      <div className="p-7 md:p-10 lg:p-14">
        {step === 1 && <div><p className="eyebrow">Step 1 of 3</p><h3 className="mt-3 text-2xl font-semibold tracking-tight">Name your organization</h3><p className="mt-2 text-sm text-muted-foreground">You begin as the workspace owner and can invite your team next.</p><div className="mt-8"><Label htmlFor="workspace">Workspace name</Label><Input id="workspace" className="mt-2 h-12" value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} placeholder="Acme Creative Studio" /></div><Button className="mt-8 h-12 rounded-full px-6" onClick={create} disabled={workspaceName.trim().length < 2 || createWorkspace.isPending}>Continue to brand kit<ArrowRight className="ml-2 h-4 w-4" /></Button></div>}
        {step === 2 && <div><p className="eyebrow">Step 2 of 3</p><h3 className="mt-3 text-2xl font-semibold tracking-tight">Establish the brand truth</h3><div className="mt-7 grid gap-5 sm:grid-cols-2"><div><Label>Brand name</Label><Input className="mt-2" value={brandName} onChange={e => setBrandName(e.target.value)} /></div><div><Label>Colors</Label><Input className="mt-2" value={colors} onChange={e => setColors(e.target.value)} /></div><div className="sm:col-span-2"><Label>Fonts</Label><Input className="mt-2" value={fonts} onChange={e => setFonts(e.target.value)} /></div><div className="sm:col-span-2"><Label>Brand voice</Label><Textarea className="mt-2 min-h-24" value={voice} onChange={e => setVoice(e.target.value)} placeholder="Precise, confident, warm..." /></div><div><Label>Required claims</Label><Textarea className="mt-2 min-h-24" value={claims} onChange={e => setClaims(e.target.value)} /></div><div><Label>Prohibited content</Label><Textarea className="mt-2 min-h-24" value={prohibited} onChange={e => setProhibited(e.target.value)} /></div></div><Button className="mt-7 h-12 rounded-full px-6" onClick={saveBrand} disabled={!brandName || updateBrand.isPending}>Activate brand kit<ArrowRight className="ml-2 h-4 w-4" /></Button></div>}
        {step === 3 && <div><p className="eyebrow">Step 3 of 3</p><h3 className="mt-3 text-2xl font-semibold tracking-tight">Define the first team role</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Invite a teammate now, or skip and manage the team later. The link is bound to the selected role and invited email.</p><div className="mt-7 grid gap-5 sm:grid-cols-[1fr_180px]"><div><Label>Teammate email</Label><Input className="mt-2" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="teammate@company.com" /></div><div><Label>Role</Label><Select value={inviteRole} onValueChange={value => setInviteRole(value as typeof inviteRole)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="creator">Creator</SelectItem><SelectItem value="reviewer">Reviewer</SelectItem><SelectItem value="publisher">Publisher</SelectItem></SelectContent></Select></div></div><div className="mt-7 flex flex-wrap gap-3"><Button onClick={inviteAndFinish} disabled={!inviteEmail || createInvite.isPending} className="rounded-full"><UserPlus className="mr-2 h-4 w-4" />Invite & finish</Button><Button variant="outline" onClick={finish} className="rounded-full">Skip for now</Button></div><div className="mt-6 flex items-center gap-2 rounded-2xl bg-muted/60 p-4 text-xs text-muted-foreground"><Copy className="h-4 w-4 text-primary" />Invite links are copied to your clipboard and expire after seven days.</div></div>}
      </div></div>
  </div>;
}
