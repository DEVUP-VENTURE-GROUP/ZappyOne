# Brand logos

Drop a brand's logo here as `<brandCode>.svg` (or `.png` / `.webp`) and the
catalog picks it up automatically — no code change, no rebuild config.

The filename **must** match the brand's `code` in the Brand collection:

```
apple.svg        →  Apple          (mobile)
apple-mac.svg    →  Apple          (laptop — different brand doc, different code)
samsung.svg      →  Samsung
oneplus.svg      →  OnePlus
maruti.svg       →  Maruti Suzuki  (car)
royalenfield.svg →  Royal Enfield  (bike)
```

Get the current codes with:

```bash
curl -s "http://localhost:4000/api/catalog/services/brands?category=mobile" | python3 -m json.tool
```

## Resolution order

`components/catalog/BrandLogo.jsx` tries, in order:

1. a file in this folder matching the brand code
2. the brand's `logoUrl` field, if it points at a real logo asset
3. a typographic wordmark of the brand name

Tier 2 currently skips `images.unsplash.com` URLs, because the seed data
(`server/src/scripts/seed-dynamic-phone-catalog.js`) filled every `logoUrl`
with a stock *photo of a phone* rather than a brand mark. Either put files
here, or update `logoUrl` on each brand through the admin catalog API
(`POST /api/catalog/admin/brands`) — both paths work, and the filter in
`BrandLogo.jsx` can be dropped once the seed URLs are real.

## Format notes

- SVG preferred; it stays crisp on every screen and is usually a few KB.
- Trim surrounding whitespace so tiles optically align — the tile applies its
  own padding.
- Single-colour marks work best on the white tile; avoid baked-in backgrounds.
- Adding a brand that isn't in the catalog yet? Create the Brand document
  first, otherwise the file here is never referenced — the grid only ever
  renders brands the API returns.
