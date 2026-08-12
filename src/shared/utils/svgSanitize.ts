// src/shared/utils/svgSanitize.ts
//
// CineLog V2 — SVG Sanitization Utility
// ---------------------------------------------------------------------
// Sanitizes uploaded SVG files to prevent XSS attacks while
// preserving visual quality.
//
// SECURITY REQUIREMENTS:
//   • Remove <script> elements
//   • Remove event-handler attributes (onclick, onload, onerror, etc.)
//   • Remove javascript: URLs in href/xlink:href attributes
//   • Remove dangerous external references (xlink:href to external)
//   • Remove data: URLs in href attributes (could contain scripts)
//   • Preserve viewBox, paths, shapes, gradients, styles, etc.
//   • Preserve visual quality — only strip dangerous content

/**
 * Set of SVG elements that are allowed.
 * Anything not in this set is removed.
 */
const ALLOWED_SVG_ELEMENTS = new Set([
  "svg", "g", "path", "circle", "ellipse", "line", "polyline", "polygon",
  "rect", "text", "tspan", "textPath", "defs", "clipPath", "mask",
  "linearGradient", "radialGradient", "stop", "pattern", "use", "image",
  "symbol", "title", "desc", "style", "transform", "filter",
  "feGaussianBlur", "feOffset", "feComposite", "feMerge", "feMergeNode",
  "feColorMatrix", "feFlood", "feBlend", "feTurbulence", "feDisplacementMap",
  "feImage", "feMorphology", "feSpecularLighting", "feDiffuseLighting",
  "fePointLight", "feDistantLight", "feSpotLight", "feConvolveMatrix",
  "feComponentTransfer", "feFuncR", "feFuncG", "feFuncB", "feFuncA",
  "animate", "animateTransform", "animateMotion", "set", "mpath",
  "marker", "pathLength",
]);

/**
 * Attributes that are always removed (event handlers and dangerous attrs).
 * The pattern matches any attribute starting with "on" (case-insensitive).
 */
const DANGEROUS_ATTR_PATTERNS = [
  /^on/i,                    // onclick, onload, onerror, etc.
  /^xlink:href$/i,          // xlink:href with external/script references
];

/**
 * Check if an attribute value contains a dangerous URL.
 * Blocks javascript:, data:, and vbscript: URLs.
 */
function hasDangerousUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("vbscript:")
  );
}

/**
 * Check if an attribute name is dangerous.
 */
function isDangerousAttr(name: string): boolean {
  return DANGEROUS_ATTR_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Sanitize an SVG string by removing dangerous elements and attributes.
 *
 * This uses a simple regex-based approach rather than DOMParser to
 * avoid accidentally executing scripts during parsing. We:
 *   1. Remove all <script> elements and their contents
 *   2. Parse remaining tags and filter by element allowlist
 *   3. Strip event-handler and dangerous attributes
 *   4. Validate href/src attributes
 *
 * @param svgText The raw SVG file content.
 * @returns Sanitized SVG string, or null if the input is not valid SVG.
 */
export function sanitizeSvg(svgText: string): string | null {
  if (typeof svgText !== "string" || svgText.length === 0) {
    return null;
  }

  // Quick check — must contain <svg
  if (!/<svg[\s>]/i.test(svgText)) {
    return null;
  }

  // Size check — reject SVGs larger than 100KB
  if (svgText.length > 100 * 1024) {
    return null;
  }

  let cleaned = svgText;

  // 1. Remove <script> elements and their contents
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script\s*>/gi, "");

  // 2. Remove <!DOCTYPE>, <?xml?>, and HTML comments (not dangerous but unnecessary)
  cleaned = cleaned.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  cleaned = cleaned.replace(/<\?xml[\s\S]*?\?>/gi, "");
  // Remove comments — but be careful not to remove SVG content
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

  // 3. Process each tag to filter elements and attributes
  // We do a pass to remove disallowed elements entirely
  cleaned = cleaned.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tagName) => {
    // Keep the tag if it's in the allowlist
    if (ALLOWED_SVG_ELEMENTS.has(tagName.toLowerCase())) {
      return match;
    }
    // Remove unknown/dangerous elements
    return "";
  });

  // 4. Remove dangerous attributes from remaining tags
  // Match any attribute-like pattern: name="value" or name='value' or name=value
  cleaned = cleaned.replace(
    /(<[a-zA-Z][a-zA-Z0-9]*)\s+([^>]*)(>)/g,
    (_match, openTag, attrsStr, closeTag) => {
      // Parse and filter attributes
      const safeAttrs = filterAttributes(attrsStr);
      return `${openTag}${safeAttrs ? " " + safeAttrs : ""}${closeTag}`;
    }
  );

  // 5. Validate the result still has an <svg> root
  if (!/<svg[\s>]/i.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Filter attributes in a tag, removing dangerous ones.
 */
function filterAttributes(attrsStr: string): string {
  // Match attributes: name="value", name='value', name=value, or just name (boolean)
  const attrRegex = /([a-zA-Z_][\w:.-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  const safeAttrs: string[] = [];

  let match;
  while ((match = attrRegex.exec(attrsStr)) !== null) {
    const name = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? "";

    // Skip dangerous attributes
    if (isDangerousAttr(name)) {
      continue;
    }

    // For href/src/action attributes, check for dangerous URLs
    const lowerName = name.toLowerCase();
    if (
      (lowerName === "href" || lowerName === "src" || lowerName === "action" || lowerName === "xlink:href") &&
      hasDangerousUrl(value)
    ) {
      continue;
    }

    // For xlink:href, also block external references (only allow # fragment refs)
    if (lowerName === "xlink:href" && value && !value.startsWith("#")) {
      continue;
    }

    // Reconstruct the attribute
    if (match[2] !== undefined) {
      safeAttrs.push(`${name}="${value}"`);
    } else if (match[3] !== undefined) {
      safeAttrs.push(`${name}='${value}'`);
    } else if (match[4] !== undefined) {
      safeAttrs.push(`${name}=${value}`);
    } else {
      safeAttrs.push(name);
    }
  }

  return safeAttrs.join(" ");
}

/**
 * Validate that a string looks like a valid SVG file.
 * Checks for basic SVG structure without full parsing.
 *
 * @param svgText The SVG content to validate.
 * @returns True if the content appears to be a valid SVG.
 */
export function isValidSvg(svgText: string): boolean {
  if (typeof svgText !== "string" || svgText.length === 0) return false;
  if (svgText.length > 100 * 1024) return false;
  if (!/<svg[\s>]/i.test(svgText)) return false;
  if (!/<\/svg\s*>/i.test(svgText)) return false;
  return true;
}
