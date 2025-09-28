export function preserveParams(url) {
  const qs = location.search || '';
  const hash = location.hash || '';
  return url + qs + hash;
}

export function go(url) {
  location.href = preserveParams(url);
}
