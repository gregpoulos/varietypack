// The Unicode half of normalization, shared with the answer parser: NFKD splits an
// accented letter into its base letter plus combining marks (é → e + ◌́) and maps
// compatibility forms to plain ones (ﬁ → fi, full-width letters and brackets → ASCII);
// the marks are then dropped. Case and punctuation are left alone.
function foldLetters(str) {
  return str.normalize('NFKD').replace(/\p{M}/gu, '');
}

// Answers and typed letters reduce to a–z and 0–9: fold, lowercase, drop everything
// else. A character with no such form (æ, ß, Greek, ½) is dropped too — parseAnswerCells
// rejects it in an answer, so only stray typed input ever reaches that case.
function normalize(str) {
  return foldLetters(str).toLowerCase().replace(/[^a-z0-9]/g, '');
}
export { normalize, foldLetters };
