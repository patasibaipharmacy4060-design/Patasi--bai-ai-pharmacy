import assert from 'node:assert/strict';

const urls = {
  openFDA: 'https://api.fda.gov/drug/label.json?search=openfda.brand_name:%22aspirin%22&limit=1',
  rxnorm: 'https://rxnav.nlm.nih.gov/REST/rxcui.json?name=aspirin',
  pubmed: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=aspirin&retmode=json&retmax=1',
  trials: 'https://clinicaltrials.gov/api/v2/studies?query.term=aspirin&pageSize=1'
};
for (const [name, url] of Object.entries(urls)) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  assert.equal(response.ok, true, `${name} returned ${response.status}`);
  const body = await response.json();
  assert.ok(body && typeof body === 'object', `${name} did not return JSON`);
  console.log(`${name}: HTTP ${response.status} OK`);
}
console.log('scanner smoke test: PASS');
