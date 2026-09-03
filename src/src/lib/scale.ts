/**
 * How many pixels a millimetre is drawn at.
 *
 * CSS defines its pixel against a reference of 96 per inch, so a millimetre is 96 / 25.4 CSS
 * pixels and nothing else: the browser applies whatever device-pixel ratio and page zoom the
 * reader has on top, and a `1mm` length in a stylesheet resolves through exactly this number.
 * Drawing at it is what makes 100% mean 100%.
 *
 * What it cannot promise is the monitor. The CSS reference pixel is a convention, not a
 * measurement -- a 27" panel at 2560x1440 and a 24" panel at the same resolution report the same
 * pixels for different physical inches, and no web page can tell them apart. So a cartridge shown
 * at 100% here is life size on a display whose real pixel density matches the reference, and off
 * by whatever that display departs from it. Held against a ruler it is close on most desktop
 * monitors and visibly small on a high-density laptop panel that has not been zoomed. Making it
 * exact everywhere needs a calibration step -- the reader dragging a slider until a drawn
 * hundred-millimetre bar measures a hundred millimetres -- which this does not yet have.
 */
export const PX_PER_MM = 96 / 25.4;
