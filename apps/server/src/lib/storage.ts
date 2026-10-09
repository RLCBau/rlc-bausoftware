/**
 * Compatibility facade for legacy imports.
 * All storage presigning must go through the central provider-backed lib/s3.
 */
export { presignPut, presignGet } from "./s3";
