export function allowedOrigin(origin) {
 return origin === null || ['https://codevalanche.com','https://www.codevalanche.com','https://account.codevalanche.com'].includes(origin);
}
export function normalizeProfile(body) {
 const result = {};
 for (const [input, output, limit] of [['displayName','display_name',80],['bio','bio',500]]) {
  if (body[input] !== undefined) { if(typeof body[input] !== 'string' || body[input].length > limit) throw new Error('Invalid profile'); result[output] = body[input].trim(); }
 }
 if (!Object.keys(result).length) throw new Error('Empty profile');
 return result;
}
// Decode only AFTER the Auth server has validated this exact token via getUser.
export function readClaims(token) {
 const parts=token.split('.'); if(parts.length!==3) throw new Error('Invalid token');
 return JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
}
