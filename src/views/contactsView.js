// contactsView.js — Project contacts list.
// - Every project has an internal contacts section (Solusign team) — auto-visible for all projects
// - Client contacts section — project-specific, linked via project_contacts table
// - Add new contact inline, mark as internal (visible everywhere) or client (this project only)

export function renderContacts({
  mount, people, project_contacts, projectId, project,
  db, onRerender,
}) {

  // Which people are "in" this project's contact list:
  // - All internal people (is_client === false) are automatically part of every project
  // - Client people linked via project_contacts
  const internalPeople = people.filter(p => !p.is_client);
  const clientLinkedIds = new Set(
    project_contacts.filter(pc => pc.project_id === projectId).map(pc => pc.person_id)
  );
  const clientPeople = people.filter(p => p.is_client && clientLinkedIds.has(p.id));

  const av = (p, sz = 36) =>
    `<div class="av" style="width:${sz}px;height:${sz}px;border-radius:50%;background:${p.color};
      display:inline-flex;align-items:center;justify-content:center;font-size:${Math.round(sz*.36)}px;
      font-weight:500;color:#fff">${p.initials}</div>`;

  const cardHTML = (p, kind) => `
    <div class="contact-card" data-person="${p.id}">
      ${av(p)}
      <div style="flex:1;min-width:0">
        <div class="contact-name">${p.name}</div>
        ${p.org ? `<div class="contact-org">${p.org}</div>` : ''}
        <span class="contact-role-badge ${kind === 'internal' ? 'contact-badge-int' : 'contact-badge-cli'}">
          <i class="ti ti-${kind === 'internal' ? 'building' : 'briefcase'}" style="font-size:10px"></i>
          ${kind === 'internal' ? 'Internal · Solusign' : 'Client'}
        </span>
      </div>
      ${kind === 'client' ? `<button class="contact-remove" data-person="${p.id}" title="Remove from this project"><i class="ti ti-x"></i></button>` : ''}
    </div>`;

  mount.innerHTML = `
    <div class="contacts-wrap">
      <div class="contacts-max">
        <div class="contacts-head">
          <div>
            <div class="contacts-title">Contacts</div>
            <div class="contacts-sub">${project?.name || 'This project'}</div>
          </div>
          <button class="btn" id="addContactBtn" style="height:36px;padding:0 18px;font-size:13px">
            <i class="ti ti-plus" style="font-size:12px"></i>Add contact
          </button>
        </div>

        <div class="contacts-section">
          <div class="contacts-section-title">
            <i class="ti ti-building" style="font-size:12px;color:#534AB7"></i>
            Internal · Solusign
            <span class="contacts-section-count">${internalPeople.length}</span>
          </div>
          ${internalPeople.length
            ? `<div class="contacts-grid">${internalPeople.map(p => cardHTML(p, 'internal')).join('')}</div>`
            : `<div class="contact-empty">No internal contacts yet. Add one — internal contacts appear on every project.</div>`}
        </div>

        <div class="contacts-section">
          <div class="contacts-section-title">
            <i class="ti ti-briefcase" style="font-size:12px;color:#BA7517"></i>
            Client · ${project?.client_org || 'This project'}
            <span class="contacts-section-count">${clientPeople.length}</span>
          </div>
          ${clientPeople.length
            ? `<div class="contacts-grid">${clientPeople.map(p => cardHTML(p, 'client')).join('')}</div>`
            : `<div class="contact-empty">No client contacts yet. Add one to make them available in this project's owner and attendee dropdowns.</div>`}
        </div>
      </div>
    </div>`;

  // ── Add contact ──
  mount.querySelector('#addContactBtn')?.addEventListener('click', () => {
    const name = prompt('Contact name:');
    if (!name || !name.trim()) return;
    const trimmedName = name.trim();

    const typeInput = prompt(
      'Is this contact internal (Solusign team) or a client?\n\n' +
      'Type "internal" or press Enter for client.'
    );
    const isInternal = (typeInput || '').trim().toLowerCase() === 'internal';

    let org = null;
    if (isInternal) {
      org = 'Solusign';
    } else {
      const inp = prompt(`Organisation (or leave blank for "${project?.client_org || 'Client'}"):`);
      org = (inp && inp.trim()) || project?.client_org || null;
    }

    const initials = trimmedName.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';
    const palette = ['#5B7FCC', '#5B9E7F', '#9B67C2', '#C47B3E', '#D4716A', '#7F77DD', '#1D9E75', '#BA7517'];
    const hash = [...trimmedName].reduce((a, c) => a + c.charCodeAt(0), 0);
    const color = palette[hash % palette.length];

    const newPerson = db.insert('people', {
      name: trimmedName, initials, color, is_client: !isInternal, org,
    });

    // Only link client contacts to this specific project.
    // Internal contacts are visible everywhere automatically.
    if (!isInternal) {
      db.insert('project_contacts', {
        project_id: projectId,
        person_id: newPerson.id,
      });
    }

    onRerender?.();
  });

  // ── Remove client contact from this project (does not delete the person) ──
  mount.querySelectorAll('.contact-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const personId = btn.dataset.person;
      const link = project_contacts.find(pc => pc.project_id === projectId && pc.person_id === personId);
      if (link && confirm('Remove this contact from the project?')) {
        db.remove('project_contacts', link.id);
        onRerender?.();
      }
    });
  });
}
