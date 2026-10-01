import createHash from 'create-hash/browser.js';
import randomBytes from 'randombytes/browser.js';

// ExcelJS sheet protection only needs hashes and cryptographically secure random bytes.
// Do not ship crypto-browserify's unrelated signing/ECDH implementations.
export { createHash, randomBytes };

export function getHashes() {
  return ['sha1', 'sha224', 'sha256', 'sha384', 'sha512', 'md5', 'rmd160', 'ripemd160'];
}
