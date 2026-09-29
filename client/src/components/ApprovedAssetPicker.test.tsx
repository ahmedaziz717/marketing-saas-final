// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./ChannelConnections', () => ({channelInput:'input'}));
import { ApprovedAssetPicker } from './ApprovedAssetPicker';
afterEach(cleanup);
it('shows compatible approved thumbnails and submits the chosen carousel order', () => {
 const assets = ['One','Two','Pending','Portrait'].map((name,i) => ({key:`asset:${i+1}`,name,state:i===2?'draft':'approved',purpose:'finished',mediaType:'image',width:1080,height:i===3?1350:1080,url:`/image-${i}.png`})) as any;
 const choose=vi.fn();
 render(<ApprovedAssetPicker assets={assets} channel="meta_ads" multiple selected={[]} onSelect={choose} onClose={()=>{}} />);
 expect(screen.queryByText('Pending')).toBeNull();
 expect(screen.queryByText('Portrait')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:/Two/}));
 expect((screen.getByRole('button',{name:'Use selected assets'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:/One/}));
 fireEvent.click(screen.getByRole('button',{name:'Use selected assets'}));
 expect(choose).toHaveBeenCalledWith(['asset:2','asset:1']);
});
