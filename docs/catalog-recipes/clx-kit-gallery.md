# CLX kit gallery (verified product 712)

Observed public page: https://www.clxgaming.com/pre-built-gaming-pc/gmhorrtu4b03bm

The root API record has code `gmhorrtu4b03bm`, gallery size 6 and `metadata.images.main` pointing to the 260px kit thumbnail. The site's gallery and enlarged viewer use `https://static.cybertron.com/clx/kits/gmhorrtu4b03bm/gallery/1.png` through `6.png`, each 700px square. Frame 1 matches the thumbnail view; its usable transparent cutout measures 480×666. The current thumbnail's cutout is 164×227. See the overlay investigation for hashes and source provenance.

The adjacent JSON is an opt-in recipe fragment, not an automatic production migration. `firstImageResolutionPaths` explicitly declares that the main thumbnail is another resolution of frame 1. It is not applied to any other frame. Importing that verified relationship preserves the catalog primary image ID while replacing its storage reference with the decoded larger original. Old creative versions retain their old immutable storage keys and need explicit recovery.

Release owner: use the existing bounded gallery-pilot/review workflow for **product 712** after reviewing the merged source configuration, its revision and exact planned URLs. Do not reuse product 724's chassis pilot, auto-approve products, change user drafts or automatically recover saved creatives. Check this relationship before broadening to other kit codes. No source setting or production import was changed during development.
