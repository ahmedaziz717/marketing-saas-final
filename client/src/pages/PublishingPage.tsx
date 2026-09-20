import { WorkspaceGate } from '@/components/WorkspaceGate';
import { PageHeader } from '@/components/PageHeader';
import { PublishingCalendar } from '@/components/PublishingCalendar';
export default function PublishingPage() { return <WorkspaceGate><PageHeader eyebrow="Cross-channel workflow" title="Publishing" description="Plan, approve and schedule organic posts and paid creative delivery. Weekly by default, with future weeks and months available." /><PublishingCalendar /></WorkspaceGate>; }
