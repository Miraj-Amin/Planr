// modal.js — lightweight modal overlay for create/edit forms.
// position:fixed is fine in the hosted app (not a Claude widget).

let _current = null;

export function openModal({ title, fields, submitLabel = 'Create', onSubmit, wide = false }) {
  closeModal();

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px';

  const fieldsHTML = fields.map(f => {
    if (f.type === 'hidden') return '';
    const id = 'mf_' + f.key;
    const label = `<label style="display:block;font-size:12px;font-weight:500;color:#6B7280;margin-bottom:5px" for="${id}">${f.label}${f.required?` <span style="color:#E24B4A">*</span>`:''}</label>`;
    let input = '';
    const base = `style="width:100%;height:38px;padding:0 10px;border:.5px solid rgba(0,0,0,.2);border-radius:7px;font-size:13px;font-family:inherit;outline:none;color:#1A1A22;background:#fff"`;
    const taBase = `style="width:100%;padding:8px 10px;border:.5px solid rgba(0,0,0,.2);border-radius:7px;font-size:13px;font-family:inherit;outline:none;color:#1A1A22;background:#fff;resize:vertical;min-height:72px"`;
    if (f.type === 'text' || f.type === 'date' || f.type === 'time' || f.type === 'number') {
      input = `<input id="${id}" type="${f.type}" ${base} ${f.value!=null?`value="${f.value}"`:''}  placeholder="${f.placeholder||''}" ${f.min!=null?`min="${f.min}"`:''}  ${f.step?`step="${f.step}"`:''}  ${f.required?'required':''}>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${id}" ${taBase} placeholder="${f.placeholder||''}">${f.value||''}</textarea>`;
    } else if (f.type === 'select') {
      const opts = (f.options||[]).map(o => `<option value="${o.value}" ${o.value==f.value?'selected':''}>${o.label}</option>`).join('');
      input = `<select id="${id}" ${base} style="width:100%;height:38px;padding:0 10px;border:.5px solid rgba(0,0,0,.2);border-radius:7px;font-size:13px;font-family:inherit;outline:none;color:#1A1A22;background:#fff;cursor:pointer">
        ${f.placeholder?`<option value="">${f.placeholder}</option>`:''}${opts}</select>`;
    } else if (f.type === 'multi') {
      const opts = (f.options||[]).map(o => `<label style="display:flex;align-items:center;gap:7px;padding:5px 0;cursor:pointer">
        <input type="checkbox" value="${o.value}" ${(f.value||[]).includes(o.value)?'checked':''} style="width:14px;height:14px;accent-color:#534AB7">
        <span style="font-size:13px;color:#1A1A22">${o.label}</span></label>`).join('');
      input = `<div id="${id}" style="border:.5px solid rgba(0,0,0,.2);border-radius:7px;padding:6px 10px;max-height:140px;overflow-y:auto">${opts}</div>`;
    }
    const hint = f.hint ? `<div style="font-size:11px;color:#9CA3AF;margin-top:4px">${f.hint}</div>` : '';
    return `<div style="margin-bottom:16px">${label}${input}${hint}</div>`;
  }).join('');

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:24px 24px 20px;width:100%;max-width:${wide?560:440}px;max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div style="font-size:16px;font-weight:500;color:#1A1A22">${title}</div>
        <button id="modal-x" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;padding:2px 6px;border-radius:6px;line-height:1">&times;</button>
      </div>
      <div id="modal-err" style="display:none;background:rgba(226,75,74,.08);color:#A32D2D;font-size:12.5px;padding:8px 12px;border-radius:7px;margin-bottom:14px"></div>
      ${fieldsHTML}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px">
        <button id="modal-cancel" style="height:36px;padding:0 16px;background:none;border:.5px solid rgba(0,0,0,.15);border-radius:7px;font-size:13px;cursor:pointer;color:#6B7280">Cancel</button>
        <button id="modal-submit" style="height:36px;padding:0 18px;background:#534AB7;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:500;cursor:pointer">${submitLabel}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  _current = overlay;

  const firstInput = overlay.querySelector('input:not([type=checkbox]),select,textarea');
  if (firstInput) setTimeout(() => firstInput.focus(), 50);

  function getValue(f) {
    const el = overlay.querySelector('#mf_' + f.key);
    if (!el) return f.value ?? null;
    if (f.type === 'multi') {
      return [...el.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);
    }
    if (f.type === 'number') return el.value ? +el.value : null;
    return el.value || null;
  }

  function showErr(msg) {
    const e = overlay.querySelector('#modal-err');
    e.textContent = msg; e.style.display = 'block';
  }

  overlay.querySelector('#modal-x').onclick = closeModal;
  overlay.querySelector('#modal-cancel').onclick = closeModal;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  overlay.querySelector('#modal-submit').onclick = async () => {
    const data = {};
    let err = null;
    for (const f of fields) {
      data[f.key] = getValue(f);
      if (f.required && (data[f.key] === null || data[f.key] === '' || (Array.isArray(data[f.key]) && !data[f.key].length))) {
        err = `${f.label} is required.`; break;
      }
    }
    if (err) { showErr(err); return; }
    const btn = overlay.querySelector('#modal-submit');
    btn.disabled = true; btn.textContent = 'Saving…';
    try { await onSubmit(data); closeModal(); }
    catch(e) { showErr(e.message||'Something went wrong.'); btn.disabled=false; btn.textContent=submitLabel; }
  };

  document.addEventListener('keydown', _escHandler);
}

function _escHandler(e) { if (e.key === 'Escape') closeModal(); }

export function closeModal() {
  if (_current) { _current.remove(); _current = null; }
  document.removeEventListener('keydown', _escHandler);
}
