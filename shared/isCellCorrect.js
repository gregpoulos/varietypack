function isCellCorrect(typed, letter) {
  return typed.toLowerCase() === letter.toLowerCase();
}
if (typeof module !== 'undefined') module.exports = isCellCorrect;
