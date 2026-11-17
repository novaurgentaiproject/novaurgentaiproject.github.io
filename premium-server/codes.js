// Nova Premium codes, stored as SHA-256 hashes so they can't be read from this
// public repository. Each code unlocks Premium (with the small monthly Martia
// allowance in CODE_AI_BUDGET); delete a line to switch that code off.
//
// A code's hash is taken in upper case with everything except letters and digits
// removed, for example (in a terminal):
//   printf '%s' 'NOVA-ABCD-EFGH-JKLM' | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z0-9' | shasum -a 256
// Use long random codes (12 or more letters and digits after NOVA): short ones can
// be guessed from their hash. Codes in the PREMIUM_CODES setting work too.
export const CODE_HASHES = [
  'a91c63608195bd3af3625fd04ecc04f10da58d2be4a12f05d935312658d54d71', // code 1
  '8301281c734d9ef9226f2ea4fb13d4739e4635df4234799228e87393a707b66e', // code 2
  'c1703955878b7f1e3b2fecef1b77f879b0ccfb154aa4798d2f31377d96becf84', // code 3
  '68ad77b93d401ec74f6e11801a4bed9f73fa8e8e843a011f7d994d1c80321a76', // code 4
  'dd2348c21816b7bf022faa8f7600a97a04e94940a3e94997ad4252882765ea2e', // code 5
  '90c0d29acad402a1d1b79ba1dd37ec0c364663da810f32b64a6acf8929e1987d', // code 6
];
