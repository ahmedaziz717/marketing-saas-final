import { WorkspaceGate } from '@/components/WorkspaceGate';
import { PageHeader } from '@/components/PageHeader';
import { PublishingCalendar } from '@/components/PublishingCalendar';
export default function PublishingPage() { return <WorkspaceGate><PageHeader eyebrow="Activate" title="Calendar" description="Choose destinations, review and approve delivery, and schedule posts and ads across your connected channels." /><PublishingCalendar /></WorkspaceGate>; }
