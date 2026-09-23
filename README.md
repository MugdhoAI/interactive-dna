# Interactive DNA

Interactive 3D DNA visualization built with vanilla HTML, CSS, and JavaScript.

## What it does

The project renders a procedural DNA double helix with interactive nucleobases and hydrogen bond connections.

Users can rotate the model, pan it, zoom in and out, and select individual bases or connections to view biological information.

The visual design remains intentionally lightweight and focused on the original neon molecular style.

## Scientific model

The visualization represents standard complementary DNA base pairing.

Adenine pairs with thymine through two hydrogen bonds.

Guanine pairs with cytosine through three hydrogen bonds.

Adenine and guanine are purines.

Thymine and cytosine are pyrimidines.

The model is an educational visualization rather than a molecular scale structural simulation. The glowing points represent nucleobases and the connecting lines represent hydrogen bond relationships.

## Interaction

Drag with the primary pointer to rotate the helix.

Use a right mouse drag to pan.

Use the mouse wheel or a touch pinch to zoom.

Select a glowing point or connection to open its information panel.

Keyboard users can focus a point or connection and press Enter or Space to open its information.

Press Escape to close the information panel.

Press R to reset the camera.

## Optimization work

Option B focuses on improving the existing implementation without replacing its visual identity or introducing a rendering framework.

The animation loop now uses elapsed frame time so rotation speed is consistent across different display refresh rates.

Connector length is rendered with transform scaling instead of changing width every frame.

The projection math reuses the calculated sine and cosine values for each frame.

Depth ordering is only written when the calculated z index changes.

Interactive elements use event delegation instead of creating a separate click closure for every element.

Pointer events provide one input model for mouse, touch, and pen interaction.

Pointer capture keeps active gestures stable when the pointer leaves an element.

The animation honors the users reduced motion preference.

The animation loop resets its frame timing when the document becomes hidden.

## Architecture

The project deliberately keeps the custom 3D projection engine instead of moving to Three.js or another framework.

The helix is generated from procedural coordinates.

Camera rotation is handled with X and Y rotation math.

Perspective is calculated from depth.

The projected coordinates are mapped to DOM transforms.

The DOM is used as the rendering surface, which keeps the project dependency free and easy to inspect.

This architecture is appropriate for the current scale. A future high density molecular model would be a separate decision and could justify Canvas or WebGL.

## Performance notes

The current model contains 35 rungs, 70 nucleobase elements, and 35 connector elements.

The main runtime cost is the per frame projection and DOM transform updates.

The implementation avoids per frame layout changes for connector width and keeps animation work concentrated in transform and opacity updates.

The project should still be profiled on target devices before increasing model density.

## Run locally

Open index.html in a modern browser.

No build step or dependency installation is required.

## Project status

This version is a focused optimization pass.

The next stage, if needed, would be a separate feature phase rather than adding complexity to the current prototype.
