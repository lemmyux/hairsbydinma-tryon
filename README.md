# HairsbyDinma · Try-on prototype

A static site with no build step: `index.html`, `styles.css`, `app.js` and an `assets/` folder.

## Run it
Open the folder with any static server, for example:

```bash
npx serve hairsbydinma-tryon
```

## Add or replace a hair
1. Add a single-wig photo (square, plain background): `assets/wigs/<id>.jpg`
2. Add three photos of the model wearing it, taken from the same camera position:
   `assets/views/<id>-front.jpg`, `<id>-side.jpg` (facing right), `<id>-back.jpg`
3. Add an entry to `WIGS` at the top of `app.js` (name, price, lace, categories, lengths).

The "other side" view is the side photo mirrored, so turning gives front → side → back → side.

## Prototype limits
- All images are AI-generated stand-ins. Replace them with real product photography.
- Colour and length previews are drawn in the browser by `hair-engine.js`. It finds the black hair in each photo, recolours it, and stretches or shortens it below the neck. This is an approximation: real photos of each colour and length will look more accurate.
- The colour ramps in `PALETTES` (top of `hair-engine.js`) were sampled from the colour reference photos in Figma (Section 12). Each ramp runs from the deepest shadow to the shine, nine tones. Each photo's own light and shade is matched onto that ramp. To add a colour, add a ramp there and a swatch in `COLOURS` in `app.js`.
- Blonde and Ginger are set to `null` in `PALETTES` for now: their swatches stay in the UI, but choosing them leaves the hair natural black.
- Checkout is a mock. Nothing is charged or sent. For launch, hand the bag to Shopify's cart and checkout.
