import { openModal } from './modal.js';
// contactsView.js — Project contacts list.
// Rules:
//  - Internal contacts (is_client=false) are visible on EVERY project automatically.
//    They are NOT stored in project_contacts.
//  - Client contacts (is_client=true) are strictly per-project via project_contacts.
//    A client added to Project A is NOT visible on Project B — no cross-project linking.
//  - The Delete button removes the person record entirely (from every project).
//  - The Remove button (client contacts only) unlinks from THIS project only.

export function renderContacts({
  mount, people, project_contacts, projectId, project,
  db, onRerender,
}) {

  // Internal contacts are global — always visible.
  const internalPeople = people.filter(p => !p.is_client);

  // Client contacts must be explicitly linked to THIS project.
  const linkedClientIds = new Set(
    project_contacts.filter(pc => pc.project_id === projectId).map(pc => pc.person_id)
  );
  const clientPeople = people.filter(p => p.is_client && linkedClientIds.has(p.id));

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
        ${p.email ? `<div class="contact-org" style="font-family:monospace;font-size:11px">${p.email}</div>` : ''}
        <span class="contact-role-badge ${kind === 'internal' ? 'contact-badge-int' : 'contact-badge-cli'}">
          <i class="ti ti-${kind === 'internal' ? 'building' : 'briefcase'}" style="font-size:10px"></i>
          ${kind === 'internal' ? 'Internal · Solusign' : 'Client'}
        </span>
      </div>
      <div class="contact-actions">
        ${kind === 'client'
          ? `<button class="contact-unlink" data-person="${p.id}" title="Remove from this project (keep contact)">
              <i class="ti ti-unlink" style="font-size:13px"></i>
            </button>`
          : ''}
        <button class="contact-delete" data-person="${p.id}" title="Delete contact permanently">
          <i class="ti ti-trash" style="font-size:13px"></i>
        </button>
      </div>
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
            : `<div class="contact-empty">No internal contacts. Add one — internal contacts appear on every project.</div>`}
        </div>

        <div class="contacts-section">
          <div class="contacts-section-title">
            <i class="ti ti-briefcase" style="font-size:12px;color:#BA7517"></i>
            Client · ${project?.client_org || 'This project'}
            <span class="contacts-section-count">${clientPeople.length}</span>
          </div>
          ${clientPeople.length
            ? `<div class="contacts-grid">${clientPeople.map(p => cardHTML(p, 'client')).join('')}</div>`
            : `<div class="contact-empty">No client contacts on this project yet.</div>`}
        </div>
      </div>
    </div>`;

  // ── Add contact via modal ──
  mount.querySelector('#addContactBtn')?.addEventListener('click', () => {
    openModal({
      title: 'Add contact',
      fields: [
        {
          key: 'name',
          label: 'Full name',
          type: 'text',
          required: true,
          placeholder: 'e.g. Alice Smith',
        },
        {
          key: 'kind',
          label: 'Type',
          type: 'select',
          value: 'client',
          options: [
            { value: 'client',   label: `Client · ${project?.client_org || 'this project only'}` },
            { value: 'internal', label: 'Internal · Solusign · visible on every project' },
          ],
        },
        {
          key: 'org',
          label: 'Organisation',
          type: 'text',
          placeholder: `Default: ${project?.client_org || 'Client'} for client, Solusign for internal`,
          hint: 'Leave blank to use the default for the type above.',
        },
        {
          key: 'email',
          label: 'Email',
          type: 'text',
          placeholder: 'Optional',
        },
      ],
      submitLabel: 'Add contact',
      onSubmit: data => {
        const name = (data.name || '').trim();
        if (!name) return;
        const isInternal = data.kind === 'internal';
        const org = (data.org && data.org.trim())
          ? data.org.trim()
          : (isInternal ? 'Solusign' : (project?.client_org || null));

        const initials = name.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';
        const palette = ['#5B7FCC', '#5B9E7F', '#9B67C2', '#C47B3E', '#D4716A', '#7F77DD', '#1D9E75', '#BA7517'];
        const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
        const color = palette[hash % palette.length];

        const newPerson = db.insert('people', {
          name, initials, color, is_client: !isInternal, org,
          email: (data.email || '').trim() || null,
        });

        // Only client contacts get linked to a specific project.
        // Internal contacts are global — no link needed.
        if (!isInternal) {
          db.insert('project_contacts', {
            project_id: projectId,
            person_id: newPerson.id,
          });
        }

        onRerender?.();
      },
    });
  });

  // ── Unlink client contact from this project (keeps the person record) ──
  mount.querySelectorAll('.contact-unlink').forEach(btn => {
    btn.addEventListener('click', () => {
      const personId = btn.dataset.person;
      const link = project_contacts.find(pc => pc.project_id === projectId && pc.person_id === personId);
      if (link && confirm('Remove this contact from the project?\n\nThe contact record itself will be kept.')) {
        db.remove('project_contacts', link.id);
        onRerender?.();
      }
    });
  });

  // ── Delete a contact entirely (person + all project_contacts links) ──
  mount.querySelectorAll('.contact-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const personId = btn.dataset.person;
      const person = people.find(p => p.id === personId);
      if (!person) return;
      const isInternal = !person.is_client;
      const warning = isInternal
        ? `Delete ${person.name}?\n\nInternal contacts are visible on every project — this will remove them from every project.`
        : `Delete ${person.name}?\n\nThis will permanently delete the contact record.`;
      if (!confirm(warning)) return;

      // Remove any project_contacts links first (Postgres FK cascade handles this too,
      // but we need to update local cache for immediate UI response)
      const links = project_contacts.filter(pc => pc.person_id === personId);
      links.forEach(l => db.remove('project_contacts', l.id));
      db.remove('people', personId);
      onRerender?.();
    });
  });
}
