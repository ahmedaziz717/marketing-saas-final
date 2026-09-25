// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./CatalogEntryForm', () => ({CatalogEntryForm: () => null}));
vi.mock('@/lib/trpc', () => ({trpc: {
 useUtils: () => ({}),
 catalogSources: {list:{useQuery:()=>({data:[]})}, connect:{useMutation:()=>({})},action:{useMutation:()=>({})},addEntries:{useMutation:()=>({})}},
 crawl:{latest:{useQuery:()=>({data:{status:'review_ready',sourceOrigin:'https://store.example',pagesProcessed:250,pagesDiscovered:250}})}},
 catalog:{overview:{useQuery:()=>({data:{total:485}})}}
}}));
import { CatalogSources } from './CatalogSources';
afterEach(cleanup);
it('labels accumulated catalog items separately from the latest scan page count', () => {
 render(<CatalogSources organizationId={1} />);
 expect(screen.getByText('485')).toBeTruthy();
 expect(screen.getByText(/250 \/ 250 pages read in this scan/)).toBeTruthy();
 expect(screen.getByText(/Total catalog · All imports and sources/)).toBeTruthy();
});
it('keeps import actions in Catalog when reused in Integrations', () => {
 render(<CatalogSources organizationId={1} storesOnly />);
 expect(screen.queryByText('Scan website')).toBeNull();
 expect(screen.queryByText('Import CSV')).toBeNull();
 expect(screen.getByRole('button',{name:'Connect Shopify'})).toBeTruthy();
});
