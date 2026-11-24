const SOURCES = {
  openFDA: 'https://api.fda.gov/drug/label.json',
  rxnorm: 'https://rxnav.nlm.nih.gov/REST/rxcui.json',
  pubmed: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
  trials: 'https://clinicaltrials.gov/api/v2/studies'
};
const AUDIT_KEY = 'patasi-bai-safety-audit-v1';
const form = document.querySelector('#scan-form');
const button = document.querySelector('#scan-button');
const result = document.querySelector('#result');
const auditList = document.querySelector('#audit-list');

function esc(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function readAudit() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveAudit(item) {
  try {
    const next = [item, ...readAudit()].slice(0, 30);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(next));
    renderAudit();
    return true;
  } catch { return false; }
}
function renderAudit() {
  const items = readAudit();
  auditList.innerHTML = items.length ? items.map(item => `<li><div><strong>${esc(item.medicine || 'Unknown medicine')}</strong><br><span class="muted">Batch ${esc(item.batch || 'Not recorded')} · ${esc(item.status || 'NO DATA')}</span><br><span class="muted">${esc(item.reviewStatus || 'PHARMACIST REVIEW PENDING')}</span></div><div class="audit-meta">${esc(item.time || 'Time not recorded')}<br>${esc(item.sources || 'none')}</div></li>`).join('') : '<li class="empty">No scans recorded yet.</li>';
}
function sourceCard(name, state, detail) { return `<div class="source-card"><strong>${esc(name)}</strong><small class="${state === 'found' ? 'source-ok' : 'source-none'}">${esc(state === 'found' ? 'Evidence found' : 'No match / unavailable')}</small><br><small>${esc(detail)}</small></div>`; }
async function getJson(url) { const response = await fetch(url, {headers:{Accept:'application/json'}}); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }
async function scan(medicine, batch) {
  const q = encodeURIComponent(medicine);
  const requests = await Promise.allSettled([
    getJson(`${SOURCES.openFDA}?search=openfda.brand_name:%22${q}%22+OR+openfda.generic_name:%22${q}%22&limit=1`),
    getJson(`${SOURCES.rxnorm}?name=${q}`),
    getJson(`${SOURCES.pubmed}?db=pubmed&term=${q}&retmode=json&retmax=1`),
    getJson(`${SOURCES.trials}?query.term=${q}&pageSize=1`)
  ]);
  const [fda, rxnorm, pubmed, trials] = requests;
  const fdaFound = fda.status === 'fulfilled' && (fda.value.results || []).length > 0;
  const rxFound = rxnorm.status === 'fulfilled' && Boolean(rxnorm.value.idGroup?.rxnormId?.length);
  const pubFound = pubmed.status === 'fulfilled' && Number(pubmed.value.esearchresult?.count || 0) > 0;
  const trialsFound = trials.status === 'fulfilled' && (trials.value.studies || []).length > 0;
  const authorityMatch = fdaFound || rxFound;
  const noData = requests.every(request => request.status === 'rejected');
  const status = noData ? 'NO DATA' : authorityMatch ? 'TRUSTED MATCH' : 'FLAGGED RISK — PHARMACIST REVIEW REQUIRED';
  const statusClass = noData ? 'review' : authorityMatch ? 'trusted' : 'risk';
  const details = [];
  if (fdaFound) details.push('OpenFDA returned a label record for this medicine name.');
  if (rxFound) details.push(`RxNorm matched concept ID ${rxnorm.value.idGroup.rxnormId[0]}.`);
  if (noData) details.push('All configured public sources were unavailable, so no evidence decision was possible.');
  else if (!authorityMatch) details.push('No authoritative medicine identity match was found in OpenFDA or RxNorm.');
  if (authorityMatch) details.push(`Batch ${batch} was not authenticated: these public sources do not provide proof that a physical batch is genuine.`);
  result.className = `result-panel ${statusClass}`;
  result.hidden = false;
  result.innerHTML = `<div class="result-head"><div><p class="eyebrow">SCAN RESULT</p><h2>${esc(medicine)}</h2></div><span class="status">${status}</span></div><p>${noData ? 'No source data was available. Do not make a safety or authenticity decision from this result.' : authorityMatch ? 'The medicine identity has supporting public evidence, but the physical batch remains unverified.' : 'Treat this as a risk signal. Do not dispense or escalate until a pharmacist reviews the package and authoritative records.'}</p><div class="source-grid">${sourceCard('OpenFDA', fdaFound ? 'found' : 'none', fdaFound ? 'Label record' : fda.reason?.message || 'No label')}${sourceCard('RxNorm', rxFound ? 'found' : 'none', rxFound ? `RxCUI ${rxnorm.value.idGroup.rxnormId[0]}` : rxnorm.reason?.message || 'No concept')}${sourceCard('PubMed', pubFound ? 'found' : 'none', pubFound ? `${pubmed.value.esearchresult.count} records` : pubmed.reason?.message || 'No literature')}${sourceCard('ClinicalTrials.gov', trialsFound ? 'found' : 'none', trialsFound ? 'Study record' : trials.reason?.message || 'No study')}</div><ul class="evidence-list">${details.map(d => `<li>${esc(d)}</li>`).join('')}</ul><div class="review-box"><strong>Pharmacist review gate — pending</strong><span>Before any dispensing or escalation, confirm:</span><ul class="review-checklist"><li>product name, strength, manufacturer, and expiry</li><li>packaging integrity and purchase trail</li><li>the applicable national regulator record</li></ul><span>Record the final pharmacist decision outside this prototype.</span></div>`;
  const auditSaved = saveAudit({medicine, batch, status, reviewStatus: 'PHARMACIST REVIEW PENDING', sources: [fdaFound?'FDA':'',rxFound?'RxNorm':'',pubFound?'PubMed':'',trialsFound?'Trials':''].filter(Boolean).join(', ') || 'none', time: new Date().toLocaleString()});
  if (!auditSaved) result.insertAdjacentHTML('beforeend', '<p class="muted" role="alert"><strong>Audit warning:</strong> this result could not be saved in this browser. Do not rely on the local audit trail.</p>');
}
form.addEventListener('submit', async event => { event.preventDefault(); const medicine = document.querySelector('#medicine').value.trim(); const batch = document.querySelector('#batch').value.trim(); if (!medicine || !batch) { result.hidden = false; result.className = 'result-panel risk'; result.innerHTML = '<strong>Medicine name and batch number are required.</strong>'; return; } button.disabled = true; button.textContent = 'Checking trusted sources…'; try { await scan(medicine, batch); } catch (error) { result.hidden = false; result.className = 'result-panel risk'; result.innerHTML = `<strong>Unable to complete the source check.</strong><p>${esc(error.message)}. No verification claim was made. Try again or route to pharmacist review.</p>`; } finally { button.disabled = false; button.innerHTML = 'Run evidence check <span aria-hidden="true">→</span>'; } });
document.querySelector('#clear-audit').addEventListener('click', () => { try { localStorage.removeItem(AUDIT_KEY); } finally { renderAudit(); } });
renderAudit();
