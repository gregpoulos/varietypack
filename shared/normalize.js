function normalize(str) {
  return str.toLowerCase().replace(/[^a-z]/g, '');
}
if (typeof module !== 'undefined') module.exports = normalize;
